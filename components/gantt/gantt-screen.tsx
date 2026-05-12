"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  buildDayHeader,
  buildWeekHeader,
  buildMonthHeader,
  autoWindow,
  dateToPx,
  todayPx,
  startOfDay,
  ROW_H,
  HEADER_H,
  TOOLBAR_H,
  SCALE_PX_PER_DAY,
  type ScaleKey,
} from "@/lib/gantt/date";
import type { GanttTaskDTO } from "@/lib/gantt/types";
import { DateHeader } from "./date-header";
import { TaskListToolbar, TaskRow } from "./task-row";
import { GanttBar } from "./gantt-bar";
import { TodayLine, TimelineGrid } from "./today-line";
import { Button } from "@/components/ui/button";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskSidepanel } from "./task-sidepanel";
import { DependencyArrows } from "./dependency-arrows";
import { ImportExportMenu } from "./import-export";
import { criticalTaskSet } from "@/lib/gantt/critical-path";

type Member = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

type Dependency = { fromTaskId: string; toTaskId: string };

type DragState =
  | { kind: "none" }
  | {
      kind: "move" | "left" | "right";
      taskId: string;
      startX: number;
      origStart: Date;
      origEnd: Date;
      offsetDays: number;
    };

type RowDrag =
  | { kind: "idle" }
  | { kind: "reorder"; fromIndex: number; overIndex: number; before: boolean };

