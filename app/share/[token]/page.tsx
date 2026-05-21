import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { resolveShareToken } from "@/lib/projects/share";
import { listProjectTasks } from "@/lib/projects/tasks";
import { ShareGantt } from "./share-gantt";
import type { GanttTaskDTO } from "@/lib/gantt/types";

export const dynamic = "force-dynamic";

/**
 * Public read-only Gantt. NO AUTH — access is granted purely by holding the
 * unguessable token. Only "all"-visibility tasks are shown so member-only /
 * private tasks never leak through a share link.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const projectId = await resolveShareToken(token);
  if (!projectId) notFound();

  // A soft-deleted project must stop resolving through existing share tokens —
  // "moved to Trash" should also revoke public visibility.
  const [project] = await db
    .select({ name: schema.projects.name })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt))
    )
    .limit(1);
  if (!project) notFound();

  const tasksRaw = await listProjectTasks(projectId);
  // Only public tasks — never leak member-only / private through a share link.
  const tasks: GanttTaskDTO[] = tasksRaw
    .filter((t) => t.visibility === "all")
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      type: t.type,
      startAt: t.startAt ? t.startAt.toISOString() : null,
      endAt: t.endAt ? t.endAt.toISOString() : null,
      progress: t.progress,
      visibility: t.visibility,
      position: t.position,
      lockVersion: t.lockVersion,
      assignees: t.assignees,
      createdBy: t.createdBy,
    }));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-base font-semibold tracking-tight">ganto</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium truncate">{project.name}</span>
          <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
            Read-only
          </span>
        </div>
      </header>
      <div className="flex flex-col h-[calc(100vh-3rem)]">
        <ShareGantt tasks={tasks} />
      </div>
    </div>
  );
}
