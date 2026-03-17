import type { SessionMessage } from "../lib/types";

function extractRenderableText(message: SessionMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map((part) => {
      if (part.type === "reasoning") return "";
      if (part.type === "tool") return "";
      if (typeof part.text === "string") return part.text;
      if (part.type === "text" && typeof (part as { text?: string }).text === "string") return (part as { text: string }).text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function ConversationMessage({ message }: { message: SessionMessage }) {
  const text = extractRenderableText(message) || "No text content available.";
  const role = message.info?.role || message.role || "system";
  const createdAt = (message as { info?: { time?: { created?: number } } }).info?.time?.created;

  return (
    <article className={`conversation-message ${role}`}>
      <div className="conversation-message-head">
        <span className="conversation-message-role">{role}</span>
        <span className="conversation-message-time">{createdAt ? new Date(createdAt).toLocaleString() : ""}</span>
      </div>
      <pre className="conversation-message-body">{text}</pre>
    </article>
  );
}
