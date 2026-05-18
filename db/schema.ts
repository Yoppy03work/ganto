import {
  pgTable,
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  pgEnum,
  primaryKey,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Users are managed by Neon Auth and stored in `neon_auth.user`. We mirror
 * that table here (read-only from our perspective) so we can join against
 * memberships, comments, etc. without raw SQL. We do NOT add foreign keys
 * to it — Neon Auth owns the table's lifecycle.
 */
export const neonAuthSchema = pgSchema("neon_auth");

export const neonUsers = neonAuthSchema.table("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  role: text("role"),
  banned: boolean("banned"),
});

/**
 * Mirrors `neon_auth.account` (Better Auth's linked-provider table). Read-only
 * from our side — Neon Auth owns the lifecycle (insert/update/delete on
 * sign-in, linkSocial, unlinkAccount). We mirror it so server code can look
 * up a user's OAuth access tokens for downstream API calls (e.g. each user's
 * personal GitHub token for Projects v2 sync).
 *
 * Only the columns we actually read are declared.
 */
export const neonAccounts = neonAuthSchema.table("account", {
  id: uuid("id").primaryKey(),
  // FK target type is text because neon_auth.user.id is uuid but the Better
  // Auth schema stores user IDs as text in `account.userId`. Cross-cast at
  // query time when joining (`::uuid`) — matches the pattern used for
  // memberships → neon_users.
  userId: text("userId").notNull(),
  /** "github" | "google" | "credential" (email/password) | ... */
  providerId: text("providerId").notNull(),
  /** Provider-side stable user id (e.g. GitHub user numeric id as string). */
  accountId: text("accountId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
  scope: text("scope"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

// ---------- Enums ----------

export const storageModeEnum = pgEnum("storage_mode", ["local", "github"]);
export const visibilityEnum = pgEnum("visibility", ["all", "members", "private"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "suspended"]);
export const permissionScopeEnum = pgEnum("permission_scope", ["all", "own"]);

// ---------- Projects ----------

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  storageMode: storageModeEnum("storage_mode").default("local").notNull(),
  // Set when storage_mode = 'github'
  githubOwner: text("github_owner"),
  githubProjectNumber: integer("github_project_number"),
  // Neon Auth user id of the creator
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // Optimistic concurrency control. Every PATCH on this row must match the
  // expected lockVersion or the request is rejected with 409 Conflict.
  lockVersion: integer("lock_version").default(0).notNull(),
});

// ---------- Roles & Permissions ----------

// project_id == NULL means a built-in role template (Owner/Admin/Member/Viewer).
// When a project is created, we copy the templates into project-scoped rows so
// the owner can edit them or add custom roles without affecting other projects.
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isBuiltin: boolean("is_builtin").default(false).notNull(),
    position: integer("position").default(100).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Optimistic concurrency control. Every PATCH on this row must match the
    // expected lockVersion or the request is rejected with 409 Conflict.
    lockVersion: integer("lock_version").default(0).notNull(),
  },
  (t) => [
    index("roles_project_idx").on(t.projectId),
    unique("roles_project_name_unique").on(t.projectId, t.name),
  ]
);

// Capability strings are application-defined. Examples:
//   'task.view.all', 'task.view.member', 'task.view.private'
//   'task.create', 'task.update', 'task.delete'
//   'member.invite', 'member.remove', 'member.role.change'
//   'project.settings', 'project.delete'
//   'role.create', 'role.update', 'role.delete'
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id")
      .references(() => roles.id, { onDelete: "cascade" })
      .notNull(),
    capability: text("capability").notNull(),
    scope: permissionScopeEnum("scope").default("all").notNull(),
  },
  (t) => [
    unique("permissions_role_cap_unique").on(t.roleId, t.capability),
    index("permissions_role_idx").on(t.roleId),
  ]
);

// ---------- Memberships ----------

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    // Neon Auth user id (text, no FK to neon_auth schema)
    userId: text("user_id").notNull(),
    roleId: uuid("role_id")
      .references(() => roles.id, { onDelete: "restrict" })
      .notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    // Optimistic concurrency control. Every PATCH on this row must match the
    // expected lockVersion or the request is rejected with 409 Conflict.
    lockVersion: integer("lock_version").default(0).notNull(),
  },
  (t) => [
    unique("memberships_project_user_unique").on(t.projectId, t.userId),
    index("memberships_project_idx").on(t.projectId),
    index("memberships_user_idx").on(t.userId),
  ]
);

