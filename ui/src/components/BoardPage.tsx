import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useNavigate } from "react-router-dom";
import { archiveSession, createSession, getBoard, moveSession } from "../lib/api";
import type { BoardData, Lane, SessionSummary } from "../lib/types";
import { LaneColumn } from "./LaneColumn";

const laneOrder: Array<{ key: Lane; label: string }> = [
  { key: "later", label: "Later" },
  { key: "next", label: "Next" },
  { key: "now", label: "Now" },
];

function cloneLanes(lanes: BoardData["lanes"]) {
  return {
    later: [...lanes.later],
    next: [...lanes.next],
    now: [...lanes.now],
  } satisfies BoardData["lanes"];
}

function findLane(lanes: BoardData["lanes"], sessionId: string): Lane | null {
  for (const lane of laneOrder) {
    if (lanes[lane.key].some((session) => session.id === sessionId)) return lane.key;
  }
  return null;
}

export function BoardPage() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    let cancelled = false;
    getBoard()
      .then((data) => {
        if (!cancelled) {
          setBoard(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load board");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const archiveCount = board?.archiveCount ?? 0;

  async function handleCreate(lane: Lane) {
    const created = await createSession(lane);
    navigate(`/session/${created.id}`);
  }

  async function handleArchive(sessionId: string) {
    await archiveSession(sessionId);
    setBoard((current) => {
      if (!current) return current;
      const lanes = cloneLanes(current.lanes);
      for (const lane of laneOrder) {
        lanes[lane.key] = lanes[lane.key].filter((session) => session.id !== sessionId);
      }
      return { lanes, archiveCount: current.archiveCount + 1 };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!board) return;
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;

    const lanes = cloneLanes(board.lanes);
    const fromLane = findLane(lanes, activeId);
    if (!fromLane) return;

    const toLane = findLane(lanes, overId) ?? (laneOrder.find((lane) => lane.key === overId)?.key ?? null);
    if (!toLane) return;

    const fromItems = lanes[fromLane];
    const sourceIndex = fromItems.findIndex((item) => item.id === activeId);
    if (sourceIndex === -1) return;

    const [moved] = fromItems.splice(sourceIndex, 1);
    moved.lane = toLane;

    if (fromLane === toLane) {
      const targetIndex = lanes[toLane].findIndex((item) => item.id === overId);
      const nextItems = arrayMove(lanes[toLane], sourceIndex, targetIndex);
      lanes[toLane] = nextItems;
      setBoard({ ...board, lanes });
      await moveSession(activeId, toLane, overId);
      return;
    }

    const targetIndex = lanes[toLane].findIndex((item) => item.id === overId);
    if (targetIndex === -1) {
      lanes[toLane].push(moved);
    } else {
      lanes[toLane].splice(targetIndex, 0, moved);
    }

    setBoard({ ...board, lanes });
    await moveSession(activeId, toLane, overId);
  }

  const content = useMemo(() => {
    if (loading) return <div className="page-state">Loading board...</div>;
    if (error) return <div className="page-state error">{error}</div>;
    if (!board) return <div className="page-state">No board data.</div>;

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="board-page-head">
          <div>
            <h1>Conversation board</h1>
            <p>Organize OpenCode work into Later, Next, and Now.</p>
          </div>
          <button className="archive-pill" type="button" onClick={() => navigate("/archive")}>Archive {archiveCount > 0 ? `(${archiveCount})` : ""}</button>
        </div>
        <div className="board-grid">
          {laneOrder.map((lane) => (
            <LaneColumn
              key={lane.key}
              lane={lane.key}
              title={lane.label}
              sessions={board.lanes[lane.key]}
              onCreate={handleCreate}
              onArchive={handleArchive}
            />
          ))}
        </div>
      </DndContext>
    );
  }, [archiveCount, board, error, loading, navigate, sensors]);

  return <section className="board-page">{content}</section>;
}
