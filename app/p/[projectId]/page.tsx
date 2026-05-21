import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/server";
import { listProjectTasks } from "@/lib/projects/tasks";
import { listProjectMembers } from "@/lib/projects/members";
import { listProjectDependencies } from "@/lib/projects/dependencies";
import { listProjectMilestones } from "@/lib/projects/milestones";
import { listProjectBaselines } from "@/lib/projects/baselines";
import { hasCapability } from "@/lib/auth/permission";
import { Button } from "@/components/ui/button";
import { GanttScreen } from "@/components/gantt/gantt-screen";
import { NotificationBell } from "@/components/notification-bell";
import type { GanttTaskDTO } from "@/lib/gantt/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({ project: schema.projects, role: schema.roles })
    .from(schema.memberships)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.memberships.projectId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(
      and(
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.projectId, projectId)
      )
    )
    .limit(1);
  if (rows.length === 0) notFound();
  const { project, role } = rows[0];

  const [tasksRaw, canCreate, membersRaw, deps, milestonesRaw, baselines] =
    await Promise.all([
      listProjectTasks(projectId),
      hasCapability(user.id, projectId, "task.create"),
      listProjectMembers(projectId),
      listProjectDependencies(projectId),
      listProjectMilestones(projectId),
      listProjectBaselines(projectId),
    ]);

  const milestones = milestonesRaw.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.date.toISOString(),
    color: m.color,
    lockVersion: m.lockVersion,
  }));
  const baselineList = baselines.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt.toISOString(),
  }));

  const members = membersRaw.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    image: m.image,
  }));

  // Apply visibility filter (mirrors API logic for the initial server render).
  const filtered = tasksRaw.filter((t) => {
    if (role.name === "Owner" || role.name === "Admin") return true;
    if (t.visibility === "all") return true;
    if (t.visibility === "members" && role.name !== "Viewer") return true;
    if (t.visibility === "private") {
      return t.createdBy === user.id || t.assignees.some((a) => a.userId === user.id);
    }
    return false;
  });

  const tasks: GanttTaskDTO[] = filtered.map((t) => ({
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
          <Link
            href="/"
            className="font-mono text-base font-semibold tracking-tight hover:underline"
          >
            ganto
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium truncate">{project.name}</span>
          <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
            {role.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/p/${project.id}/members`}>
            <Button variant="ghost" size="sm">Members</Button>
          </Link>
          <Link href={`/p/${project.id}/roles`}>
            <Button variant="ghost" size="sm">Roles</Button>
          </Link>
          <Link href={`/p/${project.id}/resources`}>
            <Button variant="ghost" size="sm">Resources</Button>
          </Link>
          <Link href={`/p/${project.id}/audit`}>
            <Button variant="ghost" size="sm">Audit</Button>
          </Link>
          <Link href={`/p/${project.id}/trash`}>
            <Button variant="ghost" size="sm">Trash</Button>
          </Link>
          <Link href={`/p/${project.id}/settings`}>
            <Button variant="ghost" size="sm">Settings</Button>
          </Link>
          <NotificationBell />
        </div>
      </header>

      <GanttScreen
        projectId={project.id}
        initialTasks={tasks}
        initialDeps={deps}
        canCreate={canCreate}
        members={members}
        currentUserId={user.id}
        initialMilestones={milestones}
        baselines={baselineList}
      />
    </div>
  );
}