// ---------- Invitations ----------

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    token: text("token").notNull().unique(),
    roleId: uuid("role_id")
      .references(() => roles.id, { onDelete: "restrict" })
      .notNull(),
    // null => public invite link (anyone with the URL)
    email: text("email"),
    invitedBy: text("invited_by"), // Neon Auth user id
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: text("used_by"), // Neon Auth user id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("invitations_token_idx").on(t.token),
    index("invitations_project_idx").on(t.projectId),
  ]
);

// ---------- Tasks ----------

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    // External identifier when synced from GitHub Projects v2
    externalId: text("external_id"),
    title: text("title").notNull(),
    // Free-text status; the project's available statuses are configured separately
    // (default Todo / In Progress / Done / Backlog). Stored as text so custom statuses work.
    status: text("status").default("Todo").notNull(),
    type: text("type"), // Feature/Bug/Chore/Docs/Design/Infra etc.
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    progress: real("progress"), // 0..1
    visibility: visibilityEnum("visibility").default("all").notNull(),
    position: integer("position").default(0).notNull(),
    createdBy: text("created_by"), // Neon Auth user id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    // Optimistic concurrency control. Every PATCH on this row must match the
    // expected lockVersion or the request is rejected with 409 Conflict.
    lockVersion: integer("lock_version").default(0).notNull(),
    // Soft delete fields. NULL when active; non-NULL when the task has been
    // moved to Trash. Filter `isNull(tasks.deletedAt)` in all normal queries.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: text("deleted_by_user_id"), // Neon Auth user id
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    // Composite index for both regular list (deletedAt IS NULL) and Trash
    // (deletedAt IS NOT NULL) lookups.
    index("tasks_project_deleted_idx").on(t.projectId, t.deletedAt),
    index("tasks_status_idx").on(t.status),
    unique("tasks_project_external_unique").on(t.projectId, t.externalId),
  ]
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").notNull(), // Neon Auth user id
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })]
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    fromTaskId: uuid("from_task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    toTaskId: uuid("to_task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.fromTaskId, t.toTaskId] })]
);

// ---------- Audit log ----------

// Records every state-changing operation. before/after store JSON snapshots
// for diff rendering. action is dotted: 'task.update', 'role.create', etc.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id"), // Neon Auth user id
    action: text("action").notNull(),
    targetType: text("target_type").notNull(), // 'task' | 'role' | 'membership' | 'project' | ...
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_project_idx").on(t.projectId),
    index("audit_created_idx").on(t.createdAt),
  ]
);

// ---------- Comments ----------

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    authorId: text("author_id"), // Neon Auth user id
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("comments_task_idx").on(t.taskId)]
);

// ---------- Relations ----------

export const projectsRelations = relations(projects, ({ many }) => ({
  memberships: many(memberships),
  tasks: many(tasks),
  roles: many(roles),
  invitations: many(invitations),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  project: one(projects, { fields: [roles.projectId], references: [projects.id] }),
  permissions: many(permissions),
  memberships: many(memberships),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  role: one(roles, { fields: [permissions.roleId], references: [roles.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  project: one(projects, { fields: [memberships.projectId], references: [projects.id] }),
  role: one(roles, { fields: [memberships.roleId], references: [roles.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignees: many(taskAssignees),
  comments: many(comments),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  project: one(projects, { fields: [invitations.projectId], references: [projects.id] }),
  role: one(roles, { fields: [invitations.roleId], references: [roles.id] }),
}));

// ---------- Built-in role templates ----------

// Rendered by db/seed.ts and by the project-creation flow (cloned per project).
export const BUILTIN_ROLES = [
  {
    name: "Owner",
    description: "Project owner. Full control. Cannot be removed.",
    position: 10,
    capabilities: [
      "task.view.all",
      "task.view.member",
      "task.view.private",
      "task.create",
      "task.update",
      "task.delete",
      "member.invite",
      "member.remove",
      "member.role.change",
      "role.create",
      "role.update",
      "role.delete",
      "project.settings",
      "project.delete",
    ],
  },
  {
    name: "Admin",
    description: "Manage members, settings, and all tasks.",
    position: 20,
    capabilities: [
      "task.view.all",
      "task.view.member",
      "task.view.private",
      "task.create",
      "task.update",
      "task.delete",
      "member.invite",
      "member.remove",
      "member.role.change",
      "role.create",
      "role.update",
      "role.delete",
      "project.settings",
    ],
  },
  {
    name: "Member",
    description: "Create and edit tasks. See public + member tasks.",
    position: 30,
    capabilities: [
      "task.view.all",
      "task.view.member",
      "task.create",
      "task.update.own",
      "task.delete.own",
    ],
  },
  {
    name: "Viewer",
    description: "Read-only access to public tasks.",
    position: 40,
    capabilities: ["task.view.all"],
  },
] as const;

export type BuiltinRoleTemplate = (typeof BUILTIN_ROLES)[number];
