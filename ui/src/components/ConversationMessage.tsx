import { useState } from "react";
import type { SessionMessage } from "../lib/types";

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => extractText(item)).filter(Boolean).join("\n").trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["text", "question", "prompt", "summary", "message", "content", "title", "reasoning"]) {
    const text = extractText(record[key]);
    if (text) return text;
  }
  return "";
}

function extractQuestions(detail: string): string[] {
  const lines = detail
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const questions = lines.filter((line) => /\?\s*$/.test(line) || /^question\b/i.test(line) || /^q\d*\b/i.test(line));
  if (questions.length) return questions;

  // Fallback: if we have a short single line, treat it as the question.
  if (lines.length === 1 && lines[0].length <= 220) return [lines[0]];
  return [];
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
  onStop,
  busy = false,
}: {
  message: SessionMessage;
  onAnswer?: (answer: string) => void | Promise<void>;
  onStop?: () => void | Promise<void>;
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
        const questions = isWaiting && detail ? extractQuestions(detail) : [];

        return (
          <section key={`${message.id}-tool-${index}`} className="conversation-part conversation-tool">
            <div className="conversation-tool-head">
              <div className="conversation-part-label">{`Step ${index + 1}: ${label}`}</div>
              <span className={`conversation-tool-status ${status}`}>{status === "running" ? "Waiting for input" : status}</span>
            </div>
            {questions.length ? (
              <ol className="conversation-tool-questions">
                {questions.map((question, questionIndex) => (
                  <li key={`${message.id}-tool-${index}-q-${questionIndex}`}>{question}</li>
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
                <div className="conversation-tool-buttons">
                  {onStop ? (
                    <button className="archive-pill" type="button" onClick={() => void onStop()} disabled={busy} title="Stop processing">
                      Stop
                    </button>
                  ) : null}
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
