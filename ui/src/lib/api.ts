import type { BoardData, Lane, SessionDetail } from "./types";

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

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  return request(`/internal/session/${sessionId}`);
}

export function sendMessage(sessionId: string, prompt: string): Promise<unknown> {
  return request(`/api/session/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({ content: prompt }),
  });
}
