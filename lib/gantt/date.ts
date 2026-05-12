/**
 * Day-scale date utilities for the Gantt timeline.
 *
 * Tasks are stored as `start_at` / `end_at` timestamptz in the DB. The Gantt
 * uses a "px per day" coordinate system: pixel X is just `(date - origin) * pxPerDay`.
 *
 * For Phase 3 MVP we only support the Day scale. Other scales come later.
 */

import { isHoliday } from "./holidays";

export type ScaleKey = "Day" | "Week" | "Month";

export const SCALE_PX_PER_DAY: Record<ScaleKey, number> = {
  Day: 36,
  Week: 12,
  Month: 4,
};

/** Default DAY_PX kept as a re-export for code that hasn't migrated yet. */
export const DAY_PX = SCALE_PX_PER_DAY.Day;
export const ROW_H = 52;
export const BAR_H = 36;
/** Total height of the date header (super row + day row + 1px borders). */
export const HEADER_H = 24 + 42 + 2;
/** Height of the task list toolbar in the left pane. */
export const TOOLBAR_H = 32;

/** Strip the time-of-day from a Date, returning a new Date at local 00:00. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Whole-day difference between two dates (positive if a > b). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Convert a date to its X position relative to a window-start origin. */
export function dateToPx(date: Date, origin: Date, pxPerDay = DAY_PX): number {
  return daysBetween(date, origin) * pxPerDay;
}

/** Inverse of dateToPx — snaps X back to the start of the day. */
export function pxToDate(x: number, origin: Date, pxPerDay = DAY_PX): Date {
  const days = Math.round(x / pxPerDay);
  return addDays(startOfDay(origin), days);
}

