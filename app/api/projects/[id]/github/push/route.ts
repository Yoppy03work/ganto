import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { pushToGitHub } from "@/lib/projects/github-sync";
import { GitHubNotConnectedError } from "@/lib/github/get-user-token";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "project.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await pushToGitHub({
      projectId,
      actorId: user.id,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof GitHubNotConnectedError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 412 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}
