import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { hasCapability } from "@/lib/auth/permission";
import {
  createMilestone,
  listProjectMilestones,
} from "@/lib/projects/milestones";

export const runtime = "nodejs";

const isoDateLike = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

const CreateInput = z.object({
  title: z.string().min(1).max(200),
  date: isoDateLike,
  color: z.string().max(20).optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const milestones = await listProjectMilestones(projectId);
  return NextResponse.json({ milestones });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  // Managing planning artifacts (milestones) requires task.create — the same
  // bar as adding tasks to the plan.
  if (!(await hasCapability(user.id, projectId, "task.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const result = await createMilestone({
    projectId,
    actorId: user.id,
    title: parsed.data.title,
    date: new Date(parsed.data.date),
    color: parsed.data.color ?? null,
  });
  return NextResponse.json(result, { status: 201 });
}
