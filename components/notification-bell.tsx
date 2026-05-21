"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type Notification = {
  id: string;
  projectId: string;
  taskId: string | null;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
};

/**
 * Header bell with unread badge + popover list. Polls every 60s for new
 * notifications (lightweight — a single indexed query). Clicking an item
 * navigates to its project and marks everything read.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Captured on the client (null during SSR) so relative-time rendering stays
  // pure and hydration-safe. Refreshed on each poll.
  const [nowMs, setNowMs] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      // `await` first so the setState calls below run in a microtask, not
      // synchronously within the effect body (avoids set-state-in-effect).
      const res = await fetch("/api/notifications", { credentials: "same-origin" });
      setNowMs(Date.now());
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: Notification[]; unread: number };
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      // ignore — best effort
    }
  }, []);

  useEffect(() => {
    // load() only setStates after an `await fetch`, so this is not a
    // synchronous set-state-in-effect; the lint rule can't see through the
    // async boundary, hence the scoped disable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  async function markAllRead() {
    if (unread === 0) return;
    setUnread(0);
    setItems((arr) => arr.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ids: "all" }),
    }).catch(() => {});
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v && unread > 0) void markAllRead();
  }

  function go(n: Notification) {
    setOpen(false);
    router.push(`/p/${n.projectId}`);
  }

  function relTime(iso: string): string {
    if (nowMs === null) return new Date(iso).toLocaleDateString();
    const min = Math.floor((nowMs - new Date(iso).getTime()) / 60_000);
    if (min < 1) return "たった今";
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
          title="通知"
          aria-label="通知"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold">通知</h3>
        </div>
        <div className="max-h-96 overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              通知はありません
            </div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => go(n)}
              className={
                "w-full text-left px-3 py-2 hover:bg-muted/40 flex flex-col gap-0.5 " +
                (n.readAt ? "" : "bg-primary/5")
              }
            >
              <span className="text-[13px] leading-snug">{n.title}</span>
              {n.body && (
                <span className="text-[11px] text-muted-foreground truncate">{n.body}</span>
              )}
              <span className="text-[10px] text-muted-foreground font-mono">
                {relTime(n.createdAt)}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
