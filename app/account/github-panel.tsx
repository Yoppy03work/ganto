"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

/**
 * Initial state passed from the server so the connected/not-connected UI
 * doesn't flash on first paint. After mount the panel re-fetches on demand
 * (after connect/disconnect actions).
 */
type Initial =
  | {
      connected: true;
      accountId: string;
      scope: string | null;
      updatedAt: string | null;
    }
  | { connected: false };

export function AccountGitHubPanel({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [state, setState] = useState<Initial>(initial);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      // Better Auth's linkSocial: redirects to the GitHub OAuth consent
      // screen, then back to callbackURL after the user authorizes. The
      // returned access token is stored by Neon Auth in the `account` table
      // — we never see the raw token client-side.
      // Scopes: read:project + write:project so the user can run both
      // pull and push from any of their projects.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (authClient as any).linkSocial({
        provider: "github",
        callbackURL: "/account?gh=connected",
        scopes: ["read:project", "project"],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start GitHub OAuth");
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("GitHub アカウントの接続を解除しますか？同期できなくなります。")) {
      return;
    }
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (authClient as any).unlinkAccount({ providerId: "github" });
      setState({ connected: false });
      toast.success("GitHub の接続を解除しました");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
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

      {state.connected ? (
        <div className="space-y-3">
          <div className="text-sm">
            <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500" />
              Connected
            </span>
            <span className="text-muted-foreground ml-3">
              GitHub user id: <code className="font-mono">{state.accountId}</code>
            </span>
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
