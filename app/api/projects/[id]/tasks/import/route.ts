import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { importTasksCsv } from "@/lib/projects/csv";

export const runtime = "nodejs";

const Input = z.object({
  csv: z.string().min(1).max(2_000_000),
  mode: z.enum(["merge", "replace"]).default("merge"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "task.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const result = await importTasksCsv({
    projectId,
    actorId: user.id,
    csv: parsed.data.csv,
    mode: parsed.data.mode,
  });
  return NextResponse.json(result, { status: 200 });
}
