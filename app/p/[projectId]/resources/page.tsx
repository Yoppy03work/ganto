import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { listProjectTasks } from "@/lib/projects/tasks";
import { listProjectMembers } from "@/lib/projects/members";
import { computeResourceLoad } from "@/lib/gantt/resource-load";
import { ResourceGridView } from "./resource-grid";

export const dynamic = "force-dynamic";

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) redirect("/");

  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) redirect("/");

  const [tasks, members] = await Promise.all([
    listProjectTasks(projectId),
    listProjectMembers(projectId),
  ]);

  const grid = computeResourceLoad(
    tasks.map((t) => ({
      startAt: t.startAt ? t.startAt.toISOString() : null,
      endAt: t.endAt ? t.endAt.toISOString() : null,
      assignees: t.assignees.map((a) => ({ userId: a.userId })),
    })),
    members.map((m) => ({ userId: m.userId, name: m.name }))
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="font-mono text-base font-semibold tracking-tight hover:underline">
            ganto
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/p/${project.id}`} className="text-sm font-medium hover:underline">
            {project.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm">Resources</span>
        </div>
        <Link href={`/p/${project.id}`} className="text-xs text-muted-foreground hover:text-foreground">
          ← Back to Gantt
        </Link>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">リソースビュー</h1>
          <p className="text-sm text-muted-foreground mt-1">
            担当者ごとの週次の稼働（アクティブなタスク数）。色が濃いほど忙しい週です。
          </p>
        </div>
        <ResourceGridView
          grid={{
            weeks: grid.weeks.map((w) => ({
              start: w.start.toISOString(),
              label: w.label,
            })),
            rows: grid.rows,
            peak: grid.peak,
          }}
          members={members.map((m) => ({ userId: m.userId, name: m.name }))}
        />
      </main>
    </div>
  );
}
