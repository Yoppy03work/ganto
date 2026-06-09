"use client";

import { memo } from "react";

export function TodayLine({ x, height }: { x: number; height: number }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: 0,
        bottom: 0,
        width: 1,
        background: "var(--destructive)",
        height,
      }}
    >
      <div
        className="gantt-today-pill absolute -translate-x-1/2 font-mono text-[9px] uppercase tracking-wider rounded-sm flex items-center justify-center"
        style={{
          left: 0,
          top: -16,
          height: 14,
          padding: "0 6px",
          whiteSpace: "nowrap",
        }}
      >
        Today
      </div>
    </div>
  );
}

type GridCell = {
  isWeekend: boolean;
  isOff: boolean;
  dow: number;
  widthPx: number;
};

/** Faint vertical grid lines + weekend / holiday column tint behind the bars. */
export const TimelineGrid = memo(function TimelineGrid({ cells }: { cells: GridCell[] }) {
  // Pre-compute cumulative left offsets via reduce so render stays pure.
  const positioned = cells.reduce<Array<GridCell & { left: number }>>(
    (acc, c) => {
      const prev = acc[acc.length - 1];
      const left = prev ? prev.left + prev.widthPx : 0;
      acc.push({ ...c, left });
      return acc;
    },
    []
  );
  return (
    <div className="absolute inset-0 pointer-events-none">
      {positioned.map((c, i) => (
        <div
          key={i}
          className={
            c.dow === 6
              ? "bg-saturday"
              : c.isOff
                ? "bg-sunday"
                : ""
          }
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: c.left,
            width: c.widthPx,
            borderRight: "1px solid color-mix(in oklab, var(--border) 60%, transparent)",
          }}
        />
      ))}
    </div>
  );
});
