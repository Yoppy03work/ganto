/**
 * Read-only mirrors of Neon Auth's `neon_auth.*` tables.
 *
 * IMPORTANT: This file is deliberately NOT referenced by `drizzle.config.ts`.
 * Drizzle Kit's `pnpm db:generate` only diffs the tables it sees through the
 * configured `schema` path (currently `./db/schema.ts`). If we declared
 * `neonUsers` / `neonAccounts` in that schema file, Kit would treat them as
 * "missing in the DB" the next time someone regenerates a migration and emit
 * `CREATE SCHEMA neon_auth` / `CREATE TABLE neon_auth.account` — which would
 * collide with the live tables that Neon Auth manages.
 *
 * Application code still imports these via `db/schema.ts`'s re-export, so the
 * usage site is unchanged. Only the Drizzle Kit perspective is hidden.
 *
 * If new neon_auth columns appear (Better Auth upgrade), update this file —
 * NOT the migration generator.
 */
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const neonAuthSchema = pgSchema("neon_auth");

/**
 * Mirrors `neon_auth.user`. Read-only — Neon Auth owns insert / update.
 * We do NOT add foreign keys to it; downstream `text` user-id columns join
 * via explicit `::uuid` casts (see lib/projects/members.ts).
 */
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
 * Mirrors `neon_auth.account` (Better Auth's linked-provider table). Used
 * server-side to fetch each user's stored OAuth access tokens for downstream
 * API calls (GitHub Projects v2 sync, future provider integrations).
 *
 * Only the columns we actually read are declared.
 */
export const neonAccounts = neonAuthSchema.table("account", {
  id: uuid("id").primaryKey(),
  // FK target type is text because Better Auth stores user IDs as text in
  // its `account.userId` column even though `neon_auth.user.id` is uuid.
  // Cast at join time with `::uuid` when joining against `neonUsers`.
  userId: text("userId").notNull(),
  /** "github" | "google" | "credential" (email/password) | ... */
  providerId: text("providerId").notNull(),
  /** Provider-side stable user id (e.g. GitHub numeric id as string). */
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
