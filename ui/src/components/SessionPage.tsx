import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSessionDetail, sendMessage } from "../lib/api";
import type { SessionDetail } from "../lib/types";
import { ConversationMessage } from "./ConversationMessage";

export function SessionPage() {
  const { sessionId = "" } = useParams();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    getSessionDetail(sessionId)
      .then((data) => {
        setDetail(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load conversation"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || !prompt.trim()) return;
    setSending(true);
    try {
      await sendMessage(sessionId, prompt.trim());
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
          <Link to="/" className="archive-back-link">Back to board</Link>
          <h1>{detail?.title || "Conversation"}</h1>
          <p>{detail?.updatedAt ? `Updated ${new Date(detail.updatedAt).toLocaleString()}` : "Live OpenCode session"}</p>
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
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Tell OpenCode what to do next..."
              rows={5}
            />
            <div className="session-composer-actions">
              <button className="lane-new-button" type="submit" disabled={sending || !prompt.trim()}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
