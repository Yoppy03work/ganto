import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import {
  GH_STATE_COOKIE,
  exchangeCodeForToken,
  fetchGitHubUser,
} from "@/lib/github/oauth";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * GitHub OAuth callback. GitHub redirects here after the user authorizes
 * (or cancels). We:
 *  1. Verify the state param matches the cookie we set in /init
 *     — CSRF protection. Mismatch = abort, no state pollution to clean up.
 *  2. Swap the code for an access_token via GitHub's token endpoint.
 *  3. Fetch the user's GitHub login + numeric id (for display).
 *  4. Upsert into github_user_tokens scoped to the current ganto user.
 *  5. Clear the state cookie and redirect to /account with a marker.
 *
 * Errors bubble up as a redirect to /account?gh=error=<reason> so the UI
 * can show a meaningful message without exposing raw GitHub responses.
 */
export async function GET(req: NextRequest) {
  // Build absolute /account URL for redirect responses (Vercel needs full
  // origin in NextResponse.redirect).
  const accountUrl = new URL("/account", req.url);

  const user = await requireCurrentUser();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const ghError = url.searchParams.get("error");

  // Always clear the state cookie at the end of this request — single-use.
  const clearStateCookie = (resp: NextResponse) => {
    resp.cookies.set(GH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return resp;
  };

  if (ghError) {
    // User cancelled on GitHub, or GitHub rejected the request.
    accountUrl.searchParams.set("gh_error", ghError);
    return clearStateCookie(NextResponse.redirect(accountUrl, 302));
  }

  if (!code || !stateParam) {
    accountUrl.searchParams.set("gh_error", "missing_params");
    return clearStateCookie(NextResponse.redirect(accountUrl, 302));
  }

  const stateCookie = req.cookies.get(GH_STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== stateParam) {
    // CSRF check failed — refuse to proceed.
    accountUrl.searchParams.set("gh_error", "state_mismatch");
    return clearStateCookie(NextResponse.redirect(accountUrl, 302));
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    const ghUser = await fetchGitHubUser(tokens.access_token);

    // Upsert via DELETE + INSERT inside a transaction so we never end up
    // with a half-written row. Drizzle has onConflict but the table has a
    // unique on user_id, so a deterministic delete-then-insert is simpler
    // and keeps the access_token field always overwritten.
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.githubUserTokens)
        .where(eq(schema.githubUserTokens.userId, user.id));
      await tx.insert(schema.githubUserTokens).values({
        userId: user.id,
        githubUserId: String(ghUser.id),
        githubLogin: ghUser.login,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        scope: tokens.scope ?? null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      });
    });

    await recordAudit({
      projectId: null,
      actorId: user.id,
      action: "github.connect",
      targetType: "user",
      targetId: user.id,
      after: { githubLogin: ghUser.login, githubUserId: ghUser.id },
    });

    accountUrl.searchParams.set("gh", "connected");
    return clearStateCookie(NextResponse.redirect(accountUrl, 302));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    accountUrl.searchParams.set("gh_error", "exchange_failed");
    accountUrl.searchParams.set("detail", msg.slice(0, 200));
    return clearStateCookie(NextResponse.redirect(accountUrl, 302));
  }
}
