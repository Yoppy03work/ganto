"use client";

import type {
  DayCell,
  MonthGroup,
  WeekCell,
  MonthCell,
  YearGroup,
} from "@/lib/gantt/date";
import { cn } from "@/lib/utils";

type DayProps = {
  kind: "Day";
  cells: DayCell[];
  groups: MonthGroup[];
};

type WeekProps = {
  kind: "Week";
  weeks: WeekCell[];
  months: MonthGroup[];
};

type MonthProps = {
  kind: "Month";
  months: MonthCell[];
  years: YearGroup[];
};

export function DateHeader(
  props: ({ totalWidth: number } & (DayProps | WeekProps | MonthProps))
) {
  if (props.kind === "Day") {
    return <DayHeader cells={props.cells} groups={props.groups} totalWidth={props.totalWidth} />;
  }
  if (props.kind === "Week") {
    return <WeekHeader weeks={props.weeks} months={props.months} totalWidth={props.totalWidth} />;
  }
  return <MonthHeader months={props.months} years={props.years} totalWidth={props.totalWidth} />;
}

function DayHeader({
  cells,
  groups,
  totalWidth,
}: {
  cells: DayCell[];
  groups: MonthGroup[];
  totalWidth: number;
}) {
  return (
    <div
      className="sticky top-0 z-10 bg-background"
      style={{ borderBottom: "1px solid var(--border)", width: totalWidth }}
    >
      <div className="flex h-6" style={{ borderBottom: "1px solid var(--border)" }}>
        {groups.map((g, i) => (
          <div
            key={`${g.key}-${i}`}
            className="flex items-center font-mono text-[11px] text-muted-foreground uppercase tracking-wider overflow-hidden"
            style={{
              width: g.widthPx,
              paddingLeft: 8,
              borderRight: i < groups.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            {g.label}
            <span className="ml-1.5 opacity-60">{g.year}</span>
          </div>
        ))}
      </div>
      <div className="flex h-[42px]">
        {cells.map((c, i) => (
          <div
            key={i}
            className={cn(
              "relative flex flex-col items-center justify-center font-mono overflow-hidden",
              c.dow === 6 && "bg-saturday",
              c.isOff && "bg-sunday"
            )}
            style={{ width: c.widthPx, borderRight: "1px solid var(--border)" }}
          >
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">
              {c.dowLabel}
            </div>
            {c.isToday ? (
              <div className="gantt-today-pill h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-medium leading-none">
                {c.day}
              </div>
            ) : (
              <div
                className={cn(
                  "text-[11px] leading-none",
                  c.isHoliday ? "text-destructive" : "text-foreground"
                )}
                title={c.isHoliday ? "National holiday" : undefined}
              >
                {c.day}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekHeader({
  weeks,
  months,
  totalWidth,
}: {
  weeks: WeekCell[];
  months: MonthGroup[];
  totalWidth: number;
}) {
  return (
    <div
      className="sticky top-0 z-10 bg-background"
      style={{ borderBottom: "1px solid var(--border)", width: totalWidth }}
    >
      <div className="flex h-6" style={{ borderBottom: "1px solid var(--border)" }}>
        {months.map((m, i) => (
          <div
            key={`${m.key}-${i}`}
            className="flex items-center font-mono text-[11px] text-muted-foreground uppercase tracking-wider overflow-hidden"
            style={{
              width: m.widthPx,
              paddingLeft: 8,
              borderRight: i < months.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            {m.label}
            <span className="ml-1.5 opacity-60">{m.year}</span>
          </div>
        ))}
      </div>
      <div className="flex h-[42px]">
        {weeks.map((w, i) => (
          <div
            key={i}
            className="relative flex flex-col items-center justify-center font-mono overflow-hidden"
            style={{ width: w.widthPx, borderRight: "1px solid var(--border)" }}
          >
            <div className="text-[10px] text-foreground leading-none">{w.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthHeader({
  months,
  years,
  totalWidth,
}: {
  months: MonthCell[];
  years: YearGroup[];
  totalWidth: number;
}) {
  return (
    <div
      className="sticky top-0 z-10 bg-background"
      style={{ borderBottom: "1px solid var(--border)", width: totalWidth }}
    >
      <div className="flex h-6" style={{ borderBottom: "1px solid var(--border)" }}>
        {years.map((y, i) => (
          <div
            key={`${y.key}-${i}`}
            className="flex items-center font-mono text-[11px] text-muted-foreground uppercase tracking-wider overflow-hidden"
            style={{
              width: y.widthPx,
              paddingLeft: 8,
              borderRight: i < years.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            {y.label}
          </div>
        ))}
      </div>
      <div className="flex h-[42px]">
        {months.map((m, i) => (
          <div
            key={i}
            className="relative flex flex-col items-center justify-center font-mono overflow-hidden"
            style={{ width: m.widthPx, borderRight: "1px solid var(--border)" }}
          >
            <div className="text-[10px] text-foreground leading-none">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
