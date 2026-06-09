"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Deleted = { id: string; name: string; deletedAt: string };

/**
 * Collapsible "Deleted projects" restore list on the home page. Only rendered
 * when the user has at least one soft-deleted project.
 */
export function DeletedProjects({ initial }: { initial: Deleted[] }) {
  const [items, setItems] = useState<Deleted[]>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function restore(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/projects/${id}/restore`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        toast.error("復元に失敗しました");
        return;
      }
      setItems((arr) => arr.filter((p) => p.id !== id));
      toast.success("プロジェクトを復元しました");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? "▾" : "▸"} 削除済みプロジェクト（{items.length}）
      </button>
      {open && (
        <ul className="mt-2 rounded-md border border-border overflow-hidden max-w-md">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0 text-sm"
            >
              <span className="truncate">{p.name}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === p.id}
                onClick={() => restore(p.id)}
              >
                {busy === p.id ? "..." : "復元"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
