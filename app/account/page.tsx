import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { AccountGitHubPanel } from "./github-panel";

export const dynamic = "force-dynamic";

/**
 * Account settings page. The single section for now is GitHub OAuth
 * connection management. Server-side renders the initial "connected /
 * not connected" state so the panel doesn't flash empty on first paint.
 */
export default async function AccountPage() {
  const user = await requireCurrentUser();

  const rows = await db
    .select({
      accountId: schema.neonAccounts.accountId,
      scope: schema.neonAccounts.scope,
      updatedAt: schema.neonAccounts.updatedAt,
    })
    .from(schema.neonAccounts)
    .where(
      and(
        eq(schema.neonAccounts.userId, user.id),
        eq(schema.neonAccounts.providerId, "github")
      )
    )
    .limit(1);

  const initial = rows[0]
    ? {
        connected: true as const,
        accountId: rows[0].accountId,
        scope: rows[0].scope,
        updatedAt: rows[0].updatedAt?.toISOString() ?? null,
      }
    : { connected: false as const };

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

        <AccountGitHubPanel initial={initial} />
      </main>
    </div>
  );
}
