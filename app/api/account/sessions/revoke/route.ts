import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, requireCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";

const Input = z.object({
  token: z.string().min(1),
});

/** Revoke (sign out) one of the current user's sessions by its token. */
export async function POST(req: Request) {
  await requireCurrentUser();
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (auth as any).revokeSession({ token: parsed.data.token });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}
