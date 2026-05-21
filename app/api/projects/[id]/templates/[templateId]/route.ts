import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { applyTemplate, deleteTemplate } from "@/lib/projects/templates";

export const runtime = "nodejs";

const isoDateLike = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

const ApplyInput = z.object({
  action: z.literal("apply"),
  anchorDate: isoDateLike,
});

/** POST = apply the template at an anchor date (creates tasks). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  const { id: projectId, templateId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "task.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ApplyInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  try {
    const result = await applyTemplate({
      projectId,
      templateId,
      actorId: user.id,
      anchorDate: new Date(parsed.data.anchorDate),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  const { id: projectId, templateId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "task.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteTemplate({ projectId, templateId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
