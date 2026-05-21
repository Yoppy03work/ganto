"use client";

import { dateToPx, startOfDay } from "@/lib/gantt/date";

export type Milestone = {
  id: string;
  title: string;
  date: string; // ISO
  color: string | null;
  lockVersion: number;
};

/**
 * Vertical ◆ markers for milestones, overlaid on the timeline. Rendered behind
 * the bars (the diamond + label sit at the very top so they stay visible).
 */
export function MilestoneLayer({
  milestones,
  origin,
  pxPerDay,
  height,
}: {
  milestones: Milestone[];
  origin: Date;
  pxPerDay: number;
  height: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {milestones.map((m) => {
        const x = dateToPx(startOfDay(new Date(m.date)), origin, pxPerDay);
        const color = m.color || "var(--primary)";
        return (
          <div
            key={m.id}
            className="absolute"
            style={{ left: x, top: 0, height }}
          >
            {/* vertical line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: 1,
                background: `color-mix(in oklab, ${color} 45%, transparent)`,
                height,
              }}
            />
            {/* diamond + label at top */}
            <div
              className="absolute -translate-x-1/2 flex items-center gap-1"
              style={{ left: 0, top: -2, whiteSpace: "nowrap" }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  background: color,
                  transform: "rotate(45deg)",
                  display: "inline-block",
                  borderRadius: 1,
                }}
              />
              <span
                className="text-[10px] font-medium"
                style={{ color }}
              >
                {m.title}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
