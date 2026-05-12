-- NOTE: The Drizzle generator also tried to emit `CREATE SCHEMA neon_auth` and
-- `CREATE TABLE neon_auth.user` because we mirror that table in `db/schema.ts`
-- for join purposes. Neon Auth owns that schema in production, so we strip
-- those statements out here. The mirrored definition is read-only from our
-- side and only exists for type-checking joins.

ALTER TABLE "memberships" ADD COLUMN "lock_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lock_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "lock_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lock_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deleted_by_user_id" text;--> statement-breakpoint
CREATE INDEX "tasks_project_deleted_idx" ON "tasks" USING btree ("project_id","deleted_at");
