import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { getGitHubConnection } from "@/lib/github/get-user-token";

export const runtime = "nodejs";

/**
 * Lightweight status check used by client components that need to know
 * whether the current user has connected GitHub. Returns the GitHub login
 * + scope when connected — never returns the access token itself.
 */
export async function GET() {
  const user = await requireCurrentUser();
  const conn = await getGitHubConnection(user.id);
  return NextResponse.json({
    connected: conn.connected,
    githubLogin: conn.githubLogin,
    scope: conn.scope,
    connectedAt: conn.connectedAt?.toISOString() ?? null,
  });
}
