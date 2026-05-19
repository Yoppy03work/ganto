import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * Drop the current user's GitHub token row. Sync attempts after this point
 * return 412 GITHUB_NOT_CONNECTED until the user re-links.
 *
 * Note: we don't try to revoke the token on GitHub's side (would require an
 * extra DELETE to https://api.github.com/applications/.../grant). The user
 * can revoke from their GitHub Settings → Applications page if they want a
 * full server-side teardown.
 */
export async function POST() {
  const user = await requireCurrentUser();
  await db
    .delete(schema.githubUserTokens)
    .where(eq(schema.githubUserTokens.userId, user.id));
  await recordAudit({
    projectId: null,
    actorId: user.id,
    action: "github.disconnect",
    targetType: "user",
    targetId: user.id,
  });
  return NextResponse.json({ ok: true });
}
