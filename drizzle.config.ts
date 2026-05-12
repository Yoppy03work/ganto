import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Drizzle CLI is run outside Next.js, so it doesn't auto-load .env.local.
config({ path: ".env.local" });
config({ path: ".env" }); // fallback

export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
