import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "./client";
import { BUILTIN_ROLES } from "./schema";

/**
 * Seeds the built-in role templates (project_id = NULL).
 * These are *templates* — when a project is created we clone them into
 * project-scoped rows. Editing/deleting a template doesn't affect existing
 * projects' roles.
 *
 * Idempotent: re-running won't create duplicates.
 */
async function main() {
  console.log("Seeding built-in role templates…");
  for (const r of BUILTIN_ROLES) {
    const [existing] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(and(isNull(schema.roles.projectId), eq(schema.roles.name, r.name)))
      .limit(1);

    let roleId: string;
    if (existing) {
      roleId = existing.id;
      // Refresh capabilities to match code; safer for dev iteration.
      await db.delete(schema.permissions).where(eq(schema.permissions.roleId, roleId));
    } else {
      const [inserted] = await db
        .insert(schema.roles)
        .values({
          projectId: null,
          name: r.name,
          description: r.description,
          isBuiltin: true,
          position: r.position,
        })
        .returning({ id: schema.roles.id });
      roleId = inserted.id;
    }

    await db.insert(schema.permissions).values(
      r.capabilities.map((c) => ({
        roleId,
        capability: c.endsWith(".own") ? c.slice(0, -4) : c,
        scope: c.endsWith(".own") ? ("own" as const) : ("all" as const),
      }))
    );
    console.log(`  ✓ ${r.name} (${r.capabilities.length} capabilities)`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
