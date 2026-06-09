import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { markRead } from "@/lib/projects/notifications";

export const runtime = "nodejs";

const Input = z.object({
  // Either a list of ids, or "all".
  ids: z.union([z.array(z.string().uuid()).max(100), z.literal("all")]),
});

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  await markRead(user.id, parsed.data.ids);
  return NextResponse.json({ ok: true });
}
