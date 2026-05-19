"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Subscribe-only "now" that updates once per minute. Returns `null` on the
 * server render so the initial HTML doesn't include a relative timestamp
 * that would mismatch the client (which mounts at a different instant).
 * After mount, returns the current epoch ms and re-renders every minute.
 */
function useNowMs(): number | null {
  return useSyncExternalStore(
    (callback) => {
      const id = window.setInterval(callback, 60_000);
      return () => window.clearInterval(id);
    },
    () => Date.now(),
    () => null
  );
}

type TrashItem = {
  id: string;
  title: string;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
};

export function TrashList({
  projectId,
  initial,
  canDeleteAny,
  currentUserId,
}: {
  projectId: string;
  initial: TrashItem[];
  canDeleteAny: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const nowMs = useNowMs();

  function relTime(iso: string): string {
    const d = new Date(iso);
    if (nowMs === null) return d.toLocaleDateString();
    const diffMs = nowMs - d.getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return "たった今";
    if (min < 60) return `${min} 分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 時間前`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} 日前`;
    return d.toLocaleDateString();
  }

  async function restore(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${id}/restore`,
        { method: "POST", credentials: "same-origin" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          typeof data.error === "string" ? data.error : `復元に失敗しました (${res.status})`
        );
        setBusyId(null);
        return;
      }
      // Drop the restored row from the local list, no need to refetch
      // the entire trash.
      setItems((arr) => arr.filter((t) => t.id !== id));
      toast.success("タスクを復元しました。ガントの末尾に戻ります。");
      // router.refresh() will re-fetch the Gantt page when the user navigates
      // back; for now just stay on the Trash page.
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ネットワークエラー");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        ゴミ箱は空です
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div
        className="grid text-[10.5px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-3 py-2"
        style={{ gridTemplateColumns: "1fr 180px 120px 90px" }}
      >
        <div>Title</div>
        <div>Deleted by</div>
        <div>Deleted</div>
        <div></div>
      </div>
      {items.map((t) => {
        const isMine = t.deletedBy?.id === currentUserId;
        const canRestore = canDeleteAny || isMine;
        return (
          <div
            key={t.id}
            className="grid items-center px-3 py-2 border-t border-border text-sm"
            style={{ gridTemplateColumns: "1fr 180px 120px 90px" }}
          >
            <div className="truncate font-medium">{t.title}</div>
            <div className="text-muted-foreground truncate">
              {t.deletedBy?.name ?? "(unknown)"}
            </div>
            <div className="text-muted-foreground" title={new Date(t.deletedAt).toLocaleString()}>
              {relTime(t.deletedAt)}
            </div>
            <div className="text-right">
              <Button
                size="sm"
                variant="outline"
                disabled={!canRestore || busyId === t.id}
                onClick={() => restore(t.id)}
                title={!canRestore ? "他のメンバーが削除したタスクは復元できません" : undefined}
              >
                {busyId === t.id ? "..." : "Restore"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
