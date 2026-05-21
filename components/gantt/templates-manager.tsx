"use client";

import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  name: string;
  items: { title: string }[];
  createdAt: string;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Templates: save the current task set as a reusable template, and apply a
 * template at a chosen anchor date (creates the tasks).
 */
export function TemplatesManager({
  projectId,
  initial,
  canEdit,
  onApplied,
}: {
  projectId: string;
  initial: Template[];
  canEdit: boolean;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [anchor, setAnchor] = useState(() => isoDay(new Date()));
  const [busy, setBusy] = useState(false);

  async function saveFromTasks() {
    const name = prompt("テンプレート名（現在のタスクから作成）", "テンプレート");
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/templates`, {
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
      setTemplates((arr) => [
        { id: data.id, name, items: new Array(data.itemCount ?? 0).fill({ title: "" }), createdAt: new Date().toISOString() },
        ...arr,
      ]);
      toast.success(`テンプレート「${name}」を保存（${data.itemCount} タスク）`);
    } finally {
      setBusy(false);
    }
  }

  async function apply(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/templates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "apply", anchorDate: new Date(anchor).toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "適用に失敗しました");
        return;
      }
      toast.success(`${data.created} 件のタスクを作成しました`);
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = templates;
    setTemplates((arr) => arr.filter((t) => t.id !== id));
    const res = await fetch(`/api/projects/${projectId}/templates/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      toast.error("削除に失敗しました");
      setTemplates(prev);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input text-xs font-medium text-muted-foreground hover:text-foreground"
          title="テンプレート"
        >
          <LayoutTemplate className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">テンプレート</h3>
          {canEdit && (
            <button
              onClick={saveFromTasks}
              disabled={busy}
              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              現在から保存
            </button>
          )}
        </div>
        {canEdit && (
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">適用開始日</span>
            <input
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
        )}
        <div className="max-h-60 overflow-y-auto py-1">
          {templates.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              まだありません
            </div>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px]">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t.items.length} タスク
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => apply(t.id)} disabled={busy}>
                    適用
                  </Button>
                )}
                {canEdit && (
                  <button
                    onClick={() => remove(t.id)}
                    className="text-muted-foreground hover:text-destructive text-xs px-1"
                    aria-label="削除"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
