import nextEnv from "@next/env";
import { importQuran } from "../lib/server/sources/importer";
import { QuranError } from "../lib/server/providers/quran";
import { getPool } from "../lib/server/db/client";
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  try {
    const argument = process.argv.slice(2).find((a) => !a.startsWith("--"));
    const resource = Number(argument || process.env.QURAN_TRANSLATION_ID);
    const result = await importQuran(resource, {
      refresh: process.argv.includes("--refresh"),
      onProgress: console.log,
    });
    console.log(
      `${result.cached ? "Reused verified import" : "Completed available corpus"}: ${result.id}. Inspect /sources; coverage and publication rights remain separate.`,
    );
  } catch (error) {
    console.error(
      error instanceof QuranError ? error.code : "SOURCE_IMPORT_FAILED",
    );
    process.exitCode = 1;
  } finally {
    if (process.env.DATABASE_URL) await getPool().end();
  }
}
void main();
