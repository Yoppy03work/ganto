"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actorName: string | null;
};

/** Human label for each audit action relevant to a task. */
const ACTION_LABEL: Record<string, string> = {
  "task.create": "作成",
  "task.update": "更新",
  "task.delete": "削除",
  "task.restore": "復元",
  "task.assignee.add": "担当者を追加",
  "task.assignee.remove": "担当者を削除",
  "task.dependency.add": "依存を追加",
  "task.dependency.remove": "依存を削除",
  "comment.create": "コメント",
  "comment.delete": "コメント削除",
};

export function TaskHistory({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/tasks/${taskId}/audit`,
          { credentials: "same-origin" }
        );
        if (!res.ok) {
          if (!cancelled) setError(`読み込みに失敗しました (${res.status})`);
          return;
        }
        const data = (await res.json()) as { entries: AuditEntry[] };
        if (!cancelled) setEntries(data.entries);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (entries === null) {
    return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  }
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">変更履歴はまだありません。</p>
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 text-[13px]">
          <div className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">
                {ACTION_LABEL[e.action] ?? e.action}
              </span>
              <time className="text-[11px] text-muted-foreground shrink-0">
                {new Date(e.createdAt).toLocaleString()}
              </time>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {e.actorName ?? "(unknown)"}
            </div>
            <ChangeDetail before={e.before} after={e.after} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Render a compact diff of changed fields. We only show the `after` keys that
 * differ, with their before → after values when both exist.
 */
function ChangeDetail({ before, after }: { before: unknown; after: unknown }) {
  const a = (after && typeof after === "object" ? after : null) as Record<
    string,
    unknown
  > | null;
  const b = (before && typeof before === "object" ? before : null) as Record<
    string,
    unknown
  > | null;
  if (!a) return null;

  const fmt = (v: unknown): string => {
    if (v == null) return "—";
    if (typeof v === "string") {
      // Truncate ISO timestamps to date for readability.
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
      return v;
    }
    return String(v);
  };

  const keys = Object.keys(a).filter((k) => k !== "lockVersion");
  if (keys.length === 0) return null;

  return (
    <ul className="mt-0.5 space-y-0.5">
      {keys.map((k) => (
        <li key={k} className="text-[11px] text-muted-foreground">
          <span className="font-mono">{k}</span>:{" "}
          {b && k in b ? (
            <>
              <span className="line-through opacity-60">{fmt(b[k])}</span>{" "}
              → <span className="text-foreground">{fmt(a[k])}</span>
            </>
          ) : (
            <span className="text-foreground">{fmt(a[k])}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
