import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { fetchProjectV2 } from "@/lib/github/projects";
import { addDraftIssue, updateItemField } from "@/lib/github/mutations";
import { recordAudit } from "@/lib/audit/log";

/**
 * Pull tasks from a connected GitHub Projects v2 into the local DB.
 *
 * Mapping rules:
 * - Item ID (`PVTI_...`) becomes `tasks.external_id` (with the project_id +
 *   external_id unique constraint making the upsert deterministic).
 * - Title from DraftIssue / Issue / PullRequest content.
 * - "Status" single-select field → tasks.status (default "Todo" if absent).
 * - Configurable Date fields (env GANTT_START_FIELD / GANTT_END_FIELD) →
 *   start_at / end_at.
 * - Other fields are ignored for now.
 *
 * Returns counts. Does NOT delete locally-created (non-github) tasks.
 */
export type GitHubSyncResult = {
  fetched: number;
  upserted: number;
  warnings: string[];
};

export async function pullFromGitHub(opts: {
  projectId: string;
  actorId: string;
}): Promise<GitHubSyncResult> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, opts.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");
  if (project.storageMode !== "github") {
    throw new Error("Project is not in github storage mode");
  }
  if (!project.githubOwner || !project.githubProjectNumber) {
    throw new Error("GitHub owner and project number must be set in Settings");
  }

  const startFieldName = process.env.GANTT_START_FIELD ?? "Start";
  const endFieldName = process.env.GANTT_END_FIELD ?? "End";

  const result = await fetchProjectV2({
    owner: project.githubOwner,
    number: project.githubProjectNumber,
    actorId: opts.actorId,
  });
  if (!result) {
    throw new Error(
      `Could not load GitHub project ${project.githubOwner}/${project.githubProjectNumber}. Check that your linked GitHub account has access (needs 'project' read scope).`
    );
  }

  const startField = result.fields.find((f) => f.name === startFieldName);
  const endField = result.fields.find((f) => f.name === endFieldName);
  const statusField = result.fields.find((f) => f.name === "Status");

  const out: GitHubSyncResult = { fetched: 0, upserted: 0, warnings: [] };

  if (!startField) out.warnings.push(`No "${startFieldName}" field on the project`);
  if (!endField) out.warnings.push(`No "${endFieldName}" field on the project`);

  let pos = 0;
  for (const item of result.items) {
    if (item.isArchived) continue;
    out.fetched++;

    const title =
      (item.content?.title ?? "").trim() || `(untitled ${item.id.slice(-6)})`;

    let status = "Todo";
    let startAt: Date | null = null;
    let endAt: Date | null = null;

    for (const fv of item.fieldValues.nodes) {
      const fid = fv.field?.id;
      if (!fid) continue;
      if (statusField && fid === statusField.id && fv.name) {
        status = fv.name;
      }
      if (startField && fid === startField.id && fv.date) {
        startAt = new Date(fv.date);
      }
      if (endField && fid === endField.id && fv.date) {
        endAt = new Date(fv.date);
      }
    }

    pos += 10;

    // Upsert by (projectId, externalId). We have to consider three cases:
    //
    //   1. Active row exists → UPDATE in place.
    //   2. Soft-deleted row exists with this externalId → SKIP with warning.
    //      Inserting would violate the `tasks_project_external_unique`
    //      composite uniqueness constraint (which we deliberately keep
    //      including deleted rows so externalId references stay traceable).
    //      The operator must restore from Trash before re-pulling.
    //   3. No row at all → INSERT.
    const [existing] = await db
      .select({
        id: schema.tasks.id,
        deletedAt: schema.tasks.deletedAt,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, opts.projectId),
          eq(schema.tasks.externalId, item.id)
        )
      )
      .limit(1);

    if (existing && existing.deletedAt) {
      // Case 2: soft-deleted, refuse to silently resurrect.
      out.warnings.push(
        `Skipped "${title}" (${item.id}): a soft-deleted task with this GitHub item already exists in Trash. Restore it before re-pulling, or hard-delete to discard.`
      );
      continue;
    }

    if (existing) {
      // Case 1.
      await db
        .update(schema.tasks)
        .set({
          title,
          status,
          startAt,
          endAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, existing.id));
    } else {
      // Case 3.
      await db.insert(schema.tasks).values({
        projectId: opts.projectId,
        externalId: item.id,
        title,
        status,
        startAt,
        endAt,
        visibility: "all",
        position: pos,
        createdBy: opts.actorId,
      });
    }
    out.upserted++;
  }

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "github.sync.pull",
    targetType: "project",
    targetId: opts.projectId,
    after: { fetched: out.fetched, upserted: out.upserted, warnings: out.warnings },
  });

  return out;
}

