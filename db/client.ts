import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// On Edge Runtime / Vercel Serverless, Neon's HTTP driver is the right choice.
// It's stateless and single-shot, no connection pooling to manage.
//
// (We previously set `neonConfig.fetchConnectionCache = true` here, but the
// option is now the default and emits a deprecation warning at build time.
// Removing it has no behavioural impact.)

if (!process.env.DATABASE_URL) {
  // Throw lazily so build-time analysis doesn't fail. This will only fire
  // when a route actually tries to use the DB.
  console.warn("[db] DATABASE_URL is not set; DB calls will fail at runtime.");
}

const sql = neon(process.env.DATABASE_URL ?? "");
export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema };
