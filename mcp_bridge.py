"""Combined MCP bridge and custom REST API for nova-opencode."""

from __future__ import annotations

import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel

OPENCODE_HOST = os.environ.get("OPENCODE_HOST", "127.0.0.1")
OPENCODE_PORT = os.environ.get("OPENCODE_PORT", "4096")
OPENCODE_BASE = f"http://{OPENCODE_HOST}:{OPENCODE_PORT}"

MCP_BRIDGE_PORT = int(os.environ.get("MCP_BRIDGE_PORT", "8081"))
BASE_PATH = os.environ.get("BASE_PATH", "/cell/nova-opencode")
WORKSPACE_DIR = Path(os.environ.get("WORKSPACE_DIR", "/workspace"))
STATE_DIR = WORKSPACE_DIR / ".nova-opencode"
DB_PATH = STATE_DIR / "state.db"

OPENCODE_USERNAME = os.environ.get("OPENCODE_SERVER_USERNAME", "")
OPENCODE_PASSWORD = os.environ.get("OPENCODE_SERVER_PASSWORD", "")
LANES = ("later", "next", "now")


class CreateSessionRequest(BaseModel):
    lane: str


class MoveSessionRequest(BaseModel):
    lane: str
    afterId: str | None = None


class SessionBoardRecord(BaseModel):
    session_id: str
    lane: str
    archived: bool
    sort_order: float
    last_lane: str | None
    updated_at: str
    archived_at: str | None


