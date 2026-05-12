"use client";

import type { GanttTaskDTO } from "@/lib/gantt/types";
import { ROW_H } from "@/lib/gantt/date";
import { cn } from "@/lib/utils";

/** Type-tag dot color (subtle accents, only shown next to the chip). */
const TYPE_DOT: Record<string, string> = {
  Feature: "oklch(0.62 0.13 250)", // blue
  Bug:     "oklch(0.62 0.16 25)",  // red
  Chore:   "oklch(0.62 0.10 80)",  // amber
  Docs:    "oklch(0.62 0.12 160)", // teal
  Design:  "oklch(0.62 0.14 305)", // violet
  Infra:   "oklch(0.55 0.02 270)", // slate
};

const STATUS_BADGE: Record<
  string,
  { className: string; iconChar: string }
> = {
  Todo:           { className: "bg-muted text-muted-foreground border border-border", iconChar: "○" },
  "In Progress":  { className: "bg-primary/10 text-primary border border-primary/30", iconChar: "◉" },
  Done:           { className: "bg-secondary text-secondary-foreground", iconChar: "✓" },
  Backlog:        { className: "bg-card text-muted-foreground border border-dashed border-border", iconChar: "◌" },
};

export function TaskListToolbar({ count }: { count: number }) {
  return (
    <div
      className="h-8 flex items-center justify-between pl-3 pr-1.5"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-foreground">Tasks</span>
        <span className="text-xs text-muted-foreground font-mono">({count})</span>
      </div>
    </div>
  );
}

export function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: GanttTaskDTO;
  selected?: boolean;
  onSelect?: (taskId: string) => void;
}) {
  const pct = task.progress != null
    ? Math.round(Math.max(0, Math.min(1, task.progress)) * 100)
    : null;
  const showProgress = pct != null && task.status !== "Backlog";
  const status = STATUS_BADGE[task.status] ?? STATUS_BADGE.Todo;

  return (
    <div
      onClick={() => onSelect?.(task.id)}
      className={cn(
        "relative flex items-center gap-2.5 pl-3 pr-2.5 cursor-default",
        selected && "bg-accent",
      )}
      style={{ height: ROW_H, borderBottom: "1px solid var(--border)" }}
    >
      {selected && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary"
          aria-hidden
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          {task.type && (
            <span
              className="inline-flex items-center h-[16px] px-1.5 rounded-[3px] font-mono text-[9.5px] uppercase tracking-wider gap-1 border border-border bg-card text-muted-foreground"
            >
              <span
                className="inline-block w-[5px] h-[5px] rounded-full"
                style={{ background: TYPE_DOT[task.type] ?? "var(--muted-foreground)" }}
              />
              {task.type.toLowerCase()}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md font-medium font-mono uppercase tracking-wide h-5 px-1.5 text-[10.5px]",
              status.className
            )}
          >
            <span aria-hidden>{status.iconChar}</span>
            <span style={task.status === "Done" ? { textDecoration: "line-through" } : undefined}>
              {task.status}
            </span>
          </span>
          {showProgress && (
            <span className="font-mono text-[9.5px] text-muted-foreground tabular-nums ml-auto pr-0.5">
              {pct}%
            </span>
          )}
        </div>
        <div
          className="text-[13.5px] truncate leading-tight font-medium"
          style={{ color: "var(--foreground)" }}
          title={task.title}
        >
          {task.title}
        </div>
        {showProgress && (
          <div
            className="mt-1 relative"
            style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${pct}%`,
                background: task.status === "Done"
                  ? "color-mix(in oklab, var(--foreground) 55%, transparent)"
                  : "var(--primary)",
              }}
            />
          </div>
        )}
      </div>
      <AvatarStack assignees={task.assignees} max={3} size={22} />
    </div>
  );
}

function AvatarStack({
  assignees,
  max,
  size,
}: {
  assignees: GanttTaskDTO["assignees"];
  max: number;
  size: number;
}) {
  const visible = assignees.slice(0, max);
  const extra = assignees.length - visible.length;
  return (
    <div className="inline-flex items-center" style={{ paddingLeft: 6 }}>
      {visible.map((a, i) => (
        <div key={a.userId} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar name={a.name} image={a.image} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{
            marginLeft: -6,
            width: size,
            height: size,
            fontSize: Math.max(9, Math.floor(size * 0.42)),
          }}
          className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-mono border border-background"
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

function Avatar({
  name,
  image,
  size,
}: {
  name: string;
  image: string | null;
  size: number;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars from arbitrary OAuth providers
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        className="rounded-full bg-muted border border-background"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.floor(size * 0.42)),
      }}
      className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-mono border border-background"
    >
      {initials}
    </div>
  );
}
