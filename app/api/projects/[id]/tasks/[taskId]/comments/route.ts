import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import {
  createComment,
  listTaskComments,
  taskBelongsToProject,
} from "@/lib/projects/comments";

export const runtime = "nodejs";

const Input = z.object({
  body: z.string().min(1).max(10_000),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await taskBelongsToProject(taskId, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const comments = await listTaskComments(taskId);
  return NextResponse.json({ comments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await taskBelongsToProject(taskId, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const result = await createComment({
    projectId,
    taskId,
    authorId: user.id,
    body: parsed.data.body.trim(),
  });
  return NextResponse.json(result, { status: 201 });
}
