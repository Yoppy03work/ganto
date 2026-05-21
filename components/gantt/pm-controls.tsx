"use client";

import { useState } from "react";
import { Flag, GitCommitHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { Milestone } from "./milestone-layer";

export type BaselineMeta = { id: string; name: string; createdAt: string };

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Milestones management popover: list + inline add + delete. */
export function MilestonesManager({
  projectId,
  milestones,
  onChange,
  canEdit,
}: {
  projectId: string;
  milestones: Milestone[];
  onChange: (next: Milestone[]) => void;
  canEdit: boolean;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => isoDay(new Date()));
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: title.trim(),
          date: new Date(date).toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.id !== "string") {
        toast.error(typeof data.error === "string" ? data.error : "追加に失敗しました");
        return;
      }
      onChange([
        ...milestones,
        {
          id: data.id,
          title: title.trim(),
          date: new Date(date).toISOString(),
          color: null,
          lockVersion: 0,
        },
      ].sort((a, b) => a.date.localeCompare(b.date)));
      setTitle("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = milestones;
    onChange(milestones.filter((m) => m.id !== id));
    const res = await fetch(`/api/projects/${projectId}/milestones/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      toast.error("削除に失敗しました");
      onChange(prev);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input text-xs font-medium text-muted-foreground hover:text-foreground"
          title="マイルストーン"
        >
          <Flag className="size-3.5" />
          {milestones.length > 0 && <span>{milestones.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold">マイルストーン</h3>
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {milestones.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              まだありません
            </div>
          )}
          {milestones.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px]">{m.title}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {new Date(m.date).toLocaleDateString()}
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(m.id)}
                  className="text-muted-foreground hover:text-destructive text-xs shrink-0"
                  aria-label="削除"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="border-t border-border p-3 space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="マイルストーン名"
              className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" onClick={add} disabled={busy || !title.trim()}>
                追加
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Baseline overlay selector + "save baseline" button. */
export function BaselineControls({
  projectId,
  baselines,
  activeId,
  onSelect,
  onCreated,
  canEdit,
}: {
  projectId: string;
  baselines: BaselineMeta[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onCreated: (b: BaselineMeta) => void;
  canEdit: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function save() {
    const name = prompt(
      "ベースライン名を入力（例: v1 計画）",
      `Baseline ${new Date().toLocaleDateString()}`
    );
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.id !== "string") {
        toast.error(typeof data.error === "string" ? data.error : "保存に失敗しました");
        return;
      }
      const meta: BaselineMeta = {
        id: data.id,
        name,
        createdAt: new Date().toISOString(),
      };
      onCreated(meta);
      onSelect(meta.id);
      toast.success(`ベースライン「${name}」を保存しました（${data.taskCount} タスク）`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={activeId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="h-7 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        title="ベースライン重ね合わせ"
      >
        <option value="">Baseline: なし</option>
        {baselines.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {canEdit && (
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input text-xs font-medium text-muted-foreground hover:text-foreground"
          title="現在の計画をベースラインとして保存"
        >
          <GitCommitHorizontal className="size-3.5" />
          保存
        </button>
      )}
    </div>
  );
}
