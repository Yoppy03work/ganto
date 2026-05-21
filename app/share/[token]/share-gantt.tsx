"use client";

import {
  autoWindow,
  buildDayHeader,
  dateToPx,
  startOfDay,
  ROW_H,
  HEADER_H,
} from "@/lib/gantt/date";
import { DateHeader } from "@/components/gantt/date-header";
import { TimelineGrid } from "@/components/gantt/today-line";
import { GanttBar } from "@/components/gantt/gantt-bar";
import type { GanttTaskDTO } from "@/lib/gantt/types";

/**
 * Minimal read-only Gantt for public share links. No drag, no panels, no
 * fetches — just renders the tasks it's given. Day scale only.
 */
export function ShareGantt({ tasks }: { tasks: GanttTaskDTO[] }) {
  const now = new Date();
  const { origin, windowDays } = autoWindow(
    tasks.map((t) => ({
      start: t.startAt ? new Date(t.startAt) : null,
      end: t.endAt ? new Date(t.endAt) : null,
    })),
    now
  );
  const pxPerDay = 36;
  const dayHeader = buildDayHeader(origin, windowDays, pxPerDay, now);
  const totalWidth = windowDays * pxPerDay;
  const totalRowsHeight = tasks.length * ROW_H;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left: task names */}
      <div
        className="flex flex-col bg-sidebar flex-shrink-0"
        style={{ width: 280, borderRight: "1px solid var(--border)" }}
      >
        <div style={{ height: HEADER_H, borderBottom: "1px solid var(--border)" }} />
        <div className="flex-1 overflow-hidden">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center px-3 text-[13px] truncate"
              style={{ height: ROW_H, borderBottom: "1px solid var(--border)" }}
            >
              {t.title}
            </div>
          ))}
        </div>
      </div>

      {/* Right: timeline */}
      <div className="flex-1 overflow-auto bg-background">
        <DateHeader
          kind="Day"
          cells={dayHeader.cells}
          groups={dayHeader.groups}
          totalWidth={totalWidth}
        />
        <div
          className="relative"
          style={{ width: totalWidth, height: Math.max(totalRowsHeight, 200) }}
        >
          <TimelineGrid cells={dayHeader.cells} />
          {tasks.map((t, i) => {
            const start = t.startAt ? new Date(t.startAt) : null;
            const end = t.endAt ? new Date(t.endAt) : null;
            if (!start || !end) return null;
            const x = dateToPx(startOfDay(start), origin, pxPerDay);
            const w = dateToPx(end, origin, pxPerDay) - x;
            return (
              <div
                key={t.id}
                className="absolute left-0 right-0"
                style={{
                  top: i * ROW_H,
                  height: ROW_H,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <GanttBar task={t} x={x} w={w} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
