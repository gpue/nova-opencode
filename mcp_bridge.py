"""MCP bridge server for nova-opencode.

Exposes OpenCode's HTTP API as MCP tools so external agents can create
sessions, send prompts, retrieve diffs, and manage the coding assistant
programmatically.

Runs as a Streamable HTTP MCP server on port 8080 (configurable via
MCP_BRIDGE_PORT env var).
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

# ── Configuration ────────────────────────────────────────────────────
OPENCODE_HOST = os.environ.get("OPENCODE_HOST", "127.0.0.1")
OPENCODE_PORT = os.environ.get("OPENCODE_PORT", "4096")
OPENCODE_BASE = f"http://{OPENCODE_HOST}:{OPENCODE_PORT}"

MCP_BRIDGE_PORT = int(os.environ.get("MCP_BRIDGE_PORT", "8081"))
BASE_PATH = os.environ.get("BASE_PATH", "/cell/nova-opencode")

# Optional auth for the OpenCode server
OPENCODE_USERNAME = os.environ.get("OPENCODE_SERVER_USERNAME", "")
OPENCODE_PASSWORD = os.environ.get("OPENCODE_SERVER_PASSWORD", "")


def _auth() -> httpx.BasicAuth | None:
    if OPENCODE_PASSWORD:
        return httpx.BasicAuth(OPENCODE_USERNAME or "user", OPENCODE_PASSWORD)
    return None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=OPENCODE_BASE,
        auth=_auth(),
        timeout=120.0,
    )


# ── MCP Server ──────────────────────────────────────────────────────
mcp = FastMCP(
    "nova_opencode",
    instructions=(
        "Use these tools to interact with OpenCode — an AI coding assistant "
        "running in the Nova platform. You can create sessions, send prompts, "
        "retrieve file diffs, and manage the assistant programmatically."
    ),
    streamable_http_path="/",
    json_response=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
    ),
)


@mcp.tool(name="list_sessions")
async def list_sessions() -> dict[str, Any]:
    """List all OpenCode sessions."""
    async with _client() as client:
        resp = await client.get("/session")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="create_session")
async def create_session() -> dict[str, Any]:
    """Create a new OpenCode session."""
    async with _client() as client:
        resp = await client.post("/session")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_session")
async def get_session(session_id: str) -> dict[str, Any]:
    """Get details of a specific OpenCode session."""
    async with _client() as client:
        resp = await client.get(f"/session/{session_id}")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="send_prompt")
async def send_prompt(session_id: str, prompt: str) -> dict[str, Any]:
    """Send a prompt/message to an OpenCode session and wait for the response.

    Args:
        session_id: The session ID to send the prompt to.
        prompt: The text prompt to send to the AI coding assistant.
    """
    async with _client() as client:
        resp = await client.post(
            f"/session/{session_id}/message",
            json={"content": prompt},
            timeout=300.0,  # Long timeout for AI responses
        )
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_messages")
async def get_messages(session_id: str) -> dict[str, Any]:
    """Get all messages in an OpenCode session."""
    async with _client() as client:
        resp = await client.get(f"/session/{session_id}/message")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="abort_session")
async def abort_session(session_id: str) -> dict[str, Any]:
    """Abort/cancel the current operation in an OpenCode session."""
    async with _client() as client:
        resp = await client.post(f"/session/{session_id}/abort")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_files")
async def get_files() -> dict[str, Any]:
    """List files in the OpenCode workspace."""
    async with _client() as client:
        resp = await client.get("/file")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_file")
async def get_file(path: str) -> dict[str, Any]:
    """Read the contents of a specific file from the workspace.

    Args:
        path: Relative path to the file within the workspace.
    """
    async with _client() as client:
        resp = await client.get("/file/read", params={"path": path})
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_diff")
async def get_diff(session_id: str) -> dict[str, Any]:
    """Get the git diff of changes made by an OpenCode session.

    Args:
        session_id: The session ID to get the diff for.
    """
    async with _client() as client:
        resp = await client.get(f"/session/{session_id}/diff")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_config")
async def get_config() -> dict[str, Any]:
    """Get the current OpenCode configuration."""
    async with _client() as client:
        resp = await client.get("/config")
        resp.raise_for_status()
        return resp.json()


@mcp.tool(name="get_status")
async def get_status() -> dict[str, Any]:
    """Get nova-opencode status: OpenCode connectivity and bridge info."""
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
    }


if __name__ == "__main__":
    import uvicorn

    app = mcp.streamable_http_app()
    uvicorn.run(app, host="0.0.0.0", port=MCP_BRIDGE_PORT)
