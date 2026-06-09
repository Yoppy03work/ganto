import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/server";
import {
  listProjectMembers,
  listProjectRoles,
} from "@/lib/projects/members";
import { listPendingInvitations } from "@/lib/projects/invitations";
import { Button } from "@/components/ui/button";
import { InvitePanel } from "./invite-panel";
import { MembersTable } from "./members-table";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      project: schema.projects,
      role: schema.roles,
    })
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
  const { project, role } = rows[0];

  const [members, roles, invitations] = await Promise.all([
    listProjectMembers(projectId),
    listProjectRoles(projectId),
    listPendingInvitations(projectId),
  ]);

  const canManage = role.name === "Owner" || role.name === "Admin";

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
          <Link
            href={`/p/${project.id}`}
            className="text-sm font-medium truncate hover:underline"
          >
            {project.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Members</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/p/${project.id}/roles`}>
            <Button variant="ghost" size="sm">Manage roles</Button>
          </Link>
          <Link href={`/p/${project.id}`}>
            <Button variant="ghost" size="sm">Back to Gantt</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {members.length} member{members.length === 1 ? "" : "s"} ·{" "}
              {invitations.length} pending invite{invitations.length === 1 ? "" : "s"}
            </p>
          </div>
          {canManage && <InvitePanel projectId={project.id} roles={roles} />}
        </div>

        <MembersTable
          projectId={project.id}
          initialMembers={members.map((m) => ({
            ...m,
            joinedAt: m.joinedAt.toISOString(),
          }))}
          roles={roles}
          currentUserId={user.id}
          canManage={canManage}
        />

        {invitations.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Pending invites
            </h2>
            <div className="rounded-md border border-border bg-muted/30 divide-y divide-border">
              {invitations.map((inv) => (
                <div key={inv.id} className="px-3 py-2.5 flex items-center gap-3 text-[12px]">
                  <span className="font-mono text-foreground flex-1 min-w-0 truncate">
                    {inv.email ?? "(any-recipient link)"}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
                    {inv.roleName}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground font-mono">
                    expires {inv.expiresAt?.toISOString().slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
