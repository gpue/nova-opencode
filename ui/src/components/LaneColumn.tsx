import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Lane, SessionSummary } from "../lib/types";
import { TicketCard } from "./TicketCard";

interface LaneColumnProps {
  lane: Lane;
  title: string;
  sessions: SessionSummary[];
  onCreate: (lane: Lane) => void;
  onArchive: (sessionId: string) => void;
}

export function LaneColumn({ lane, title, sessions, onCreate, onArchive }: LaneColumnProps) {
  return (
    <section className="board-lane" data-lane={lane}>
      <header className="board-lane-header">
        <div>
          <h2>{title}</h2>
          <p>{sessions.length} tickets</p>
        </div>
        <button className="lane-new-button" type="button" onClick={() => onCreate(lane)}>
          New
        </button>
      </header>
      <SortableContext items={sessions.map((session) => session.id)} strategy={verticalListSortingStrategy}>
        <div className="board-lane-list">
          {sessions.map((session) => (
            <TicketCard key={session.id} session={session} onArchive={onArchive} />
          ))}
          {sessions.length === 0 ? <div className="lane-empty">No conversations yet.</div> : null}
        </div>
      </SortableContext>
    </section>
  );
}
