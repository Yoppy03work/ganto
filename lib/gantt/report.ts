/**
 * Weekly progress report + burndown computation. Pure (no DB) so it can be
 * unit-tested and used either side.
 */

import { startOfDay, startOfWeek, addDays } from "./date";

export type ReportTask = {
  status: string;
  startAt: string | null; // ISO
  endAt: string | null; // ISO
};

export type ReportSummary = {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  backlog: number;
  overdue: number; // not done/backlog, end < today
};

export type BurndownPoint = {
  weekLabel: string;
  /** Ideal remaining (linear from total → 0 across the project span). */
  ideal: number;
  /** Actual remaining = tasks whose end is on/after this week and not done. */
  remaining: number;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function reportSummary(tasks: ReportTask[], now = new Date()): ReportSummary {
  const today = startOfDay(now).getTime();
  const s: ReportSummary = {
    total: tasks.length,
    done: 0,
    inProgress: 0,
    todo: 0,
    backlog: 0,
    overdue: 0,
  };
  for (const t of tasks) {
    switch (t.status) {
      case "Done": s.done++; break;
      case "In Progress": s.inProgress++; break;
      case "Backlog": s.backlog++; break;
      default: s.todo++; break;
    }
    if (t.status !== "Done" && t.status !== "Backlog" && t.endAt) {
      if (startOfDay(new Date(t.endAt)).getTime() < today) s.overdue++;
    }
  }
  return s;
}

/**
 * Burndown: for each week from the earliest start to the latest end, plot the
 * number of not-done tasks whose end falls on/after that week ("remaining")
 * against a linear ideal line.
 */
export function burndown(tasks: ReportTask[], now = new Date()): BurndownPoint[] {
  const withDates = tasks.filter((t) => t.startAt || t.endAt);
  if (withDates.length === 0) return [];

  let min: Date | null = null;
  let max: Date | null = null;
  for (const t of withDates) {
    if (t.startAt) {
      const d = new Date(t.startAt);
      if (!min || d < min) min = d;
    }
    if (t.endAt) {
      const d = new Date(t.endAt);
      if (!max || d > max) max = d;
    }
  }
  const start = startOfWeek(min ?? now);
  const end = max ?? addDays(now, 7);

  const weeks: Date[] = [];
  let w = new Date(start);
  let guard = 0;
  while (w <= end && guard < 260) {
    weeks.push(new Date(w));
    w = addDays(w, 7);
    guard++;
  }
  if (weeks.length === 0) weeks.push(new Date(start));

  const total = tasks.length;
  const points: BurndownPoint[] = weeks.map((wk, i) => {
    const wkEnd = addDays(wk, 7);
    // Remaining = tasks not Done whose end is on/after this week's end (i.e.
    // still expected to be open through this week).
    let remaining = 0;
    for (const t of tasks) {
      if (t.status === "Done") continue;
      const e = t.endAt ? new Date(t.endAt) : null;
      if (!e || e >= wkEnd) remaining++;
    }
    const ideal = Math.round(total * (1 - i / Math.max(1, weeks.length - 1)));
    return {
      weekLabel: `${MONTHS[wk.getMonth()]} ${wk.getDate()}`,
      ideal,
      remaining,
    };
  });
  return points;
}
