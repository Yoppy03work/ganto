import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { createProject, listProjectsForUser } from "@/lib/projects/create";

export const runtime = "nodejs";

const CreateProjectInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  storageMode: z.enum(["local", "github"]).optional(),
});

export async function GET() {
  const user = await requireCurrentUser();
  const projects = await listProjectsForUser(user.id);
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateProjectInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { projectId } = await createProject({
    userId: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    storageMode: parsed.data.storageMode,
  });
  return NextResponse.json({ projectId }, { status: 201 });
}