def _auth() -> httpx.BasicAuth | None:
    if OPENCODE_PASSWORD:
        return httpx.BasicAuth(OPENCODE_USERNAME or "user", OPENCODE_PASSWORD)
    return None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=OPENCODE_BASE, auth=_auth(), timeout=120.0)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _ensure_db() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS session_board_state (
                session_id TEXT PRIMARY KEY,
                lane TEXT NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0,
                sort_order REAL NOT NULL DEFAULT 0,
                last_lane TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT
            )
            """
        )
        conn.commit()


def _row_to_record(row: sqlite3.Row) -> SessionBoardRecord:
    return SessionBoardRecord(
        session_id=row["session_id"],
        lane=row["lane"],
        archived=bool(row["archived"]),
        sort_order=row["sort_order"],
        last_lane=row["last_lane"],
        updated_at=row["updated_at"],
        archived_at=row["archived_at"],
    )


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _normalize_lane(value: str) -> str:
    lane = value.lower().strip()
    if lane not in LANES:
        raise HTTPException(status_code=400, detail=f"Invalid lane: {value}")
    return lane


def _get_record(session_id: str) -> SessionBoardRecord | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM session_board_state WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    return _row_to_record(row) if row else None


def _upsert_session_state(
    session_id: str,
    lane: str,
    archived: bool,
    sort_order: float | None = None,
    last_lane: str | None = None,
) -> None:
    now = _utc_now()
    lane = _normalize_lane(lane)
    with _db() as conn:
        existing = conn.execute(
            "SELECT * FROM session_board_state WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if sort_order is None:
            if existing:
                sort_order = existing["sort_order"]
            else:
                max_row = conn.execute(
                    "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM session_board_state WHERE lane = ? AND archived = 0",
                    (lane,),
                ).fetchone()
                sort_order = float(max_row["max_order"] or 0) + 1024.0
        if existing:
            conn.execute(
                """
                UPDATE session_board_state
                SET lane = ?, archived = ?, sort_order = ?, last_lane = ?, updated_at = ?, archived_at = ?
                WHERE session_id = ?
                """,
                (
                    lane,
                    1 if archived else 0,
                    sort_order,
                    last_lane,
                    now,
                    now if archived else None,
                    session_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO session_board_state (
                    session_id, lane, archived, sort_order, last_lane, created_at, updated_at, archived_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    lane,
                    1 if archived else 0,
                    sort_order,
                    last_lane,
                    now,
                    now,
                    now if archived else None,
                ),
            )
        conn.commit()


def _archive_session_state(session_id: str) -> None:
    record = _get_record(session_id)
    last_lane = record.lane if record else "next"
    _upsert_session_state(session_id, last_lane, archived=True, last_lane=last_lane)


def _restore_session_state(session_id: str) -> None:
    record = _get_record(session_id)
    if not record:
        _upsert_session_state(session_id, "next", archived=False, last_lane="next")
        return
    restore_lane = record.last_lane or record.lane or "next"
    _upsert_session_state(
        session_id, restore_lane, archived=False, last_lane=restore_lane
    )


def _reorder_session_state(session_id: str, lane: str, after_id: str | None) -> None:
    lane = _normalize_lane(lane)
    with _db() as conn:
        rows = conn.execute(
            "SELECT session_id, sort_order FROM session_board_state WHERE lane = ? AND archived = 0 ORDER BY sort_order ASC",
            (lane,),
        ).fetchall()
        if after_id:
            after_index = next(
                (
                    index
                    for index, row in enumerate(rows)
                    if row["session_id"] == after_id
                ),
                None,
            )
            if after_index is None:
                sort_order = float(rows[-1]["sort_order"] + 1024.0) if rows else 1024.0
            else:
                prev_order = float(rows[after_index]["sort_order"])
                next_order = (
                    float(rows[after_index + 1]["sort_order"])
                    if after_index + 1 < len(rows)
                    else prev_order + 1024.0
                )
                sort_order = (prev_order + next_order) / 2.0
        else:
            first = rows[0]["sort_order"] if rows else 1024.0
            sort_order = float(first) / 2.0 if rows else 1024.0
    _upsert_session_state(
        session_id, lane, archived=False, sort_order=sort_order, last_lane=lane
    )


def _extract_title(session: dict[str, Any], messages: list[dict[str, Any]]) -> str:
    title = session.get("title") or session.get("name")
    if isinstance(title, str) and title.strip():
        return title.strip()
    for message in messages:
        for part in message.get("parts", []) or []:
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                line = text.strip().splitlines()[0]
                return line[:80]
    return "Untitled conversation"


def _extract_preview(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        for part in message.get("parts", []) or []:
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip().replace("\n", " ")[:180]
    return ""


async def _fetch_sessions() -> list[dict[str, Any]]:
    async with _client() as client:
        response = await client.get("/session")
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else []


async def _fetch_messages(session_id: str, limit: int = 25) -> list[dict[str, Any]]:
    async with _client() as client:
        response = await client.get(
            f"/session/{session_id}/message", params={"limit": limit}
        )
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else []


async def _fetch_session_detail(session_id: str) -> dict[str, Any]:
    async with _client() as client:
        session_response = await client.get(f"/session/{session_id}")
        session_response.raise_for_status()
        session = session_response.json()

        messages_response = await client.get(f"/session/{session_id}/message")
        messages_response.raise_for_status()
        messages = messages_response.json()
        return {
            "id": session_id,
            "title": _extract_title(
                session, messages if isinstance(messages, list) else []
            ),
            "updatedAt": session.get("time", {}).get("updated")
            if isinstance(session.get("time"), dict)
            else None,
            "messages": messages if isinstance(messages, list) else [],
        }


async def _build_session_summary(session: dict[str, Any]) -> dict[str, Any]:
    session_id = session.get("id")
    if not isinstance(session_id, str):
        raise HTTPException(status_code=500, detail="Invalid session id")
    record = _get_record(session_id)
    messages = await _fetch_messages(session_id, limit=20)
    lane = record.lane if record else "next"
    return {
        "id": session_id,
        "title": _extract_title(session, messages),
        "preview": _extract_preview(messages),
        "updatedAt": session.get("time", {}).get("updated")
        if isinstance(session.get("time"), dict)
        else None,
        "lane": lane,
        "archived": record.archived if record else False,
        "running": bool(session.get("status") not in (None, "idle", "complete")),
        "messageCount": len(messages),
    }


async def _board_payload() -> dict[str, Any]:
    sessions = await _fetch_sessions()
    summaries = [await _build_session_summary(session) for session in sessions]
    lanes: dict[str, list[dict[str, Any]]] = {lane: [] for lane in LANES}
    archive: list[dict[str, Any]] = []

    for summary in summaries:
        record = _get_record(summary["id"])
        if record and record.archived:
            archive.append(summary)
            continue
        lanes[summary["lane"]].append(summary)

    def sort_key(item: dict[str, Any]) -> float:
        record = _get_record(item["id"])
        return record.sort_order if record else 1024.0

    for lane in LANES:
        lanes[lane].sort(key=sort_key)

    archive.sort(key=sort_key)
    return {"lanes": lanes, "archiveCount": len(archive)}


mcp = FastMCP(
    "nova_opencode",
    instructions=(
        "Use these tools to interact with OpenCode — an AI coding assistant "
        "running in the Nova platform. You can create sessions, send prompts, "
        "retrieve file diffs, and manage the assistant programmatically."
    ),
    streamable_http_path="/",
    json_response=True,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@mcp.tool(name="list_sessions")
async def list_sessions() -> dict[str, Any]:
    async with _client() as client:
        resp = await client.get("/session")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="create_session")
async def create_session() -> dict[str, Any]:
    async with _client() as client:
        resp = await client.post("/session")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_session")
async def get_session(session_id: str) -> dict[str, Any]:
    async with _client() as client:
        resp = await client.get(f"/session/{session_id}")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="send_prompt")
async def send_prompt(session_id: str, prompt: str) -> dict[str, Any]:
    async with _client() as client:
        resp = await client.post(
            f"/session/{session_id}/message", json={"content": prompt}, timeout=300.0
        )
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_messages")
async def get_messages(session_id: str) -> dict[str, Any]:
    async with _client() as client:
        resp = await client.get(f"/session/{session_id}/message")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="abort_session")
async def abort_session(session_id: str) -> dict[str, Any]:
    async with _client() as client:
        resp = await client.post(f"/session/{session_id}/abort")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_files")
async def get_files() -> dict[str, Any]:
    async with _client() as client:
        resp = await client.get("/file")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_file")
async def get_file(path: str) -> dict[str, Any]:
    async with _client() as client:
        resp = await client.get("/file/read", params={"path": path})
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_diff")
async def get_diff(session_id: str) -> dict[str, Any]:
    async with _client() as client:
        resp = await client.get(f"/session/{session_id}/diff")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_config")
async def get_config() -> dict[str, Any]:
    async with _client() as client:
        resp = await client.get("/config")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_status")
async def get_status() -> dict[str, Any]:
    try:
        async with _client() as client:
            resp = await client.get("/config")
            opencode_ok = resp.status_code == 200
    except Exception:
        opencode_ok = False
    return {
        "base_path": BASE_PATH,
        "opencode_url": OPENCODE_BASE,
        "opencode_reachable": opencode_ok,
        "mcp_bridge_port": MCP_BRIDGE_PORT,
        "state_db": str(DB_PATH),
    }


app = FastAPI(title="nova-opencode")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    _ensure_db()


@app.get("/board")
async def get_board() -> dict[str, Any]:
    return await _board_payload()


@app.get("/archive")
async def get_archive() -> dict[str, Any]:
    sessions = await _fetch_sessions()
    archived = []
    for session in sessions:
        summary = await _build_session_summary(session)
        record = _get_record(summary["id"])
        if record and record.archived:
            archived.append(summary)

    def sort_key(item: dict[str, Any]) -> float:
        record = _get_record(item["id"])
        return record.sort_order if record else 1024.0

    archived.sort(key=sort_key)
    return {"sessions": archived}


@app.post("/session")
async def create_session_internal(payload: CreateSessionRequest) -> dict[str, Any]:
    lane = _normalize_lane(payload.lane)
    async with _client() as client:
        response = await client.post("/session")
        response.raise_for_status()
        created = response.json()
    session_id = created.get("id")
    if not isinstance(session_id, str):
        raise HTTPException(
            status_code=502, detail="OpenCode did not return session id"
        )
    _upsert_session_state(session_id, lane, archived=False, last_lane=lane)
    return {"id": session_id}


@app.patch("/session/{session_id}/lane")
async def move_session_internal(
    session_id: str, payload: MoveSessionRequest
) -> dict[str, Any]:
    _reorder_session_state(session_id, payload.lane, payload.afterId)
    return {"ok": True}


@app.post("/session/{session_id}/archive")
async def archive_session_internal(session_id: str) -> dict[str, Any]:
    _archive_session_state(session_id)
    return {"ok": True}


@app.post("/session/{session_id}/restore")
async def restore_session_internal(session_id: str) -> dict[str, Any]:
    _restore_session_state(session_id)
    return {"ok": True}


@app.get("/session/{session_id}")
async def session_detail_internal(session_id: str) -> dict[str, Any]:
    return await _fetch_session_detail(session_id)


app.mount("/mcp-root", mcp.streamable_http_app())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=MCP_BRIDGE_PORT)
