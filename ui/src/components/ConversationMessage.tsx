import type { SessionMessage } from "../lib/types";

function extractText(message: SessionMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map((part) => {
      if (typeof part.text === "string") return part.text;
      if (part.type === "text" && typeof (part as { text?: string }).text === "string") return (part as { text: string }).text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function ConversationMessage({ message }: { message: SessionMessage }) {
  const text = extractText(message) || "No text content available.";
  const role = message.role || "system";

  return (
    <article className={`conversation-message ${role}`}>
      <div className="conversation-message-head">
        <span className="conversation-message-role">{role}</span>
        <span className="conversation-message-time">{message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}</span>
      </div>
      <pre className="conversation-message-body">{text}</pre>
    </article>
  );
}
