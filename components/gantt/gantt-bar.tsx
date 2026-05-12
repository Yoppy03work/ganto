"use client";

import type { GanttTaskDTO } from "@/lib/gantt/types";
import { BAR_H, ROW_H } from "@/lib/gantt/date";
import { cn } from "@/lib/utils";

const STATUS_CLS: Record<string, string> = {
  Todo:           "gantt-bar-todo",
  "In Progress":  "gantt-bar-progress",
  Done:           "gantt-bar-done",
  Backlog:        "gantt-bar-backlog",
};

export type GanttBarProps = {
  task: GanttTaskDTO;
  /** Pixel X of the bar's left edge (relative to the timeline area). */
  x: number;
  /** Bar width in px. */
  w: number;
  state?: "normal" | "hover" | "selected" | "dragging" | "resizing";
  onCriticalPath?: boolean;
  onPointerDown?: (
    e: React.PointerEvent<HTMLDivElement>,
    handle: "move" | "left" | "right"
  ) => void;
};

export function GanttBar({
  task,
  x,
  w,
  state = "normal",
  onCriticalPath = false,
  onPointerDown,
}: GanttBarProps) {
  const top = (ROW_H - BAR_H) / 2;
  const ringCls =
    state === "hover"     ? "ring-2 ring-ring/40" :
    state === "selected"  ? "ring-2 ring-ring" :
    state === "dragging"  ? "ring-2 ring-ring gantt-bar-shadow" :
    state === "resizing"  ? "ring-2 ring-ring/40" :
    "";

  // Progress fill underlay (Todo / In Progress only)
  const showProgress =
    task.progress != null &&
    task.status !== "Done" &&
    task.status !== "Backlog";
  const progressW = showProgress
    ? Math.max(0, Math.min(1, task.progress!)) * w
    : 0;
  const progressBg =
    task.status === "In Progress"
      ? "color-mix(in oklab, black 30%, var(--primary))"
      : "color-mix(in oklab, var(--primary) 35%, transparent)";

  const minWidth = 8;
  const widthPx = Math.max(minWidth, w);

  return (
    <div
      onPointerDown={(e) => onPointerDown?.(e, "move")}
      className={cn(
        "absolute rounded-md flex items-center px-2 gap-1.5 text-[12px] font-medium select-none overflow-hidden",
        STATUS_CLS[task.status] ?? STATUS_CLS.Todo,
        ringCls
      )}
      style={{
        left: x + 1,
        top,
        width: widthPx - 2,
        height: BAR_H,
        cursor: state === "dragging" ? "grabbing" : "grab",
        // Critical-path bars get a 2px destructive ring with no offset so the
        // marker reads at a glance without floating away from the bar edge.
        outline: onCriticalPath ? "2px solid var(--destructive)" : undefined,
        outlineOffset: onCriticalPath ? "0px" : undefined,
        boxShadow: onCriticalPath
          ? "0 0 0 1px color-mix(in oklab, var(--destructive) 25%, transparent)"
          : undefined,
      }}
      data-task-id={task.id}
    >
      {showProgress && (
        <div
          className="absolute left-0 top-0 bottom-0"
          style={{
            width: progressW,
            pointerEvents: "none",
            background: progressBg,
          }}
        />
      )}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e, "left");
        }}
        className="absolute left-0 top-0 bottom-0 hover:bg-foreground/20"
        style={{
          width: state === "resizing" ? 8 : 6,
          cursor: "ew-resize",
          background:
            state === "resizing"
              ? "color-mix(in oklab, var(--foreground) 25%, transparent)"
              : "transparent",
          borderTopLeftRadius: 6,
          borderBottomLeftRadius: 6,
          zIndex: 2,
        }}
      />
      <span
        className="truncate flex-1 relative"
        style={{ minWidth: 0, pointerEvents: "none" }}
      >
        {task.title}
      </span>
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e, "right");
        }}
        className="absolute right-0 top-0 bottom-0 hover:bg-foreground/20"
        style={{
          width: state === "resizing" ? 8 : 6,
          cursor: "ew-resize",
          background:
            state === "resizing"
              ? "color-mix(in oklab, var(--foreground) 25%, transparent)"
              : "transparent",
          borderTopRightRadius: 6,
          borderBottomRightRadius: 6,
          zIndex: 2,
        }}
      />
    </div>
  );
}
