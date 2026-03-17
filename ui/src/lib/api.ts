import type {
  BoardData,
  Lane,
  SessionDetail,
  TerminalResult,
  WorkspaceFile,
  WorkspaceNode,
} from "./types";

const base = "/cell/nova-opencode";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getBoard(): Promise<BoardData> {
  return request("/internal/board");
}

export function getArchive(): Promise<{ sessions: BoardData["lanes"][Lane] }> {
  return request("/internal/archive");
}

export function createSession(lane: Lane): Promise<{ id: string }> {
  return request("/internal/session", {
    method: "POST",
    body: JSON.stringify({ lane }),
  });
}

export function moveSession(sessionId: string, lane: Lane, afterId?: string | null): Promise<{ ok: boolean }> {
  return request(`/internal/session/${sessionId}/lane`, {
    method: "PATCH",
    body: JSON.stringify({ lane, afterId }),
  });
}

export function archiveSession(sessionId: string): Promise<{ ok: boolean }> {
  return request(`/internal/session/${sessionId}/archive`, {
    method: "POST",
  });
}

export function restoreSession(sessionId: string): Promise<{ ok: boolean }> {
  return request(`/internal/session/${sessionId}/restore`, {
    method: "POST",
  });
}

export function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  return request(`/internal/session/${sessionId}`);
}

export function sendMessage(sessionId: string, prompt: string): Promise<unknown> {
  return request(`/api/session/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({ content: prompt }),
  });
}

export function getWorkspaceTree(): Promise<{ tree: WorkspaceNode[] }> {
  return request("/internal/workspace/tree");
}

export function getWorkspaceFile(path: string): Promise<WorkspaceFile> {
  const encoded = encodeURIComponent(path);
  return request(`/internal/workspace/file?path=${encoded}`);
}

export function saveWorkspaceFile(path: string, content: string): Promise<{ ok: boolean }> {
  return request("/internal/workspace/file", {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  });
}

export function runTerminalCommand(command: string): Promise<TerminalResult> {
  return request("/internal/terminal/run", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}
