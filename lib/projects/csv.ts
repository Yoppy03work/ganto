import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import type { GanttTaskRow } from "./tasks";

const CSV_COLS = [
  "id",
  "title",
  "status",
  "type",
  "start_at",
  "end_at",
  "progress",
  "visibility",
  "assignees",
] as const;

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tasksToCsv(tasks: GanttTaskRow[]): string {
  const lines = [CSV_COLS.join(",")];
  for (const t of tasks) {
    lines.push(
      [
        t.id,
        t.title,
        t.status,
        t.type ?? "",
        t.startAt ? t.startAt.toISOString() : "",
        t.endAt ? t.endAt.toISOString() : "",
        t.progress != null ? String(t.progress) : "",
        t.visibility,
        t.assignees.map((a) => a.userId).join(";"),
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

/** Tiny CSV parser handling quoted fields with embedded commas/quotes/newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ",") { row.push(cur); cur = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

/**
 * Import CSV. Mode "merge" (default): rows with matching id update; rows
 * without id (or unknown id) create. Mode "replace": all existing tasks
 * deleted first.
 */
export async function importTasksCsv(opts: {
  projectId: string;
  actorId: string;
  csv: string;
  mode: "merge" | "replace";
}): Promise<ImportResult> {
  const rows = parseCsv(opts.csv).filter((r) => r.length > 1);
  if (rows.length === 0) {
    return { created: 0, updated: 0, skipped: 0, errors: ["Empty CSV"] };
  }
  const header = rows[0].map((s) => s.trim().toLowerCase());
  const colIdx = (name: string) => header.indexOf(name);
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (opts.mode === "replace") {
    // Soft-delete every active task in the project. Recoverable from Trash.
    // We deliberately don't pass `expectedLockVersion` here — bulk CSV import
    // is an explicit operator action and runs against whatever's there.
    await db
      .update(schema.tasks)
      .set({
        deletedAt: new Date(),
        deletedByUserId: opts.actorId,
        lockVersion: sql`${schema.tasks.lockVersion} + 1`,
      })
      .where(
        and(
          eq(schema.tasks.projectId, opts.projectId),
          isNull(schema.tasks.deletedAt)
        )
      );
  }

  // Position counter for newly created rows. Skip soft-deleted rows when
  // computing max position so a fresh CSV replace doesn't leave a gap.
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${schema.tasks.position}), 0)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    );
  let nextPos = Number(maxPos);

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const get = (name: string): string => {
      const i = colIdx(name);
      return i >= 0 ? cols[i] ?? "" : "";
    };
    const title = get("title").trim();
    if (!title) {
      result.skipped++;
      continue;
    }
    const id = get("id").trim();
    const status = get("status").trim() || "Todo";
    const type = get("type").trim() || null;
    const startStr = get("start_at").trim();
    const endStr = get("end_at").trim();
    const progStr = get("progress").trim();
    const visibility = (get("visibility").trim() || "all") as "all" | "members" | "private";
    const startAt = startStr && !Number.isNaN(Date.parse(startStr)) ? new Date(startStr) : null;
    const endAt = endStr && !Number.isNaN(Date.parse(endStr)) ? new Date(endStr) : null;
    const progress = progStr === "" ? null : Number(progStr);

    if (id) {
      // Scope the lookup to this project to prevent a malicious CSV from
      // overwriting tasks in another project (the importer only holds
      // `task.create` for THIS project, so cross-project writes via id would
      // be a privilege bypass). We include soft-deleted rows here so that a
      // CSV exported BEFORE a replace-import can "round-trip" — i.e. the
      // post-replace soft-deleted rows get matched by id and restored.
      const [existing] = await db
        .select({
          id: schema.tasks.id,
          deletedAt: schema.tasks.deletedAt,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.id, id),
            eq(schema.tasks.projectId, opts.projectId)
          )
        )
        .limit(1);
      if (existing) {
        await db
          .update(schema.tasks)
          .set({
            title,
            status,
            type,
            startAt,
            endAt,
            progress: progress != null && Number.isFinite(progress) ? progress : null,
            visibility,
            updatedAt: new Date(),
            // If the row had been soft-deleted (either by CSV-replace earlier
            // in this same import, or by a prior delete), clear those fields
            // so the row reappears as active. Otherwise an "updated" row
            // would still be invisible from the Gantt and the importer
            // wouldn't understand why their CSV "didn't take effect".
            deletedAt: null,
            deletedByUserId: null,
            lockVersion: sql`${schema.tasks.lockVersion} + 1`,
          })
          .where(
            and(
              eq(schema.tasks.id, id),
              eq(schema.tasks.projectId, opts.projectId)
            )
          );
        result.updated++;
        continue;
      }
      // id was supplied but row doesn't exist in this project (perhaps
      // belongs to another project or never existed). Record but don't
      // silently insert a new row with a foreign id.
      result.errors.push(`Row ${r}: unknown task id ${id}, skipped`);
      result.skipped++;
      continue;
    }

    nextPos += 1;
    await db.insert(schema.tasks).values({
      projectId: opts.projectId,
      title,
      status,
      type,
      startAt,
      endAt,
      progress: progress != null && Number.isFinite(progress) ? progress : null,
      visibility,
      position: nextPos,
      createdBy: opts.actorId,
    });
    result.created++;
  }

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.import",
    targetType: "project",
    targetId: opts.projectId,
    after: { mode: opts.mode, ...result },
  });

  return result;
}
