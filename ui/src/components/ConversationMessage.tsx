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

function extractToolCommand(part: Record<string, unknown>): string {
  const topLevel = part.command ?? part.cmd;
  if (typeof topLevel === "string" && topLevel.trim()) return topLevel.trim();
  const input = part.input ?? part.arguments ?? part.args;
  if (typeof input === "string") return input.trim();
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const cmd = obj.command ?? obj.cmd ?? obj.query ?? obj.text;
    if (typeof cmd === "string") return cmd.trim();
    if (Array.isArray(obj.args)) return (obj.args as unknown[]).map(String).join(" ").trim();
  }
  return "";
}

function extractToolOutput(part: Record<string, unknown>): string {
  const result = part.result ?? part.output ?? part.content;
  if (typeof result === "string") return result.trim();
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const stdout = obj.stdout;
    const stderr = obj.stderr;
    const out = typeof stdout === "string" ? stdout : "";
    const err = typeof stderr === "string" ? stderr : "";
    if (out || err) return [out, err].filter(Boolean).join(err ? "\n" : "").trim();
    const text = obj.text ?? obj.content ?? obj.output;
    if (typeof text === "string") return text.trim();
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
  isPending = false,
}: {
  message: SessionMessage;
  onAnswer?: (answer: string) => void | Promise<void>;
  busy?: boolean;
  isPending?: boolean;
}) {
  const rawText = extractRenderableText(message);
  const text = rawText || "No text content available.";
  const hasNoContent = !rawText || rawText.trim().length === 0;
  const role = message.info?.role || message.role || "system";
  const createdAt = (message as { info?: { time?: { created?: number } } }).info?.time?.created;
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const hasWaitingTool = parts.some((p) => (p as { state?: { status?: string } }).state?.status === "running");
  const showPendingStrip =
    isPending && hasNoContent && role === "assistant" && !hasWaitingTool;
  const reasoningParts = parts.filter((part) => part.type === "reasoning").map((part) => extractText(part)).filter(Boolean);
  const toolParts = parts.filter((part) => part.type === "tool");
  const [draftAnswers, setDraftAnswers] = useState<Record<number, string>>({});
  const [submittedIndices, setSubmittedIndices] = useState<Set<number>>(new Set());

  return (
    <article className={`conversation-message ${role}`}>
      <div className="conversation-message-head">
        <span className="conversation-message-role">{role}</span>
        <span className="conversation-message-time">{createdAt ? new Date(createdAt).toLocaleString() : ""}</span>
      </div>
      {showPendingStrip ? (
        <div className="conversation-message-progress" aria-label="Generating response">
          <div className="conversation-message-progress-bar" />
        </div>
      ) : (
        <pre className="conversation-message-body">{text}</pre>
      )}
      {!showPendingStrip &&
        reasoningParts.map((reasoning, index) => (
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
        const wasSubmitted = submittedIndices.has(index);
        const showForm = isWaiting && !wasSubmitted;
        const draft = draftAnswers[index] ?? "";
        const questionLines = detail ? formatQuestionDisplay(detail) : [];
        const suggestedOptions = extractSuggestedOptions(part as Record<string, unknown>);
        const partRecord = part as Record<string, unknown>;
        const toolCommand = extractToolCommand(partRecord);
        let toolOutput = extractToolOutput(partRecord);
        if (!toolOutput && toolCommand && detail && !questionLines.length) toolOutput = detail;
        const showCommandOutput = (toolCommand || toolOutput) && (status === "complete" || status === "running");

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
            ) : null}
            {showCommandOutput ? (
              <div className="conversation-tool-exec">
                {toolCommand ? (
                  <div className="conversation-tool-command">
                    <span className="conversation-tool-prompt">$</span> {toolCommand}
                  </div>
                ) : null}
                {toolOutput ? (
                  <pre className="conversation-tool-output">{toolOutput}</pre>
                ) : null}
              </div>
            ) : null}
            {!showCommandOutput && detail && !questionLines.length ? (
              <pre className="conversation-part-body">{detail}</pre>
            ) : null}
            {showForm ? (
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
                      setSubmittedIndices((prev) => new Set(prev).add(index));
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