export type GitHubPushResult = {
  pushed: number;
  created: number;
  warnings: string[];
};

/**
 * Push local tasks back to a connected GitHub Projects v2.
 *
 * - Tasks with `external_id` set: update their Status / Start / End on GitHub.
 * - Tasks without `external_id`: create a Draft Issue on GitHub with the same
 *   title, then update the same fields and store the new external_id locally.
 *
 * Status writes only succeed if the task's status string matches an existing
 * single-select option name; unknown statuses become a warning entry.
 */
export async function pushToGitHub(opts: {
  projectId: string;
  actorId: string;
}): Promise<GitHubPushResult> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, opts.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");
  if (project.storageMode !== "github") {
    throw new Error("Project is not in github storage mode");
  }
  if (!project.githubOwner || !project.githubProjectNumber) {
    throw new Error("GitHub owner and project number must be set in Settings");
  }

  const startFieldName = process.env.GANTT_START_FIELD ?? "Start";
  const endFieldName = process.env.GANTT_END_FIELD ?? "End";

  const remote = await fetchProjectV2({
    owner: project.githubOwner,
    number: project.githubProjectNumber,
    actorId: opts.actorId,
  });
  if (!remote) {
    throw new Error(
      `Could not load GitHub project ${project.githubOwner}/${project.githubProjectNumber}.`
    );
  }
  const startField = remote.fields.find((f) => f.name === startFieldName);
  const endField = remote.fields.find((f) => f.name === endFieldName);
  const statusField = remote.fields.find((f) => f.name === "Status");

  const out: GitHubPushResult = { pushed: 0, created: 0, warnings: [] };
  if (!startField) out.warnings.push(`No "${startFieldName}" field on the project`);
  if (!endField) out.warnings.push(`No "${endFieldName}" field on the project`);

  // Push only active tasks. Soft-deleted ones should NOT continue to push
  // their state to GitHub — that would defeat the purpose of moving them
  // to Trash.
  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    )
    .orderBy(schema.tasks.position);

  for (const t of tasks) {
    let externalId = t.externalId;

    // Create on GitHub if local-only.
    if (!externalId) {
      try {
        externalId = await addDraftIssue({
          projectId: remote.projectId,
          title: t.title,
          actorId: opts.actorId,
        });
        await db
          .update(schema.tasks)
          .set({ externalId, updatedAt: new Date() })
          .where(eq(schema.tasks.id, t.id));
        out.created++;
      } catch (e) {
        out.warnings.push(
          `Failed to create draft for "${t.title}": ${e instanceof Error ? e.message : "unknown"}`
        );
        continue;
      }
    }

    // Status (single-select).
    if (statusField && t.status) {
      const opt = statusField.options?.find((o) => o.name === t.status);
      if (!opt) {
        out.warnings.push(
          `Status "${t.status}" not found on GitHub project (task: ${t.title})`
        );
      } else {
        try {
          await updateItemField({
            projectId: remote.projectId,
            itemId: externalId,
            fieldId: statusField.id,
            value: { singleSelectOptionId: opt.id },
            actorId: opts.actorId,
          });
        } catch (e) {
          out.warnings.push(
            `Status update failed for ${t.title}: ${e instanceof Error ? e.message : "?"}`
          );
        }
      }
    }

    // Start / End (date).
    if (startField && t.startAt) {
      try {
        await updateItemField({
          projectId: remote.projectId,
          itemId: externalId,
          fieldId: startField.id,
          value: { date: t.startAt.toISOString().slice(0, 10) },
          actorId: opts.actorId,
        });
      } catch (e) {
        out.warnings.push(
          `Start date push failed for ${t.title}: ${e instanceof Error ? e.message : "?"}`
        );
      }
    }
    if (endField && t.endAt) {
      try {
        await updateItemField({
          projectId: remote.projectId,
          itemId: externalId,
          fieldId: endField.id,
          value: { date: t.endAt.toISOString().slice(0, 10) },
          actorId: opts.actorId,
        });
      } catch (e) {
        out.warnings.push(
          `End date push failed for ${t.title}: ${e instanceof Error ? e.message : "?"}`
        );
      }
    }

    out.pushed++;
  }

  // Reference isNull so its import isn't flagged unused; reserved for future
  // "push only never-synced rows" mode.
  void isNull;

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "github.sync.push",
    targetType: "project",
    targetId: opts.projectId,
    after: { pushed: out.pushed, created: out.created, warnings: out.warnings },
  });

  return out;
}
