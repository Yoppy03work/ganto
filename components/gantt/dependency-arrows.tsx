"use client";

import type { GanttTaskDTO } from "@/lib/gantt/types";
import { dateToPx, ROW_H, BAR_H, startOfDay } from "@/lib/gantt/date";

type Dep = { fromTaskId: string; toTaskId: string };

export function DependencyArrows({
  tasks,
  deps,
  origin,
  pxPerDay,
  criticalSet,
  height,
  totalWidth,
  rowOffsetByIndex,
}: {
  tasks: GanttTaskDTO[];
  deps: Dep[];
  origin: Date;
  pxPerDay: number;
  criticalSet: Set<string>;
  height: number;
  totalWidth: number;
  /** Optional Y-shift per row index (used during reorder animation). */
  rowOffsetByIndex?: (idx: number) => number;
}) {
  const indexById = new Map(tasks.map((t, i) => [t.id, i] as const));

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={totalWidth}
      height={height}
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="dep-arrow-muted"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="var(--muted-foreground)" />
        </marker>
        <marker
          id="dep-arrow-cp"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="var(--destructive)" />
        </marker>
      </defs>
      {deps.map((d) => {
        const fromIdx = indexById.get(d.fromTaskId);
        const toIdx = indexById.get(d.toTaskId);
        const fromTask = tasks.find((t) => t.id === d.fromTaskId);
        const toTask = tasks.find((t) => t.id === d.toTaskId);
        if (
          fromIdx === undefined ||
          toIdx === undefined ||
          !fromTask?.endAt ||
          !toTask?.startAt
        )
          return null;

        const fromX = dateToPx(new Date(fromTask.endAt), origin, pxPerDay) - 1;
        const toX = dateToPx(startOfDay(new Date(toTask.startAt)), origin, pxPerDay) + 1;
        const fromYBase = fromIdx * ROW_H + ROW_H / 2;
        const toYBase = toIdx * ROW_H + ROW_H / 2;
        const fromY = fromYBase + (rowOffsetByIndex?.(fromIdx) ?? 0);
        const toY = toYBase + (rowOffsetByIndex?.(toIdx) ?? 0);

        const onCp =
          criticalSet.has(d.fromTaskId) && criticalSet.has(d.toTaskId);

        // Build the path. Two cases:
        //   1) "Clean": source ends before destination starts → simple L-shape.
        //   2) "Overlap": source ends after destination starts → route around
        //      the destination bar via a lane above (if from is below to) or
        //      below (if from is above to), so the line never crosses through
        //      the destination's title text.
        const STUB = 8;
        const APPROACH = 12;
        const overlap = fromX + STUB > toX - APPROACH;
        let path: string;
        if (!overlap) {
          const elbowX = Math.max(fromX + STUB, toX - APPROACH);
          path = `M ${fromX} ${fromY} L ${elbowX} ${fromY} L ${elbowX} ${toY} L ${toX} ${toY}`;
        } else {
          // Pick a lane just outside the destination bar — same row as `to`,
          // but offset to its top or bottom edge so the leftward segment
          // skims past the bar instead of crossing it.
          const barTopY = toIdx * ROW_H + (ROW_H - BAR_H) / 2;
          const barBotY = barTopY + BAR_H;
          const above = fromIdx <= toIdx;
          const laneY = above ? barTopY - 4 : barBotY + 4;
          path = [
            `M ${fromX} ${fromY}`,
            `L ${fromX + STUB} ${fromY}`,
            `L ${fromX + STUB} ${laneY}`,
            `L ${toX - APPROACH} ${laneY}`,
            `L ${toX - APPROACH} ${toY}`,
            `L ${toX} ${toY}`,
          ].join(" ");
        }

        return (
          <path
            key={`${d.fromTaskId}->${d.toTaskId}`}
            d={path}
            fill="none"
            stroke={onCp ? "var(--destructive)" : "var(--muted-foreground)"}
            strokeWidth={onCp ? 1.5 : 1}
            strokeDasharray={onCp ? "0" : "3 2"}
            opacity={onCp ? 0.95 : 0.55}
            markerEnd={`url(#${onCp ? "dep-arrow-cp" : "dep-arrow-muted"})`}
          />
        );
      })}
    </svg>
  );
}
