"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";

type MyTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
};

const STATUS_DOT: Record<string, string> = {
  Todo: "bg-muted-foreground/40",
  "In Progress": "bg-blue-500",
  Done: "bg-emerald-500",
  Backlog: "bg-muted-foreground/30",
};

/** Client list so "overdue" highlighting can use a hydration-safe `now`. */
export function MyTasksList({ tasks }: { tasks: MyTask[] }) {
  // Hydration-safe current time (null on server).
  const nowMs = useSyncExternalStore(
    () => () => {},
    () => Date.now(),
    () => null as number | null
  );

  // Group by project, preserving the date-sorted order within each.
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: MyTask[] }>();
    for (const t of tasks) {
      const g = m.get(t.projectId) ?? { name: t.projectName, items: [] };
      g.items.push(t);
      m.set(t.projectId, g);
    }
    return Array.from(m.entries());
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        担当しているタスクはありません。
      </div>
    );
  }

  function isOverdue(t: MyTask): boolean {
    if (nowMs === null || !t.endAt) return false;
    if (t.status === "Done" || t.status === "Backlog") return false;
    return new Date(t.endAt).getTime() < nowMs;
  }

  return (
    <div className="space-y-6">
      {groups.map(([projectId, g]) => (
        <section key={projectId}>
          <Link
            href={`/p/${projectId}`}
            className="text-sm font-semibold hover:underline"
          >
            {g.name}
          </Link>
          <ul className="mt-2 rounded-md border border-border overflow-hidden">
            {g.items.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 text-sm"
              >
                <span
                  className={
                    "size-2 rounded-full shrink-0 " +
                    (STATUS_DOT[t.status] ?? "bg-muted-foreground/40")
                  }
                  title={t.status}
                />
                <Link
                  href={`/p/${projectId}`}
                  className="flex-1 min-w-0 truncate hover:underline"
                >
                  {t.title}
                </Link>
                <span
                  className={
                    "text-[11px] font-mono shrink-0 " +
                    (isOverdue(t) ? "text-destructive" : "text-muted-foreground")
                  }
                >
                  {t.endAt ? new Date(t.endAt).toLocaleDateString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
