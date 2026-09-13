import nextEnv from "@next/env";
import { enqueueJob } from "../lib/server/jobs/store";
import { runOne } from "../lib/server/jobs/run";
import { getPool, getDb } from "../lib/server/db/client";
import { episodes, sourceImports } from "../lib/server/db/schema";
import { desc, eq } from "drizzle-orm";
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  try {
    const command = process.argv[2] || "draft";
    const db = getDb();
    const edition = (
      await db
        .select()
        .from(sourceImports)
        .where(eq(sourceImports.status, "completed"))
        .orderBy(desc(sourceImports.createdAt))
    )[0];
    if (!edition) throw new Error("IMPORT_SOURCES_FIRST");
    const episode = (
      await db.select().from(episodes).orderBy(desc(episodes.updatedAt))
    )[0];
    const kind =
      command === "evaluate"
        ? "retrieval_eval"
        : command === "index"
          ? "index"
          : "draft";
    const input =
      kind === "draft"
        ? {
            episodeId: episode.id,
            episodeRevision: episode.revision,
            importId: edition.id,
          }
        : { importId: edition.id };
    const job = await enqueueJob(
      kind,
      input,
      kind === "draft" ? episode.id : undefined,
    );
    console.log("Job:", job.id, job.status);
    const result = job.status === "succeeded" ? job : await runOne(job.id);
    console.log(
      JSON.stringify({
        id: result?.id,
        status: result?.status,
        error: result?.error,
        result: result?.result,
      }),
    );
    if (result?.status !== "succeeded") process.exitCode = 1;
  } catch (e) {
    console.error(
      e instanceof Error && /^[A-Z_]+$/.test(e.message)
        ? e.message
        : "WRITING_COMMAND_FAILED",
    );
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}
void main();
