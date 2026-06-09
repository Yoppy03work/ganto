"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { GanttTaskDTO } from "@/lib/gantt/types";
import { startOfDay } from "@/lib/gantt/date";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

/**
 * Header button surfacing tasks that are overdue or due soon.
 *
 *  - overdue: endAt < today AND status not Done/Backlog
 *  - due soon: today <= endAt <= today + 3 days AND status not Done/Backlog
 *
 * `now` is passed from the parent (which gates time-dependent rendering
 * behind a mount flag) so the counts don't cause hydration mismatches.
 */
const DUE_SOON_DAYS = 3;

type Warned = { task: GanttTaskDTO; kind: "overdue" | "soon"; days: number };

export function WarningButton({
  tasks,
  now,
  onOpenTask,
}: {
  tasks: GanttTaskDTO[];
  now: Date;
  onOpenTask: (id: string) => void;
}) {
  const { overdue, soon } = useMemo(() => {
    const today = startOfDay(now).getTime();
    const dayMs = 86_400_000;
    const overdue: Warned[] = [];
    const soon: Warned[] = [];
    for (const t of tasks) {
      if (t.status === "Done" || t.status === "Backlog") continue;
      if (!t.endAt) continue;
      const end = startOfDay(new Date(t.endAt)).getTime();
      const diffDays = Math.round((end - today) / dayMs);
      if (diffDays < 0) {
        overdue.push({ task: t, kind: "overdue", days: -diffDays });
      } else if (diffDays <= DUE_SOON_DAYS) {
        soon.push({ task: t, kind: "soon", days: diffDays });
      }
    }
    overdue.sort((a, b) => b.days - a.days);
    soon.sort((a, b) => a.days - b.days);
    return { overdue, soon };
  }, [tasks, now]);

  const total = overdue.length + soon.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={
            "relative inline-flex items-center gap-1 h-7 px-2 rounded-md border text-xs font-medium transition-colors " +
            (overdue.length > 0
              ? "border-destructive/40 text-destructive hover:bg-destructive/5"
              : total > 0
                ? "border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/5"
                : "border-input text-muted-foreground hover:text-foreground")
          }
          title="Warnings"
        >
          <AlertTriangle className="size-3.5" />
          {total > 0 && <span>{total}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold">Warnings</h3>
          <p className="text-[11px] text-muted-foreground">
            {overdue.length} overdue · {soon.length} due soon
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {total === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              すべて順調です 🎉
            </div>
          )}
          {overdue.map((w) => (
            <WarnRow key={w.task.id} w={w} onOpenTask={onOpenTask} />
          ))}
          {soon.map((w) => (
            <WarnRow key={w.task.id} w={w} onOpenTask={onOpenTask} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WarnRow({
  w,
  onOpenTask,
}: {
  w: Warned;
  onOpenTask: (id: string) => void;
}) {
  const label =
    w.kind === "overdue"
      ? `${w.days}日 超過`
      : w.days === 0
        ? "今日締切"
        : `あと${w.days}日`;
  return (
    <button
      onClick={() => onOpenTask(w.task.id)}
      className="w-full text-left px-3 py-1.5 hover:bg-muted/50 flex items-center justify-between gap-2"
    >
      <span className="truncate text-[13px]">{w.task.title}</span>
      <span
        className={
          "shrink-0 text-[11px] font-medium " +
          (w.kind === "overdue"
            ? "text-destructive"
            : "text-amber-600 dark:text-amber-400")
        }
      >
        {label}
      </span>
    </button>
  );
}
