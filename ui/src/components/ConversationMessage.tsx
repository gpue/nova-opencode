import type { SessionMessage } from "../lib/types";

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => extractText(item)).filter(Boolean).join("\n").trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["text", "summary", "message", "content", "reasoning"]) {
    const text = extractText(record[key]);
    if (text) return text;
  }
  return "";
}

function extractRenderableText(message: SessionMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter((part) => part.type !== "reasoning" && part.type !== "tool")
    .map((part) => extractText(part))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function ConversationMessage({ message }: { message: SessionMessage }) {
  const text = extractRenderableText(message) || "No text content available.";
  const role = message.info?.role || message.role || "system";
  const createdAt = (message as { info?: { time?: { created?: number } } }).info?.time?.created;
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const reasoningParts = parts.filter((part) => part.type === "reasoning").map((part) => extractText(part)).filter(Boolean);
  const toolParts = parts.filter((part) => part.type === "tool");

  return (
    <article className={`conversation-message ${role}`}>
      <div className="conversation-message-head">
        <span className="conversation-message-role">{role}</span>
        <span className="conversation-message-time">{createdAt ? new Date(createdAt).toLocaleString() : ""}</span>
      </div>
      <pre className="conversation-message-body">{text}</pre>
      {reasoningParts.map((reasoning, index) => (
        <section key={`${message.id}-reasoning-${index}`} className="conversation-part conversation-reasoning">
          <div className="conversation-part-label">Reasoning</div>
          <pre className="conversation-part-body">{reasoning}</pre>
        </section>
      ))}
      {toolParts.map((part, index) => {
        const state = (part as { state?: { status?: string } }).state;
        const status = state?.status || "complete";
        const label = extractText((part as { tool?: unknown; name?: unknown }).tool) || extractText((part as { name?: unknown }).name) || "Tool";
        const detail = extractText(part);

        return (
          <section key={`${message.id}-tool-${index}`} className="conversation-part conversation-tool">
            <div className="conversation-tool-head">
              <div className="conversation-part-label">{label}</div>
              <span className={`conversation-tool-status ${status}`}>{status === "running" ? "Waiting for input" : status}</span>
            </div>
            {detail ? <pre className="conversation-part-body">{detail}</pre> : null}
          </section>
        );
      })}
    </article>
  );
}
