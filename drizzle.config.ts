import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL)
  throw new Error(
    "Missing DATABASE_URL. Run pnpm db:configure or configure your database.",
  );

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
});
