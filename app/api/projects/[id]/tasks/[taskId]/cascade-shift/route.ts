import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { shiftDownstream } from "@/lib/projects/cascade";

export const runtime = "nodejs";

const Input = z.object({
  deltaDays: z.number().int(),
});

/**
 * Shift all downstream dependents of this task by deltaDays. Called by the
 * client after a successful date change when "auto-shift dependents" is on.
 * Requires task.update (all scope) — cascading touches other people's tasks.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "task.update"))) {
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
  const result = await shiftDownstream({
    projectId,
    taskId,
    actorId: user.id,
    deltaDays: parsed.data.deltaDays,
  });
  return NextResponse.json(result);
}
