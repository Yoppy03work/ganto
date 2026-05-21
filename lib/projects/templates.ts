import "server-only";
import { and, eq, isNull, sql, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { addDays, startOfDay } from "@/lib/gantt/date";
import type { TemplateItem } from "@/db/schema";

export type TemplateRow = {
  id: string;
  name: string;
  items: TemplateItem[];
  createdAt: Date;
};

export async function listProjectTemplates(
  projectId: string
): Promise<TemplateRow[]> {
  return db
    .select({
      id: schema.taskTemplates.id,
      name: schema.taskTemplates.name,
      items: schema.taskTemplates.items,
      createdAt: schema.taskTemplates.createdAt,
    })
    .from(schema.taskTemplates)
    .where(eq(schema.taskTemplates.projectId, projectId))
    .orderBy(desc(schema.taskTemplates.createdAt));
}

/**
 * Snapshot the project's current active tasks into a template. Day offsets are
 * relative to the earliest task start (so the template is anchor-agnostic).
 */
export async function createTemplateFromTasks(opts: {
  projectId: string;
  actorId: string;
  name: string;
}): Promise<{ id: string; itemCount: number }> {
  const tasks = await db
    .select({
      title: schema.tasks.title,
      type: schema.tasks.type,
      status: schema.tasks.status,
      startAt: schema.tasks.startAt,
      endAt: schema.tasks.endAt,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    )
    .orderBy(schema.tasks.position);

  // Anchor = earliest start among tasks (fallback today).
  let anchor: Date | null = null;
  for (const t of tasks) {
    if (t.startAt && (!anchor || t.startAt < anchor)) anchor = t.startAt;
  }
  const base = startOfDay(anchor ?? new Date());

  const items: TemplateItem[] = tasks.map((t) => {
    const s = t.startAt ? startOfDay(t.startAt) : base;
    const e = t.endAt ? startOfDay(t.endAt) : s;
    return {
      title: t.title,
      type: t.type,
      status: t.status,
      startOffsetDays: Math.round((s.getTime() - base.getTime()) / 86_400_000),
      endOffsetDays: Math.round((e.getTime() - base.getTime()) / 86_400_000),
    };
  });

  const [row] = await db
    .insert(schema.taskTemplates)
    .values({
      projectId: opts.projectId,
      name: opts.name,
      items,
      createdBy: opts.actorId,
    })
    .returning({ id: schema.taskTemplates.id });

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "template.create",
    targetType: "project",
    targetId: opts.projectId,
    after: { name: opts.name, itemCount: items.length },
  });

  return { id: row.id, itemCount: items.length };
}

/**
 * Apply a template at an anchor date — creates one task per item at
 * anchor + offset. Returns the number of tasks created.
 */
export async function applyTemplate(opts: {
  projectId: string;
  templateId: string;
  actorId: string;
  anchorDate: Date;
}): Promise<{ created: number }> {
  const [tpl] = await db
    .select({ items: schema.taskTemplates.items, name: schema.taskTemplates.name })
    .from(schema.taskTemplates)
    .where(
      and(
        eq(schema.taskTemplates.id, opts.templateId),
        eq(schema.taskTemplates.projectId, opts.projectId)
      )
    )
    .limit(1);
  if (!tpl) throw new Error("Template not found");

  // Place new tasks at the bottom.
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${schema.tasks.position}), 0)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    );

  const base = startOfDay(opts.anchorDate);
  const rows = tpl.items.map((it, i) => ({
    projectId: opts.projectId,
    title: it.title,
    status: it.status,
    type: it.type,
    startAt: addDays(base, it.startOffsetDays),
    endAt: addDays(base, it.endOffsetDays),
    visibility: "all" as const,
    position: Number(maxPos) + i + 1,
    createdBy: opts.actorId,
  }));
  if (rows.length > 0) {
    await db.insert(schema.tasks).values(rows);
  }

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "template.apply",
    targetType: "project",
    targetId: opts.projectId,
    after: { name: tpl.name, created: rows.length },
  });

  return { created: rows.length };
}

export async function deleteTemplate(opts: {
  projectId: string;
  templateId: string;
  actorId: string;
}): Promise<void> {
  await db
    .delete(schema.taskTemplates)
    .where(
      and(
        eq(schema.taskTemplates.id, opts.templateId),
        eq(schema.taskTemplates.projectId, opts.projectId)
      )
    );
  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "template.delete",
    targetType: "project",
    targetId: opts.projectId,
  });
}
