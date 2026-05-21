import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/server";
import { getGitHubConnection } from "@/lib/github/get-user-token";
import { AccountGitHubPanel } from "./github-panel";
import { SessionsPanel } from "./sessions-panel";

export const dynamic = "force-dynamic";

/**
 * Account settings page. The single section for now is GitHub OAuth
 * connection management. Server-side renders the initial "connected /
 * not connected" state so the panel doesn't flash empty on first paint.
 */
export default async function AccountPage({
  searchParams,
}: {
  // Supports ?gh=connected (success after callback) or ?gh_error=<reason>
  searchParams: Promise<{
    gh?: string;
    gh_error?: string;
    detail?: string;
  }>;
}) {
  const user = await requireCurrentUser();
  const conn = await getGitHubConnection(user.id);
  const params = await searchParams;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="font-mono text-base font-semibold tracking-tight hover:underline"
          >
            ganto
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm">Account</span>
        </div>
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </header>

      <main className="max-w-2xl mx-auto w-full px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            外部サービスとの接続を管理します。GitHub Projects v2 同期を使うには、
            自分の GitHub アカウントを接続してください。
          </p>
        </div>

        <AccountGitHubPanel
          initial={
            conn.connected
              ? {
                  connected: true as const,
                  githubLogin: conn.githubLogin,
                  scope: conn.scope,
                  connectedAt: conn.connectedAt?.toISOString() ?? null,
                }
              : { connected: false as const }
          }
          banner={
            params.gh === "connected"
              ? { kind: "success", message: "GitHub アカウントを接続しました。" }
              : params.gh_error
                ? {
                    kind: "error",
                    message: friendlyError(params.gh_error, params.detail),
                  }
                : null
          }
        />

        <SessionsPanel />
      </main>
    </div>
  );
}

function friendlyError(code: string, detail?: string): string {
  switch (code) {
    case "state_mismatch":
      return "認証フローが古いか、ブラウザがクッキーをブロックした可能性があります。もう一度お試しください。";
    case "missing_params":
      return "GitHub からの応答が不完全でした。再度お試しください。";
    case "access_denied":
      return "GitHub での認可がキャンセルされました。";
    case "exchange_failed":
      return `GitHub との通信でエラーが発生しました${detail ? `: ${detail}` : "。"}`;
    default:
      return `エラー: ${code}${detail ? ` (${detail})` : ""}`;
  }
}
