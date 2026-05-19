import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { listProjectTasks } from "@/lib/projects/tasks";
import { tasksToCsv } from "@/lib/projects/csv";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await getMembership(user.id, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tasks = await listProjectTasks(projectId);
  const csv = tasksToCsv(tasks);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ganto-tasks-${today}.csv"`,
    },
  });
}
