import { useState } from "react";
import type { SessionMessage } from "../lib/types";

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => extractText(item)).filter(Boolean).join("\n").trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of [
    "text",
    "question",
    "prompt",
    "input",
    "summary",
    "message",
    "content",
    "title",
    "reasoning",
    "arguments",
    "args",
  ]) {
    const v = record[key];
    if (v === undefined) continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const inner = extractText((v as Record<string, unknown>).question ?? (v as Record<string, unknown>).text ?? (v as Record<string, unknown>).content);
      if (inner) return inner;
    }
    const text = extractText(v);
    if (text) return text;
  }
  return "";
}

function extractSuggestedOptions(part: Record<string, unknown>): string[] {
  for (const key of ["options", "suggestions", "choices"]) {
    const arr = part[key];
    if (!Array.isArray(arr)) continue;
    const items = arr
      .map((item) => (typeof item === "string" ? item : (item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.value ?? (item as Record<string, unknown>)?.text))
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    if (items.length) return items;
  }
  return [];
}

function formatQuestionDisplay(detail: string): string[] {
  const lines = detail
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const questions = lines.filter((line) => /\?\s*$/.test(line) || /^question\b/i.test(line) || /^q\d*\b/i.test(line));
  if (questions.length) return questions;
  if (lines.length === 1 && lines[0].length <= 400) return [lines[0]];
  return lines.length ? lines : [];
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

export function ConversationMessage({
  message,
  onAnswer,
  busy = false,
}: {
  message: SessionMessage;
  onAnswer?: (answer: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const text = extractRenderableText(message) || "No text content available.";
  const role = message.info?.role || message.role || "system";
  const createdAt = (message as { info?: { time?: { created?: number } } }).info?.time?.created;
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const reasoningParts = parts.filter((part) => part.type === "reasoning").map((part) => extractText(part)).filter(Boolean);
  const toolParts = parts.filter((part) => part.type === "tool");
  const [draftAnswers, setDraftAnswers] = useState<Record<number, string>>({});

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
        const isWaiting = status === "running";
        const draft = draftAnswers[index] ?? "";
        const questionLines = detail ? formatQuestionDisplay(detail) : [];
        const suggestedOptions = extractSuggestedOptions(part as Record<string, unknown>);

        return (
          <section key={`${message.id}-tool-${index}`} className="conversation-part conversation-tool">
            <div className="conversation-tool-head">
              <div className="conversation-part-label">{`Step ${index + 1}: ${label}`}</div>
              <span className={`conversation-tool-status ${status}`}>{status === "running" ? "Waiting for input" : status}</span>
            </div>
            {questionLines.length ? (
              <ol className="conversation-tool-questions">
                {questionLines.map((line, i) => (
                  <li key={`${message.id}-tool-${index}-q-${i}`}>{line}</li>
                ))}
              </ol>
            ) : detail ? (
              <pre className="conversation-part-body">{detail}</pre>
            ) : null}
            {isWaiting ? (
              <div className="conversation-tool-actions">
                <textarea
                  className="conversation-tool-input"
                  value={draft}
                  onChange={(event) => setDraftAnswers((current) => ({ ...current, [index]: event.target.value }))}
                  placeholder="Answer this question…"
                  rows={3}
                />
                {suggestedOptions.length ? (
                  <div className="conversation-tool-suggestions">
                    {suggestedOptions.map((opt, i) => (
                      <button
                        key={`${message.id}-tool-${index}-opt-${i}`}
                        className="archive-pill"
                        type="button"
                        onClick={() => {
                          setDraftAnswers((current) => ({ ...current, [index]: opt }));
                        }}
                        disabled={busy}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="conversation-tool-buttons">
                  <button
                    className="archive-pill primary-action"
                    type="button"
                    onClick={() => {
                      const answer = draft.trim();
                      if (!answer || !onAnswer) return;
                      setDraftAnswers((current) => ({ ...current, [index]: "" }));
                      void onAnswer(answer);
                    }}
                    disabled={busy || !draft.trim() || !onAnswer}
                    title="Send answer"
                  >
                    Send answer
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </article>
  );
}
