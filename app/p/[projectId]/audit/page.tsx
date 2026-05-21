import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/server";
import { listProjectAudit } from "@/lib/projects/audit";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "project.create": "created the project",
  "project.update": "updated project settings",
  "project.delete": "deleted the project",
  "task.create": "created a task",
  "task.update": "updated a task",
  "task.delete": "deleted a task",
  "task.reorder": "reordered tasks",
  "task.assignee.add": "added an assignee",
  "task.assignee.remove": "removed an assignee",
  "comment.create": "posted a comment",
  "comment.delete": "deleted a comment",
  "membership.create": "joined the project",
  "membership.role": "changed a member's role",
  "membership.status": "changed a member's status",
  "membership.delete": "removed a member",
  "invitation.create": "sent an invitation",
  "role.create": "created a role",
  "role.update": "updated a role",
  "role.delete": "deleted a role",
};

export default async function AuditPage({
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
        eq(schema.memberships.projectId, projectId),
        isNull(schema.projects.deletedAt)
      )
    )
    .limit(1);
  if (rows.length === 0) notFound();
  const { project } = rows[0];

  const entries = await listProjectAudit(projectId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="font-mono text-base font-semibold tracking-tight hover:underline"
          >
            ganto
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/p/${project.id}`} className="text-sm font-medium hover:underline">
            {project.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Audit</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/p/${project.id}`}>
            <Button variant="ghost" size="sm">Back to Gantt</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Last {entries.length} event{entries.length === 1 ? "" : "s"}.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-16 px-6 text-center text-sm text-muted-foreground">
            No events yet.
          </div>
        ) : (
          <ol className="rounded-md border border-border overflow-hidden">
            {entries.map((e, i) => (
              <li
                key={e.id}
                className={
                  "flex items-start gap-3 px-4 py-3 text-[13px] " +
                  (i === entries.length - 1 ? "" : "border-b border-border")
                }
              >
                <Avatar name={e.actorName ?? "?"} image={e.actorImage} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div>
                    <span className="font-medium">{e.actorName ?? "(unknown)"}</span>{" "}
                    <span className="text-muted-foreground">
                      {ACTION_LABEL[e.action] ?? e.action}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-mono text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()} · {e.action}
                    {e.targetType ? ` · ${e.targetType}` : ""}
                  </div>
                  {(e.before != null || e.after != null) ? (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Detail
                      </summary>
                      <pre className="mt-1 p-2 rounded-sm bg-muted text-[10.5px] font-mono overflow-x-auto">
{JSON.stringify({ before: e.before, after: e.after }, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        width={26}
        height={26}
        className="rounded-full bg-muted flex-shrink-0"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-mono w-[26px] h-[26px] text-[11px] flex-shrink-0">
      {initials}
    </div>
  );
}
