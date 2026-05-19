import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";

/**
 * Returns whether the current user has linked their GitHub account, and the
 * provider-side identifier so the UI can render "Connected as @user-12345"
 * (the accountId Better Auth stores is the GitHub numeric user id, not the
 * login — surfacing it is mostly for "confirm you connected the right one"
 * visibility, not for display).
 */
export async function GET() {
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
  if (rows.length === 0) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({
    connected: true,
    accountId: rows[0].accountId,
    scope: rows[0].scope,
    updatedAt: rows[0].updatedAt,
  });
}
