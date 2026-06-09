/**
 * Resource-load computation: how many active tasks each assignee has running
 * in each week of the project window. Pure (no DB / server-only) so it can be
 * unit-tested and reused on either side.
 */

import { startOfWeek, addDays } from "./date";

export type ResourceTask = {
  startAt: string | null; // ISO
  endAt: string | null; // ISO
  assignees: { userId: string }[];
};

export type ResourceMember = { userId: string; name: string };

export type ResourceGrid = {
  weeks: { start: Date; label: string }[];
  /** rows[userId] = number[] aligned to weeks (count of overlapping tasks). */
  rows: Record<string, number[]>;
  /** Peak load across the whole grid (for color scaling). */
  peak: number;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function computeResourceLoad(
  tasks: ResourceTask[],
  members: ResourceMember[],
  now = new Date()
): ResourceGrid {
  // Determine the window from task dates (fallback: 8 weeks from today).
  let min: Date | null = null;
  let max: Date | null = null;
  for (const t of tasks) {
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
  const end = max ?? addDays(now, 8 * 7);

  // Build weekly buckets.
  const weeks: { start: Date; label: string }[] = [];
  let w = new Date(start);
  let guard = 0;
  while (w <= end && guard < 520) {
    weeks.push({
      start: new Date(w),
      label: `${MONTHS[w.getMonth()]} ${w.getDate()}`,
    });
    w = addDays(w, 7);
    guard++;
  }
  if (weeks.length === 0) {
    weeks.push({ start: new Date(start), label: `${MONTHS[start.getMonth()]} ${start.getDate()}` });
  }

  const rows: Record<string, number[]> = {};
  for (const m of members) rows[m.userId] = new Array(weeks.length).fill(0);

  let peak = 0;
  for (const t of tasks) {
    if (!t.startAt || !t.endAt) continue;
    const ts = new Date(t.startAt);
    const te = new Date(t.endAt);
    for (const a of t.assignees) {
      const row = rows[a.userId];
      if (!row) continue;
      for (let i = 0; i < weeks.length; i++) {
        const ws = weeks[i].start;
        const we = addDays(ws, 7);
        // Task overlaps this week if it starts before week end and ends after
        // week start.
        if (ts < we && te >= ws) {
          row[i] += 1;
          if (row[i] > peak) peak = row[i];
        }
      }
    }
  }

  return { weeks, rows, peak };
}
