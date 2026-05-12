import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { getMembership } from "@/lib/projects/members";
import { createTask, listProjectTasks } from "@/lib/projects/tasks";

export const runtime = "nodejs";

const isoDateLike = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

const CreateInput = z.object({
  title: z.string().min(1).max(500),
  status: z.string().min(1).max(50).optional(),
  type: z.string().max(50).optional().nullable(),
  startAt: isoDateLike.optional().nullable(),
  endAt: isoDateLike.optional().nullable(),
  progress: z.number().min(0).max(1).optional().nullable(),
  visibility: z.enum(["all", "members", "private"]).optional(),
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
  const tasks = await listProjectTasks(projectId);
  // Visibility filter (rough): apply at the lib level later for performance.
  // Member can see all + member; Viewer only all; Admin/Owner everything.
  const role = membership.roleName;
  const filtered = tasks.filter((t) => {
    if (role === "Owner" || role === "Admin") return true;
    if (t.visibility === "all") return true;
    if (t.visibility === "members" && role !== "Viewer") return true;
    if (t.visibility === "private") {
      return t.createdBy === user.id || t.assignees.some((a) => a.userId === user.id);
    }
    return false;
  });
  return NextResponse.json({ tasks: filtered });
}

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
  const { startAt, endAt, ...rest } = parsed.data;
  const result = await createTask({
    projectId,
    actorId: user.id,
    ...rest,
    startAt: startAt ? new Date(startAt) : null,
    endAt: endAt ? new Date(endAt) : null,
  });
  return NextResponse.json(result, { status: 201 });
}
