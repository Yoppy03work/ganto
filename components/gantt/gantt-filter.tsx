"use client";

import { type RefObject } from "react";
import { Search, X } from "lucide-react";
import { TASK_STATUSES, TASK_TYPES } from "@/lib/gantt/types";

export type GanttFilter = {
  query: string;
  status: string; // "" = all
  type: string; // "" = all
  assignee: string; // "" = all, userId otherwise
};

export const EMPTY_FILTER: GanttFilter = {
  query: "",
  status: "",
  type: "",
  assignee: "",
};

export function isFilterActive(f: GanttFilter): boolean {
  return Boolean(f.query.trim() || f.status || f.type || f.assignee);
}

const selectCls =
  "h-7 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function GanttFilterBar({
  filter,
  onChange,
  members,
  inputRef,
}: {
  filter: GanttFilter;
  onChange: (next: GanttFilter) => void;
  members: { userId: string; name: string }[];
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const active = isFilterActive(filter);
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
          placeholder="検索..."
          className="h-7 w-40 rounded-md border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <select
        value={filter.status}
        onChange={(e) => onChange({ ...filter, status: e.target.value })}
        className={selectCls}
        aria-label="Status filter"
      >
        <option value="">Status: All</option>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        value={filter.type}
        onChange={(e) => onChange({ ...filter, type: e.target.value })}
        className={selectCls}
        aria-label="Type filter"
      >
        <option value="">Type: All</option>
        {TASK_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        value={filter.assignee}
        onChange={(e) => onChange({ ...filter, assignee: e.target.value })}
        className={selectCls}
        aria-label="Assignee filter"
      >
        <option value="">Assignee: All</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>

      {active && (
        <button
          onClick={() => onChange(EMPTY_FILTER)}
          className="inline-flex items-center gap-0.5 h-7 px-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground"
          title="フィルタをクリア"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Apply a filter to a task list. Pure — safe to call in a useMemo. */
export function applyFilter<
  T extends {
    title: string;
    status: string;
    type: string | null;
    assignees: { userId: string }[];
  },
>(tasks: T[], f: GanttFilter): T[] {
  if (!isFilterActive(f)) return tasks;
  const q = f.query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.assignee && !t.assignees.some((a) => a.userId === f.assignee)) {
      return false;
    }
    return true;
  });
}