/** Pixel X for "now", with sub-day precision. Only used for the Today line. */
export function todayPx(origin: Date, pxPerDay = DAY_PX, now = new Date()): number {
  const dayMs = 86_400_000;
  return ((now.getTime() - startOfDay(origin).getTime()) / dayMs) * pxPerDay;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_SHORT = ["S","M","T","W","T","F","S"];

export type DayCell = {
  date: Date;
  day: number;       // 1..31
  dow: number;       // 0..6 (Sun..Sat)
  dowLabel: string;  // S/M/T/W/T/F/S
  isWeekend: boolean;
  isHoliday: boolean;
  /** True for Sunday OR a national holiday — both share the warm tint. */
  isOff: boolean;
  isToday: boolean;
  widthPx: number;
};

export type MonthGroup = {
  key: string;        // YYYY-MM
  label: string;      // "Apr"
  year: number;
  widthPx: number;
};

export type WeekCell = {
  date: Date;     // start-of-week
  label: string;  // e.g. "Apr 27"
  widthPx: number;
};

export type MonthCell = {
  date: Date;     // first of month
  label: string;
  widthPx: number;
};

export type YearGroup = {
  key: string;
  label: string;
  widthPx: number;
};

export type GanttHeader =
  | { kind: "Day"; days: DayCell[]; months: MonthGroup[] }
  | { kind: "Week"; weeks: WeekCell[]; months: MonthGroup[] }
  | { kind: "Month"; months: MonthCell[]; years: YearGroup[] };

/**
 * Build the date-header structure for a window of `windowDays` days starting
 * at `origin`. Caller chooses how big the window is. Today is highlighted if
 * it falls inside.
 */
export function buildDayHeader(
  origin: Date,
  windowDays: number,
  pxPerDay = DAY_PX,
  now = new Date()
): { cells: DayCell[]; groups: MonthGroup[] } {
  const start = startOfDay(origin);
  const cells: DayCell[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    const holiday = isHoliday(d);
    cells.push({
      date: d,
      day: d.getDate(),
      dow,
      dowLabel: DOW_SHORT[dow],
      isWeekend: dow === 0 || dow === 6,
      isHoliday: holiday,
      // Sunday OR holiday share the warm tint; Saturday keeps its cool tint.
      isOff: dow === 0 || holiday,
      isToday: sameDay(d, now),
      widthPx: pxPerDay,
    });
  }

  const groups: MonthGroup[] = [];
  let cur: MonthGroup | null = null;
  for (const c of cells) {
    const key = `${c.date.getFullYear()}-${c.date.getMonth()}`;
    if (!cur || cur.key !== key) {
      cur = {
        key,
        label: MONTHS[c.date.getMonth()],
        year: c.date.getFullYear(),
        widthPx: 0,
      };
      groups.push(cur);
    }
    cur.widthPx += c.widthPx;
  }

  return { cells, groups };
}

/**
 * Pick a sensible window for the Gantt: starts ~25% before the earliest task
 * (or today, whichever is earlier) and ends ~25% after the latest task (or 8
 * weeks from today, whichever is later). Returns origin date and window width
 * in days.
 */
export function autoWindow(
  taskRanges: { start: Date | null; end: Date | null }[],
  now = new Date()
): { origin: Date; windowDays: number } {
  const today = startOfDay(now);
  let earliest = today;
  let latest = addDays(today, 8 * 7);
  for (const t of taskRanges) {
    if (t.start && t.start < earliest) earliest = startOfDay(t.start);
    if (t.end && t.end > latest) latest = startOfDay(t.end);
  }
  // pad
  const padDays = 7;
  const origin = addDays(earliest, -padDays);
  const total = daysBetween(latest, origin) + padDays;
  return { origin, windowDays: Math.max(28, total) };
}

/** Start-of-week (Monday-based) for a date. */
export function startOfWeek(d: Date, weekStartsOn: number = 1): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

/** Build a Week-scale header: primary cells = weeks (label = "MMM D"), groups = months. */
export function buildWeekHeader(
  origin: Date,
  windowDays: number,
  pxPerDay: number
): { weeks: WeekCell[]; months: MonthGroup[] } {
  const start = startOfDay(origin);
  const end = addDays(start, windowDays);

  const weeks: WeekCell[] = [];
  let weekStart = startOfWeek(start);
  while (weekStart < end) {
    const next = addDays(weekStart, 7);
    const segStart = weekStart < start ? start : weekStart;
    const segEnd = next > end ? end : next;
    const days = daysBetween(segEnd, segStart);
    weeks.push({
      date: new Date(segStart),
      label: `${MONTHS[segStart.getMonth()]} ${segStart.getDate()}`,
      widthPx: days * pxPerDay,
    });
    weekStart = next;
  }

  // Month groups span days, accumulated.
  const months: MonthGroup[] = [];
  let cur: MonthGroup | null = null;
  for (let d = new Date(start); d < end; d = addDays(d, 1)) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!cur || cur.key !== key) {
      cur = {
        key,
        label: MONTHS[d.getMonth()],
        year: d.getFullYear(),
        widthPx: 0,
      };
      months.push(cur);
    }
    cur.widthPx += pxPerDay;
  }
  return { weeks, months };
}

/** Build a Month-scale header: primary cells = months, groups = years. */
export function buildMonthHeader(
  origin: Date,
  windowDays: number,
  pxPerDay: number
): { months: MonthCell[]; years: YearGroup[] } {
  const start = startOfDay(origin);
  const end = addDays(start, windowDays);

  const months: MonthCell[] = [];
  let mStart = new Date(start.getFullYear(), start.getMonth(), 1);
  while (mStart < end) {
    const next = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 1);
    const segStart = mStart < start ? start : mStart;
    const segEnd = next > end ? end : next;
    const days = daysBetween(segEnd, segStart);
    months.push({
      date: new Date(mStart),
      label: MONTHS[mStart.getMonth()],
      widthPx: days * pxPerDay,
    });
    mStart = next;
  }

  const years: YearGroup[] = [];
  let cur: YearGroup | null = null;
  for (let d = new Date(start); d < end; d = addDays(d, 1)) {
    const key = String(d.getFullYear());
    if (!cur || cur.key !== key) {
      cur = { key, label: key, widthPx: 0 };
      years.push(cur);
    }
    cur.widthPx += pxPerDay;
  }
  return { months, years };
}

