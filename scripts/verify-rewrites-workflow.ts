import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const database = `sabr_rewrite_browser_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  let server: ChildProcess | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool, getDb } = await import("../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const { EMPTY_EPISODE } = await import("../lib/domain/episode");
    const { createEpisode } = await import("../lib/server/db/episodes");
    const { sourceImports, sourcePassages } = await import(
      "../lib/server/db/schema"
    );
    const { startManualDraft } = await import("../lib/server/writing/versions");
    const { saveDraft } = await import("../lib/server/writing/drafts");
    const { writingState } = await import("../lib/server/writing/state");
    const { requestScriptRewrite, createScriptRewrites, scriptRewriteState } =
      await import("../lib/server/writing/rewrites");
    const { runOne } = await import("../lib/server/jobs/run");
    const { ProviderError } = await import(
      "../lib/server/providers/openrouter"
    );
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic reflection rewrite fixture",
      brief: "A deterministic fixture; no model inference.",
    });
    const [edition] = await db
      .insert(sourceImports)
      .values({
        environment: "prelive",
        resourceId: 85,
        name: "Synthetic fixture edition",
        author: "Fixture",
        status: "completed",
        expectedChapters: 1,
        expectedVerses: 1,
        completedChapters: [1],
        metadata: { synthetic: true },
        rightsNotes: "Synthetic text, not scripture or publication clearance",
      })
      .returning();
    const [source] = await db
      .insert(sourcePassages)
      .values({
        importId: edition.id,
        chapter: 1,
        verse: 1,
        reference: "1:1",
        chapterName: "Fixture",
        text: "Synthetic canonical source text. This is not scripture.",
        arabic: "اختبار",
        raw: {},
        checksum: "fixture",
      })
      .returning();
    const reflection =
      "Before the next step, pause. A tired heart can rest. You can begin again gently.";
    const manual = await startManualDraft(episode.id, {
      importId: edition.id,
      episodeRevision: episode.revision,
      title: episode.title,
      text: reflection,
    });
    const script = await saveDraft(episode.id, {
      parentId: manual.id,
      title: episode.title,
      blocks: [
        { kind: "reflection", text: reflection },
        {
          kind: "quote",
          text: source.text,
          sourceId: source.id,
          reference: source.reference,
          importId: edition.id,
          edition: edition.name,
        },
        {
          kind: "reflection",
          text: "An unrelated closing reflection stays editable.",
        },
      ],
    });
    const start = reflection.indexOf("A tired");
    const selection = {
      blockIndex: 0,
      blockText: reflection,
      start,
      end: reflection.indexOf(" You can"),
      text: "A tired heart can rest.",
    };
    const fixtureOutput = {
      supported: true,
      reason: "",
      alternatives: [
        {
          text: "Let your heart take a quiet pause.",
          reason: "A gentler invitation",
        },
        {
          text: "Rest can be one small step today.",
          reason: "A practical direction",
        },
        {
          text: "You may make room for a moment of rest.",
          reason: "Reassurance without a promise",
        },
      ],
    };
    for (const model of ["openai/gpt-5.6-luna", "google/gemini-3.8-flash"]) {
      const job = await requestScriptRewrite(episode.id, {
        baseScriptId: script.id,
        draftRevision: 0,
        episodeRevision: episode.revision,
        selection,
        instructions: "Synthetic gentler alternatives",
        model,
      });
      assert.equal(
        (
          await runOne(job.id, (owned) =>
            createScriptRewrites(owned, async () => fixtureOutput),
          )
        )?.status,
        "succeeded",
      );
    }
    const state = await scriptRewriteState(episode.id);
    assert.equal(state.suggestions.length, 2);
    assert.equal((await writingState(episode.id)).selectedScriptId, script.id);
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM provider_usage"))
        .rows[0].n,
      0,
    );
    console.log(
      "Deterministic rewrite fixture passes; no live provider requests.",
    );
    if (!process.argv.includes("--serve")) return;
    const port = process.env.REWRITE_FIXTURE_PORT || "3110";
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        port,
      ],
      {
        env: {
          ...process.env,
          OPENROUTER_API_KEY: "",
          CARTESIA_API_KEY: "",
          ELEVEN_LABS_API_KEY: "",
          DEEPGRAM_API_KEY: "",
        },
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    console.log(
      `Rewrite fixture: http://127.0.0.1:${port}/episodes/${episode.id}/script`,
    );
    console.log(
      "Commands: complete, fail, uncertain, report, stop. Only this disposable fixture is processed.",
    );
    const control = createInterface({ input: process.stdin });
    let commands = Promise.resolve();
    await new Promise<void>((resolve, reject) => {
      const stop = () => {
        control.close();
        server?.kill("SIGTERM");
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      server!.once("error", reject);
      server!.once("exit", () => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        control.close();
        resolve();
      });
      control.on("line", (line) => {
        commands = commands
          .then(async () => {
            const command = line.trim();
            if (command === "stop") return stop();
            if (command === "report") {
              console.log(
                JSON.stringify(
                  {
                    writing: await writingState(episode.id),
                    rewrites: await scriptRewriteState(episode.id),
                    usage: (
                      await pool!.query(
                        "SELECT count(*)::int AS n FROM provider_usage",
                      )
                    ).rows[0].n,
                  },
                  null,
                  2,
                ),
              );
              return;
            }
            if (!["complete", "fail", "uncertain"].includes(command)) return;
            const queued = await pool!.query(
              "SELECT id FROM jobs WHERE episode_id=$1 AND kind='script_rewrite' AND status='queued' ORDER BY created_at",
              [episode.id],
            );
            for (const job of queued.rows) {
              const result = await runOne(job.id, (owned) =>
                createScriptRewrites(owned, async () => {
                  if (command === "uncertain")
                    throw new ProviderError(
                      "FIXTURE_RESULT_UNCERTAIN",
                      false,
                      true,
                    );
                  if (command === "fail")
                    return { supported: true, reason: "", alternatives: [] };
                  return fixtureOutput;
                }),
              );
              console.log(
                JSON.stringify({
                  id: result?.id,
                  status: result?.status,
                  error: result?.error,
                }),
              );
            }
          })
          .catch((error: unknown) =>
            console.error(
              error instanceof Error ? error.message : "FIXTURE_COMMAND_FAILED",
            ),
          );
      });
    });
    await commands;
  } finally {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      await new Promise<void>((resolve) => {
        const forced = setTimeout(() => server?.kill("SIGKILL"), 5000);
        server!.once("exit", () => {
          clearTimeout(forced);
          resolve();
        });
        server!.kill("SIGTERM");
      });
    }
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "REWRITE_FIXTURE_FAILED",
  );
  process.exitCode = 1;
});
