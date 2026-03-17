import { Link } from "react-router-dom";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { SessionSummary } from "../lib/types";

interface TicketCardProps {
  session: SessionSummary;
  onArchive: (sessionId: string) => void;
}

export function TicketCard({ session, onArchive }: TicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id });

  return (
    <article
      ref={setNodeRef}
      className={`ticket-card${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <div className="ticket-card-top">
        <span className="ticket-move-label">Move</span>
        <div className="ticket-status-wrap">
          <span className={`ticket-status${session.running ? " running" : " idle"}`}>{session.running ? "Thinking..." : "Idle"}</span>
        </div>
      </div>
      <Link to={`/session/${session.id}`} className="ticket-link">
        <h3 className="ticket-title">{session.title || "Untitled conversation"}</h3>
        <p className="ticket-preview">{session.preview || "Open this conversation to start working."}</p>
      </Link>
      <div className="ticket-meta">
        <span>{session.messageCount} messages</span>
        <span>{session.updatedAt ? new Date(session.updatedAt).toLocaleString() : "Just now"}</span>
      </div>
      <div className="ticket-actions">
        <Link to={`/session/${session.id}`} className="ticket-action-link">Open</Link>
        <button className="ticket-action-button" type="button" onClick={(event) => { event.stopPropagation(); onArchive(session.id); }}>
          Archive
        </button>
      </div>
    </article>
  );
}
