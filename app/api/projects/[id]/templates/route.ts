import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { hasCapability } from "@/lib/auth/permission";
import {
  createTemplateFromTasks,
  listProjectTemplates,
} from "@/lib/projects/templates";

export const runtime = "nodejs";

const CreateInput = z.object({
  name: z.string().min(1).max(120),
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
  const templates = await listProjectTemplates(projectId);
  return NextResponse.json({ templates });
}

/** Create a template by snapshotting the project's current active tasks. */
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
  const parsed = CreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const result = await createTemplateFromTasks({
    projectId,
    actorId: user.id,
    name: parsed.data.name,
  });
  return NextResponse.json(result, { status: 201 });
}
