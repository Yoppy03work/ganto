"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Session = {
  token: string;
  createdAt: string | null;
  userAgent: string | null;
  ipAddress: string | null;
};

/**
 * Active sessions (devices) for the current user, with per-session revoke.
 * Lets a user sign out a lost / unrecognized device.
 */
export function SessionsPanel() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/account/sessions", { credentials: "same-origin" });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { sessions: Session[] };
      if (!cancelled) setSessions(data.sessions);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(token: string) {
    if (!confirm("このセッションをログアウトしますか？")) return;
    setBusy(token);
    try {
      const res = await fetch("/api/account/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        toast.error("ログアウトに失敗しました");
        return;
      }
      setSessions((arr) => (arr ?? []).filter((s) => s.token !== token));
      toast.success("セッションをログアウトしました");
    } finally {
      setBusy(null);
    }
  }

  function prettyAgent(ua: string | null): string {
    if (!ua) return "不明なデバイス";
    if (/iphone|ipad|ios/i.test(ua)) return "iOS";
    if (/android/i.test(ua)) return "Android";
    if (/mac/i.test(ua)) return "Mac";
    if (/windows/i.test(ua)) return "Windows";
    if (/linux/i.test(ua)) return "Linux";
    return ua.slice(0, 40);
  }

  return (
    <section className="rounded-md border border-border bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold">アクティブなセッション</h2>
      <p className="text-sm text-muted-foreground">
        ログイン中のデバイス。見覚えのないものはログアウトしてください。
      </p>
      {sessions === null ? (
        <p className="text-xs text-muted-foreground">読み込み中…</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">セッション情報がありません。</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.token}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate">{prettyAgent(s.userAgent)}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {s.ipAddress ?? "—"}
                  {s.createdAt && ` · ${new Date(s.createdAt).toLocaleDateString()}`}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === s.token}
                onClick={() => revoke(s.token)}
              >
                {busy === s.token ? "..." : "ログアウト"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
