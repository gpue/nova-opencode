import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getComposerOptions, getSessionDetail, sendMessage } from "../lib/api";
import type { AgentMode, ComposerOptions, PromptOptions, SessionDetail } from "../lib/types";
import { ConversationMessage } from "./ConversationMessage";

export function SessionPage() {
  const { sessionId = "" } = useParams();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [options, setOptions] = useState<ComposerOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [providerID, setProviderID] = useState("");
  const [modelID, setModelID] = useState("");
  const [variant, setVariant] = useState("medium");
  const [mode, setMode] = useState<AgentMode>("plan");

  useEffect(() => {
    getComposerOptions()
      .then((data) => {
        setOptions(data);
        if (data.defaultModel) {
          setProviderID(data.defaultModel.providerID);
          setModelID(data.defaultModel.modelID);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load composer options"));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const refresh = () => {
      getSessionDetail(sessionId)
        .then((data) => {
          if (!cancelled) {
            setDetail(data);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load conversation");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    setLoading(true);
    refresh();
    const interval = window.setInterval(refresh, 2500);

    const stream = new EventSource(`/cell/nova-opencode/api/global/event`);
    stream.onmessage = () => refresh();
    stream.onerror = () => {};

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      stream.close();
    };
  }, [sessionId]);

  const selectedModel = useMemo(
    () => options?.models.find((item) => item.providerID === providerID && item.modelID === modelID) ?? null,
    [modelID, options, providerID],
  );

  const latestAssistant = useMemo(() => {
    const messages = detail?.messages ?? [];
    return [...messages].reverse().find((message) => (message.info?.role || message.role) === "assistant") ?? null;
  }, [detail]);

  const waitingForInput = useMemo(() => {
    const parts = latestAssistant?.parts ?? [];
    return parts.some((part) => part.type === "tool" && (part as { state?: { status?: string } }).state?.status === "running");
  }, [latestAssistant]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || !prompt.trim() || !providerID || !modelID) return;
    setSending(true);
    try {
      const payload: PromptOptions = { providerID, modelID, variant, mode };
      await sendMessage(sessionId, prompt.trim(), payload);
      setPrompt("");
      const refreshed = await getSessionDetail(sessionId);
      setDetail(refreshed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="session-page">
      <header className="session-header">
        <div>
          <Link to="/" className="archive-back-link session-back-link">Back to board</Link>
          <h1>{detail?.title || "Conversation"}</h1>
          <p>{detail?.updatedAt ? `Updated ${new Date(detail.updatedAt).toLocaleString()}` : "Live OpenCode session"}</p>
        </div>
        <div className={`session-progress${detail?.running ? " running" : ""}`}>
          {waitingForInput ? "Waiting for input" : detail?.running ? "Thinking..." : "Idle"}
        </div>
      </header>
      {loading ? <div className="page-state">Loading conversation...</div> : null}
      {error ? <div className="page-state error">{error}</div> : null}
      {!loading && !error && detail ? (
        <>
          <div className="session-timeline">
            {detail.messages.map((message) => (
              <ConversationMessage key={message.id} message={message} />
            ))}
            {detail.messages.length === 0 ? <div className="lane-empty">No messages yet. Send the first prompt.</div> : null}
          </div>
          <form className="session-composer" onSubmit={handleSubmit}>
            <div className="session-controls">
              <label>
                <span>Model</span>
                <select value={modelID} onChange={(event) => setModelID(event.target.value)}>
                  {(options?.models || []).map((item) => (
                    <option key={`${item.providerID}:${item.modelID}`} value={item.modelID}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Thinking</span>
                <select value={variant} onChange={(event) => setVariant(event.target.value)}>
                  {(selectedModel?.variants.length ? selectedModel.variants : ["medium"]).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Mode</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as AgentMode)}>
                  <option value="build">build</option>
                  <option value="plan">plan</option>
                </select>
              </label>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Tell OpenCode what to do next..."
              rows={5}
            />
            <div className="session-composer-actions">
              <button className="lane-new-button" type="submit" disabled={sending || !prompt.trim() || !providerID || !modelID}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
