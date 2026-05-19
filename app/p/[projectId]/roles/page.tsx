import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/server";
import { ALL_CAPABILITIES, listRolesWithCapabilities } from "@/lib/projects/roles";
import { Button } from "@/components/ui/button";
import { RoleEditor } from "./role-editor";

export const dynamic = "force-dynamic";

export default async function RolesPage({
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
        eq(schema.memberships.projectId, projectId)
      )
    )
    .limit(1);
  if (rows.length === 0) notFound();
  const { project, role } = rows[0];

  const roles = await listRolesWithCapabilities(projectId);
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
          <Link href={`/p/${project.id}`} className="text-sm font-medium hover:underline">
            {project.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Roles</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/p/${project.id}/members`}>
            <Button variant="ghost" size="sm">Members</Button>
          </Link>
          <Link href={`/p/${project.id}`}>
            <Button variant="ghost" size="sm">Back to Gantt</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles & permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Built-in roles can&apos;t be deleted, but their permissions can be tuned.
            Create custom roles for finer-grained access.
          </p>
        </div>

        <RoleEditor
          projectId={project.id}
          initialRoles={roles}
          catalog={ALL_CAPABILITIES}
          canManage={canManage}
        />
      </main>
    </div>
  );
}
