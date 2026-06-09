"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Token = { id: string; token: string; createdAt: string };

/**
 * Manage public read-only share links. Creating one widens the project's
 * audience, so this section is only rendered for users with project.settings.
 */
export function ShareManager({
  projectId,
  initial,
  appUrl,
}: {
  projectId: string;
  initial: Token[];
  appUrl: string;
}) {
  const [tokens, setTokens] = useState<Token[]>(initial);
  const [busy, setBusy] = useState(false);

  function shareUrl(token: string): string {
    const base = appUrl.replace(/\/+$/, "");
    return `${base}/share/${token}`;
  }

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.token !== "string" || typeof data.id !== "string") {
        toast.error(typeof data.error === "string" ? data.error : "作成に失敗しました");
        return;
      }
      // Use the server-assigned id so revoke targets the real DB row.
      setTokens((arr) => [
        {
          id: data.id,
          token: data.token,
          createdAt:
            typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
        },
        ...arr,
      ]);
      toast.success("共有リンクを作成しました");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("この共有リンクを無効化しますか？")) return;
    const prev = tokens;
    setTokens((arr) => arr.filter((t) => t.id !== id));
    const res = await fetch(`/api/projects/${projectId}/share/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      toast.error("無効化に失敗しました");
      setTokens(prev);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast.success("URL をコピーしました");
    } catch {
      toast.error("コピーに失敗しました");
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">共有リンク（読み取り専用）</h2>
        <Button size="sm" onClick={create} disabled={busy}>
          {busy ? "..." : "リンクを作成"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        リンクを知っている人は誰でも、ログインなしでこのプロジェクトのガント
        （公開タスクのみ）を閲覧できます。
      </p>
      {tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground">まだ共有リンクはありません。</p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
            >
              <code className="flex-1 min-w-0 truncate text-[11px] font-mono text-muted-foreground">
                {shareUrl(t.token)}
              </code>
              <button
                onClick={() => copy(t.token)}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline shrink-0"
              >
                コピー
              </button>
              <button
                onClick={() => revoke(t.id)}
                className="text-[11px] text-muted-foreground hover:text-destructive shrink-0"
              >
                無効化
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