export function GanttScreen({
  projectId,
  initialTasks,
  initialDeps,
  canCreate,
  members,
  currentUserId,
}: {
  projectId: string;
  initialTasks: GanttTaskDTO[];
  initialDeps: Dependency[];
  canCreate: boolean;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [deps, setDeps] = useState<Dependency[]>(initialDeps);
  const [selected, setSelected] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>({ kind: "none" });
  const [rowDrag, setRowDrag] = useState<RowDrag>({ kind: "idle" });
  const [showArrows, setShowArrows] = useState(true);
  const [showCp, setShowCp] = useState(true);
  const [scale, setScale] = useState<ScaleKey>("Day");
  const pxPerDay = SCALE_PX_PER_DAY[scale];
  // Compute critical-path set whenever tasks or deps change.
  const criticalSet = useMemo(
    () =>
      criticalTaskSet(
        tasks.map((t) => ({
          id: t.id,
          startAt: t.startAt ? new Date(t.startAt) : null,
          endAt: t.endAt ? new Date(t.endAt) : null,
        })),
        deps
      ),
    [tasks, deps]
  );

  // Mount-after-hydrate flag: avoids time-dependent rendering causing
  // hydration mismatches (Today line uses ms precision).
  // useSyncExternalStore returns server snapshot on SSR, client on hydrate.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { origin, windowDays } = useMemo(
    () =>
      autoWindow(
        tasks.map((t) => ({
          start: t.startAt ? new Date(t.startAt) : null,
          end: t.endAt ? new Date(t.endAt) : null,
        })),
        now
      ),
    [tasks, now]
  );

  const dayHeader = useMemo(
    () => buildDayHeader(origin, windowDays, pxPerDay, now),
    [origin, windowDays, pxPerDay, now]
  );
  const weekHeader = useMemo(
    () => buildWeekHeader(origin, windowDays, pxPerDay),
    [origin, windowDays, pxPerDay]
  );
  const monthHeader = useMemo(
    () => buildMonthHeader(origin, windowDays, pxPerDay),
    [origin, windowDays, pxPerDay]
  );

  // For grid (weekend tints) we always use day cells, regardless of header scale.
  const gridCells = dayHeader.cells;
  const totalWidth = windowDays * pxPerDay;
  const totalRowsHeight = tasks.length * ROW_H;

  // ---- Vertical scroll sync (left rows ↔ right scroll). ----
  // The right scroll container owns BOTH axes; the DateHeader inside it uses
  // position:sticky top-0 so it stays pinned vertically while moving
  // horizontally with the bars (single source of truth for horizontal).
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  function syncScroll(source: "left" | "right") {
    if (syncing.current) return;
    syncing.current = true;
    const lb = leftBodyRef.current;
    const rb = rightScrollRef.current;
    if (lb && rb) {
      if (source === "left" && rb.scrollTop !== lb.scrollTop) {
        rb.scrollTop = lb.scrollTop;
      } else if (source === "right" && lb.scrollTop !== rb.scrollTop) {
        lb.scrollTop = rb.scrollTop;
      }
    }
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  // ---- Bar drag (move / resize) ----

  function startBarDrag(
    e: React.PointerEvent<HTMLDivElement>,
    taskId: string,
    handle: "move" | "left" | "right"
  ) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t || !t.startAt || !t.endAt) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({
      kind: handle,
      taskId,
      startX: e.clientX,
      origStart: new Date(t.startAt),
      origEnd: new Date(t.endAt),
      offsetDays: 0,
    });
  }

  function onBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.kind === "none") return;
    const dx = e.clientX - drag.startX;
    const days = Math.round(dx / pxPerDay);
    if (days === drag.offsetDays) return;
    setDrag({ ...drag, offsetDays: days });
  }

  function onBarPointerUp() {
    if (drag.kind === "none") return;
    const days = drag.offsetDays;
    if (days === 0) {
      setDrag({ kind: "none" });
      return;
    }
    const dayMs = 86_400_000;
    let newStart = drag.origStart;
    let newEnd = drag.origEnd;
    if (drag.kind === "move") {
      newStart = new Date(drag.origStart.getTime() + days * dayMs);
      newEnd = new Date(drag.origEnd.getTime() + days * dayMs);
    } else if (drag.kind === "left") {
      newStart = new Date(drag.origStart.getTime() + days * dayMs);
      if (newStart >= drag.origEnd) {
        newStart = new Date(drag.origEnd.getTime() - dayMs);
      }
    } else if (drag.kind === "right") {
      newEnd = new Date(drag.origEnd.getTime() + days * dayMs);
      if (newEnd <= drag.origStart) {
        newEnd = new Date(drag.origStart.getTime() + dayMs);
      }
    }
    const taskId = drag.taskId;
    setDrag({ kind: "none" });
    setTasks((arr) =>
      arr.map((x) =>
        x.id === taskId
          ? { ...x, startAt: newStart.toISOString(), endAt: newEnd.toISOString() }
          : x
      )
    );
    void persistDates(taskId, newStart, newEnd);
  }

  async function persistDates(taskId: string, startAt: Date, endAt: Date) {
    // Capture the current lockVersion BEFORE the request so we can detect a
    // racing concurrent edit. We must read it at call time (not closure-captured)
    // because the local `tasks` may have been re-rendered by a successful
    // sibling request.
    const current = tasks.find((t) => t.id === taskId);
    const expectedLockVersion = current?.lockVersion ?? 0;
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          expectedLockVersion,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        }),
      });
      if (res.status === 409) {
        toast.warning("他のユーザーが先に変更しました。最新の状態に更新します。");
        await refresh();
        return;
      }
      if (!res.ok) {
        await refresh();
        return;
      }
      // Update the local row's lockVersion so the next PATCH won't race
      // against our own previous request.
      const data = (await res.json()) as { ok: boolean; lockVersion?: number };
      if (typeof data.lockVersion === "number") {
        const newVer = data.lockVersion;
        setTasks((arr) =>
          arr.map((x) => (x.id === taskId ? { ...x, lockVersion: newVer } : x))
        );
      }
    } catch {
      await refresh();
    }
  }

  async function refresh() {
    const [tasksRes, depsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/tasks`, { credentials: "same-origin" }),
      fetch(`/api/projects/${projectId}/dependencies`, { credentials: "same-origin" }),
    ]);
    if (tasksRes.ok) {
      const data = (await tasksRes.json()) as { tasks: GanttTaskDTO[] };
      setTasks(data.tasks);
    } else {
      router.refresh();
    }
    if (depsRes.ok) {
      const data = (await depsRes.json()) as { dependencies: Dependency[] };
      setDeps(data.dependencies);
    }
  }

  // ---- Row reorder via HTML5 drag-and-drop ----

  function onRowDragStart(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    setRowDrag({ kind: "reorder", fromIndex: index, overIndex: index, before: true });
  }

  function onRowDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    if (rowDrag.kind !== "reorder") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    if (rowDrag.overIndex !== index || rowDrag.before !== before) {
      setRowDrag({ ...rowDrag, overIndex: index, before });
    }
  }

  function onRowDragEnd() {
    setRowDrag({ kind: "idle" });
  }

  function onRowDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (rowDrag.kind !== "reorder") return;
    const { fromIndex, overIndex, before } = rowDrag;
    setRowDrag({ kind: "idle" });
    if (fromIndex === overIndex && before) return;
    let toIndex = before ? overIndex : overIndex + 1;
    if (toIndex > fromIndex) toIndex -= 1;
    if (toIndex === fromIndex) return;

    const next = [...tasks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setTasks(next);
    void persistOrder(next.map((t) => t.id));
  }

  async function persistOrder(orderedIds: string[]) {
    // Build the optimistic-lock-aware payload. The server runs the whole
    // reorder inside a transaction and rolls back the entire op if ANY task's
    // lockVersion mismatches.
    const byId = new Map(tasks.map((t) => [t.id, t] as const));
    const items = orderedIds.map((taskId) => ({
      taskId,
      expectedLockVersion: byId.get(taskId)?.lockVersion ?? 0,
    }));
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ items }),
      });
      if (res.status === 409) {
        toast.warning("他のユーザーが先にタスクを更新しました。最新の状態に更新します。");
        await refresh();
        return;
      }
      if (!res.ok) {
        await refresh();
        return;
      }
      // Reorder bumped every task's lockVersion — refetch to stay in sync.
      await refresh();
    } catch {
      await refresh();
    }
  }

  function jumpToToday() {
    if (!rightScrollRef.current) return;
    const px = todayPx(origin, pxPerDay, now);
    const half = rightScrollRef.current.clientWidth / 2;
    rightScrollRef.current.scrollLeft = Math.max(0, px - half);
  }

  useEffect(() => {
    if (!mounted) return;
    jumpToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, mounted]);

  /** Row offset due to in-flight reorder drag — used for the "make space" animation. */
  function rowExtraMargin(i: number): {
    marginTop: number;
    marginBottom: number;
  } {
    if (rowDrag.kind !== "reorder") return { marginTop: 0, marginBottom: 0 };
    if (rowDrag.fromIndex === i) return { marginTop: 0, marginBottom: 0 };
    if (rowDrag.overIndex === i && rowDrag.before) {
      return { marginTop: ROW_H, marginBottom: 0 };
    }
    if (rowDrag.overIndex === i && !rowDrag.before) {
      return { marginTop: 0, marginBottom: ROW_H };
    }
    return { marginTop: 0, marginBottom: 0 };
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <header className="h-12 border-b border-border flex items-center justify-between px-4 gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-input bg-background p-0.5 h-7">
            {(["Day", "Week", "Month"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={
                  "h-6 px-2.5 rounded-[4px] text-xs font-medium transition-colors " +
                  (scale === s
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {s}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={jumpToToday}>
            Today
          </Button>
          <span className="text-[11px] font-mono text-muted-foreground">
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </span>
          <span className="text-muted-foreground">·</span>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showArrows}
              onChange={(e) => setShowArrows(e.target.checked)}
            />
            Arrows
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showCp}
              onChange={(e) => setShowCp(e.target.checked)}
            />
            Critical path
          </label>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu
            projectId={projectId}
            canImport={canCreate}
            onImported={() => void refresh()}
          />
          {canCreate && (
            <NewTaskDialog
              projectId={projectId}
              onCreated={() => void refresh()}
            />
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* LEFT PANE */}
        <div
          className="flex flex-col bg-sidebar"
          style={{ width: 320, flexShrink: 0, borderRight: "1px solid var(--border)" }}
        >
          {/* Top strip: toolbar (32) + filler (HEADER_H - 32) so rows below align with right-pane bars */}
          <div
            className="flex flex-col flex-shrink-0"
            style={{ height: HEADER_H, borderBottom: "1px solid var(--border)" }}
          >
            <TaskListToolbar count={tasks.length} />
            <div style={{ height: HEADER_H - TOOLBAR_H }} />
          </div>

          <div
            ref={leftBodyRef}
            onScroll={() => syncScroll("left")}
            onDragEnd={onRowDragEnd}
            onDrop={onRowDrop}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            {tasks.map((t, i) => {
              const { marginTop, marginBottom } = rowExtraMargin(i);
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => onRowDragStart(e, i)}
                  onDragOver={(e) => onRowDragOver(e, i)}
                  className="relative"
                  style={{
                    marginTop,
                    marginBottom,
                    transition: "margin 150ms ease",
                    cursor: "grab",
                  }}
                >
                  {/* Drop indicator — thin primary line at the insertion edge */}
                  {rowDrag.kind === "reorder" &&
                    rowDrag.overIndex === i &&
                    rowDrag.fromIndex !== i &&
                    (rowDrag.before ? (
                      <div
                        className="absolute left-0 right-0 -top-[1px] h-[2px] bg-primary z-10 pointer-events-none"
                        aria-hidden
                      />
                    ) : (
                      <div
                        className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-primary z-10 pointer-events-none"
                        aria-hidden
                      />
                    ))}
                  <TaskRow
                    task={t}
                    selected={selected === t.id}
                    onSelect={(id) => {
                      setSelected(id);
                      setOpenTaskId(id);
                    }}
                  />
                </div>
              );
            })}
            {tasks.length === 0 && (
              <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                No tasks yet. Click + New task to add one.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE — single scroll container, both axes */}
        <div
          ref={rightScrollRef}
          onScroll={() => syncScroll("right")}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
          className="flex-1 relative bg-background overflow-auto"
          style={{ minWidth: 0 }}
        >
          {scale === "Day" ? (
            <DateHeader
              kind="Day"
              cells={dayHeader.cells}
              groups={dayHeader.groups}
              totalWidth={totalWidth}
            />
          ) : scale === "Week" ? (
            <DateHeader
              kind="Week"
              weeks={weekHeader.weeks}
              months={weekHeader.months}
              totalWidth={totalWidth}
            />
          ) : (
            <DateHeader
              kind="Month"
              months={monthHeader.months}
              years={monthHeader.years}
              totalWidth={totalWidth}
            />
          )}
          <div
            className="relative"
            style={{
              width: totalWidth,
              height: Math.max(totalRowsHeight, 200),
            }}
          >
            <TimelineGrid cells={gridCells} />

            {/* Dependency arrows render BEFORE bars so bars overlap the line
                segments that pass behind them — only the entry/exit nubs and
                the arrowhead at the destination's left edge stay visible. */}
            {showArrows && deps.length > 0 && (
              <DependencyArrows
                tasks={tasks}
                deps={deps}
                origin={origin}
                pxPerDay={pxPerDay}
                criticalSet={showCp ? criticalSet : new Set()}
                height={Math.max(totalRowsHeight, 200)}
                totalWidth={totalWidth}
                rowOffsetByIndex={(idx) => rowExtraMargin(idx).marginTop}
              />
            )}

            {tasks.map((t, i) => {
              const { marginTop, marginBottom } = rowExtraMargin(i);
              const top = i * ROW_H;
              const start = t.startAt ? new Date(t.startAt) : null;
              const end = t.endAt ? new Date(t.endAt) : null;
              return (
                <div
                  key={t.id}
                  className="absolute left-0 right-0"
                  style={{
                    top: top + marginTop,
                    height: ROW_H + marginBottom,
                    borderBottom: "1px solid var(--border)",
                    transition: "top 150ms ease, height 150ms ease",
                  }}
                  onClick={() => {
                    setSelected(t.id);
                    setOpenTaskId(t.id);
                  }}
                >
                  {start && end && (
                    <BarWithDrag
                      task={t}
                      start={start}
                      end={end}
                      origin={origin}
                      pxPerDay={pxPerDay}
                      drag={drag}
                      selected={selected === t.id}
                      onCriticalPath={showCp && criticalSet.has(t.id)}
                      onPointerDown={(e, handle) =>
                        startBarDrag(e, t.id, handle)
                      }
                    />
                  )}
                </div>
              );
            })}

            {mounted && (
              <TodayLine
                x={todayPx(origin, pxPerDay, now)}
                height={Math.max(totalRowsHeight, 200)}
              />
            )}
          </div>
        </div>

        {/* Task detail panel — overlays the right pane */}
        {openTaskId && (() => {
          const openTask = tasks.find((t) => t.id === openTaskId);
          if (!openTask) return null;
          return (
            <TaskSidepanel
              key={openTask.id}
              projectId={projectId}
              task={openTask}
              allTasks={tasks}
              deps={deps}
              members={members}
              currentUserId={currentUserId}
              canEdit={canCreate}
              onClose={() => setOpenTaskId(null)}
              onChanged={(patch) => {
                setTasks((arr) =>
                  arr.map((t) => (t.id === openTaskId ? { ...t, ...patch } : t))
                );
              }}
              onDeleted={() => {
                setTasks((arr) => arr.filter((t) => t.id !== openTaskId));
                setOpenTaskId(null);
                setSelected(null);
              }}
              onDepsChanged={setDeps}
            />
          );
        })()}
      </div>
    </div>
  );
}

function BarWithDrag({
  task,
  start,
  end,
  origin,
  pxPerDay,
  drag,
  selected,
  onCriticalPath,
  onPointerDown,
}: {
  task: GanttTaskDTO;
  start: Date;
  end: Date;
  origin: Date;
  pxPerDay: number;
  drag: DragState;
  selected: boolean;
  onCriticalPath: boolean;
  onPointerDown: (
    e: React.PointerEvent<HTMLDivElement>,
    handle: "move" | "left" | "right"
  ) => void;
}) {
  const dayMs = 86_400_000;
  let displayStart = start;
  let displayEnd = end;
  let state: "normal" | "selected" | "dragging" | "resizing" = selected
    ? "selected"
    : "normal";

  if (drag.kind !== "none" && drag.taskId === task.id) {
    const days = drag.offsetDays;
    if (drag.kind === "move") {
      displayStart = new Date(drag.origStart.getTime() + days * dayMs);
      displayEnd = new Date(drag.origEnd.getTime() + days * dayMs);
      state = "dragging";
    } else if (drag.kind === "left") {
      const cand = new Date(drag.origStart.getTime() + days * dayMs);
      displayStart = cand >= drag.origEnd
        ? new Date(drag.origEnd.getTime() - dayMs)
        : cand;
      state = "resizing";
    } else if (drag.kind === "right") {
      const cand = new Date(drag.origEnd.getTime() + days * dayMs);
      displayEnd = cand <= drag.origStart
        ? new Date(drag.origStart.getTime() + dayMs)
        : cand;
      state = "resizing";
    }
  }

  const x = dateToPx(startOfDay(displayStart), origin, pxPerDay);
  const w = dateToPx(displayEnd, origin, pxPerDay) - x;

  return (
    <GanttBar
      task={task}
      x={x}
      w={w}
      state={state}
      onCriticalPath={onCriticalPath}
      onPointerDown={onPointerDown}
    />
  );
}
