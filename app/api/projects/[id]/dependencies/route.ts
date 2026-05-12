import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { getMembership } from "@/lib/projects/members";
import {
  addDependency,
  listProjectDependencies,
  removeDependency,
} from "@/lib/projects/dependencies";

export const runtime = "nodejs";

const Input = z.object({
  fromTaskId: z.string().uuid(),
  toTaskId: z.string().uuid(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await getMembership(user.id, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dependencies = await listProjectDependencies(projectId);
  return NextResponse.json({ dependencies });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
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
  const result = await addDependency({
    projectId,
    fromTaskId: parsed.data.fromTaskId,
    toTaskId: parsed.data.toTaskId,
    actorId: user.id,
  });
  if (!result.added) {
    return NextResponse.json({ error: result.reason ?? "Failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
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
  await removeDependency({
    projectId,
    fromTaskId: parsed.data.fromTaskId,
    toTaskId: parsed.data.toTaskId,
    actorId: user.id,
  });
  return NextResponse.json({ ok: true });
}
