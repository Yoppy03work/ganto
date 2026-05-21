import { NextResponse } from "next/server";
import { auth, requireCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";

/**
 * List the current user's active sessions (devices) via Neon Auth / Better
 * Auth. Shape is normalized defensively since this is a beta SDK.
 */
export async function GET() {
  await requireCurrentUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (auth as any).listSessions();
  // Better Auth returns { data, error } from client-style methods.
  const data = res?.data ?? res ?? [];
  const list: unknown[] = Array.isArray(data) ? data : data?.sessions ?? [];
  const sessions = list.map((s) => {
    const o = s as Record<string, unknown>;
    return {
      token: String(o.token ?? o.id ?? ""),
      createdAt: o.createdAt ? String(o.createdAt) : null,
      updatedAt: o.updatedAt ? String(o.updatedAt) : null,
      userAgent: o.userAgent ? String(o.userAgent) : null,
      ipAddress: o.ipAddress ? String(o.ipAddress) : null,
    };
  });
  return NextResponse.json({ sessions });
}
