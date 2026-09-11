import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import nextEnv from "@next/env";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root);
const file = resolve(root, ".env");
const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
const password =
  process.env.SABR_DB_PASSWORD || randomBytes(24).toString("hex");
const additions = [];
if (!process.env.SABR_DB_PASSWORD)
  additions.push(`SABR_DB_PASSWORD=${password}`);
if (!process.env.DATABASE_URL) {
  additions.push(
    `DATABASE_URL=postgresql://sabr:${encodeURIComponent(password)}@127.0.0.1:55432/sabr_and_steps`,
  );
}
if (additions.length) {
  writeFileSync(
    file,
    `${existing.trimEnd()}\n\n# Project-local PostgreSQL\n${additions.join("\n")}\n`,
    { mode: 0o600 },
  );
}
console.log(
  "Local database settings prepared. Existing credentials were preserved; no secrets printed.",
);
