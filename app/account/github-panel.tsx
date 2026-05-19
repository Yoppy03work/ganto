"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Initial state passed from the server so the connected/not-connected UI
 * doesn't flash on first paint. Banner is the success / error message from
 * the latest OAuth round-trip (?gh=connected / ?gh_error=...).
 */
type Initial =
  | {
      connected: true;
      githubLogin: string | null;
      scope: string | null;
      connectedAt: string | null;
    }
  | { connected: false };

type Banner = { kind: "success" | "error"; message: string } | null;

export function AccountGitHubPanel({
  initial,
  banner,
}: {
  initial: Initial;
  banner: Banner;
}) {
  const router = useRouter();
  const [state, setState] = useState<Initial>(initial);
  const [busy, setBusy] = useState(false);

  function connect() {
    // Use a real navigation (not fetch) so the browser carries cookies
    // through the GitHub round-trip and back to /api/github/oauth/callback.
    setBusy(true);
    window.location.assign("/api/github/oauth/init");
  }

  async function disconnect() {
    if (!confirm("GitHub アカウントの接続を解除しますか？同期できなくなります。")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/github/oauth/disconnect", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "解除に失敗しました");
        setBusy(false);
        return;
      }
      setState({ connected: false });
      toast.success("GitHub の接続を解除しました");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ネットワークエラー");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm font-semibold">GitHub</h2>
          <p className="text-sm text-muted-foreground">
            GitHub Projects v2 と双方向同期するためには、あなたの GitHub
            アカウントを接続してください。接続中は、あなたがアクセスできる
            Project だけが Pull / Push の対象になります。
          </p>
        </div>
      </div>

      {banner && (
        <div
          role="alert"
          className={
            banner.kind === "success"
              ? "rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm"
              : "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          }
        >
          {banner.message}
        </div>
      )}

      {state.connected ? (
        <div className="space-y-3">
          <div className="text-sm">
            <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500" />
              Connected
            </span>
            {state.githubLogin && (
              <span className="text-muted-foreground ml-3">
                as <code className="font-mono">@{state.githubLogin}</code>
              </span>
            )}
          </div>
          {state.scope && (
            <p className="text-[11px] text-muted-foreground">
              Scopes: <code className="font-mono">{state.scope}</code>
            </p>
          )}
          <Button variant="outline" onClick={disconnect} disabled={busy}>
            {busy ? "..." : "Disconnect"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">未接続</div>
          <Button onClick={connect} disabled={busy}>
            {busy ? "..." : "Connect GitHub"}
          </Button>
        </div>
      )}
    </section>
  );
}
