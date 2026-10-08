import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { importHadithDataset } from "../lib/server/sources/hadith";
import { SunnahClient, SunnahError } from "../lib/server/providers/sunnah";
import { getPool } from "../lib/server/db/client";
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const [mode, input] = process.argv.slice(2);
  if (!input || !["--manual", "--sunnah"].includes(mode))
    throw new Error(
      "Usage: pnpm exec tsx --conditions=react-server scripts/import-hadith.ts --manual reviewed.json OR --sunnah bukhari:1,muslim:2999",
    );
  if (mode === "--manual") {
    const raw = await readFile(input, "utf8");
    if (raw.length > 4000000) throw new Error("HADITH_IMPORT_TOO_LARGE");
    console.log(JSON.stringify(await importHadithDataset(JSON.parse(raw))));
    return;
  }
  const refs = input.split(",");
  if (
    !refs.length ||
    refs.length > 100 ||
    refs.some((ref) => !/^[a-z0-9_-]+:[0-9]+[a-z]?$/i.test(ref))
  )
    throw new Error("SUNNAH_QUERY_INVALID");
  const client = new SunnahClient();
  const reports = [];
  for (const ref of refs) {
    const [collection, number] = ref.split(":");
    reports.push(await client.report(collection, number));
  }
  console.log(
    JSON.stringify(
      await importHadithDataset(
        {
          edition: "Sunnah.com English hadith records",
          translator: null,
          provenance:
            "Fetched from official Sunnah.com API v1. Translation author is not supplied by these API fields.",
          coverageNotes: Array.from(
            new Set(reports.map((item) => item.coverage)),
          ).join("\n"),
          rightsStatus: "not_cleared",
          rightsNotes:
            "API access does not establish reproduction or video narration permission. No permission claim was inferred.",
          reviewedBy: "Creator review pending",
          reviewedAt: new Date().toISOString(),
          records: reports.map((item) => item.record),
        },
        {
          provider: "sunnah",
          reviewed: false,
          rawRecords: reports.map((item) => item.raw),
        },
      ),
    ),
  );
}
void main()
  .catch((error: unknown) => {
    console.error(
      error instanceof SunnahError
        ? error.code
        : error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "HADITH_IMPORT_FAILED",
    );
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
