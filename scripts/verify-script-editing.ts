import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Disposable F013 acceptance data. All passage wording is synthetic, not scripture.
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert(process.env.DATABASE_URL, "Configure the local database first.");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const database = `sabr_script_browser_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  let server: ChildProcess | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool, getDb } = await import("../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const { createEpisode } = await import("../lib/server/db/episodes");
    const { EMPTY_EPISODE } = await import("../lib/domain/episode");
    const { digest } = await import("../lib/server/hash");
    const { sourceImports, sourcePassages, embeddingIndexes, scriptRevisions } =
      await import("../lib/server/db/schema");
    const { selectFirstScript } = await import(
      "../lib/server/writing/versions"
    );
    const { writingState } = await import("../lib/server/writing/state");
    const { browseSources } = await import("../lib/server/db/sources");

    const edition = (
      await db
        .insert(sourceImports)
        .values({
          environment: "prelive",
          resourceId: 85,
          name: "Synthetic script editing edition",
          author: "Browser acceptance fixture",
          status: "completed",
          expectedChapters: 2,
          expectedVerses: 6,
          completedChapters: [1, 2],
          metadata: { synthetic: true, acceptanceFeature: "F013" },
          rightsNotes:
            "Original synthetic fixture text; not scripture or publication rights evidence.",
          checksum: digest({ fixture: "script-editing-v1" }),
        })
        .returning()
    )[0];
    const passages = await db
      .insert(sourcePassages)
      .values(
        [
          { chapter: 1, verse: 1, topic: "preparing" },
          { chapter: 1, verse: 2, topic: "patience" },
          { chapter: 1, verse: 3, topic: "a steady step" },
          { chapter: 1, verse: 4, topic: "support" },
          { chapter: 1, verse: 5, topic: "hope" },
          { chapter: 2, verse: 1, topic: "gratitude" },
        ].map(({ chapter, verse, topic }) => {
          const reference = `${chapter}:${verse}`;
          const text = `Synthetic canonical passage ${reference} about ${topic}. This is fixture text, not scripture.`;
          return {
            importId: edition.id,
            chapter,
            verse,
            reference,
            chapterName: `Synthetic chapter ${chapter}`,
            text,
            arabic: "اختبار",
            raw: { synthetic: true, reference, text },
            checksum: digest({ reference, text }),
          };
        }),
      )
      .returning();
    const index = (
      await db
        .insert(embeddingIndexes)
        .values({
          importId: edition.id,
          configHash: digest({ fixture: "script-editing-index-v1" }),
          model: "synthetic-fixture",
          dimensions: 1536,
          preprocessing: "synthetic-browser-fixture",
          state: "ready",
        })
        .returning()
    )[0];
    // This index is metadata only: editing and source browsing need no embeddings.
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic script editing fixture",
      brief: "A synthetic acceptance episode about taking a steady next step.",
      theme: "patience",
      purpose: "audition",
    });
    const manualEpisode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic manual script fixture",
      brief: "Start a script manually without inference or an embedding job.",
      theme: "hope",
      purpose: "audition",
    });
    const source = passages.find((passage) => passage.reference === "1:3")!;
    const context = passages
      .filter((passage) => passage.chapter === 1)
      .map((passage) => ({
        reference: passage.reference,
        text: passage.text,
      }));
    const blocks = [
      {
        kind: "reflection" as const,
        text: "An original fixture reflection opens this script.",
      },
      {
        kind: "quote" as const,
        text: source.text,
        sourceId: source.id,
        reference: source.reference,
        edition: edition.name,
        importId: edition.id,
      },
      {
        kind: "reflection" as const,
        text: "An original fixture reflection closes this script.",
      },
    ];
    const script = (
      await db
        .insert(scriptRevisions)
        .values({
          episodeId: episode.id,
          episodeRevision: episode.revision,
          importId: edition.id,
          indexId: index.id,
          model: episode.llmModel,
          title: episode.title,
          blocks,
          retrieval: {
            sources: [
              {
                id: source.id,
                reference: source.reference,
                text: source.text,
                edition: edition.name,
                context,
              },
            ],
          },
          checksum: digest({ title: episode.title, blocks }),
          label: "Reviewed synthetic original",
          changeKind: "generated",
          reviewState: "reviewed",
          reviewNotes: "Synthetic review marker for invalidation acceptance.",
          reviewedAt: new Date(),
        })
        .returning()
    )[0];
    await selectFirstScript(episode.id, script.id);

    const [initial, manualInitial, referenceResult, chapterResult] =
      await Promise.all([
        writingState(episode.id),
        writingState(manualEpisode.id),
        browseSources(edition.id, { reference: "1:3", page: 1 }),
        browseSources(edition.id, { chapter: 2, page: 1 }),
      ]);
    assert.equal(initial.selectedScriptId, script.id);
    assert.equal(initial.selectionRevision, 1);
    assert.equal(initial.workingDraft, null);
    assert.equal(initial.scripts.length, 1);
    assert.equal(initial.scripts[0].reviewState, "reviewed");
    assert.deepEqual(initial.scripts[0].blocks, blocks);
    assert.equal(initial.scripts[0].sources[0].context.length, 5);
    assert.equal(initial.jobs.length, 0);
    assert.equal(manualInitial.selectedScriptId, null);
    assert.equal(manualInitial.workingDraft, null);
    assert.equal(manualInitial.scripts.length, 0);
    assert.equal(manualInitial.jobs.length, 0);
    assert(referenceResult.referenceFound);
    assert.deepEqual(
      referenceResult.rows.map((passage) => passage.reference),
      ["1:1", "1:2", "1:3", "1:4", "1:5"],
    );
    assert.deepEqual(
      chapterResult.rows.map((passage) => passage.reference),
      ["2:1"],
    );
    assert.equal(
      (
        await pool.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM provider_usage",
        )
      ).rows[0].count,
      0,
    );
    console.log(
      "Deterministic F013 fixture seeded and asserted; no provider requests, embeddings, or jobs.",
    );
    if (!process.argv.includes("--serve")) return;

    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3109",
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
      `Script editing fixture: http://127.0.0.1:3109/episodes/${episode.id}/script`,
    );
    console.log(
      `Manual start fixture: http://127.0.0.1:3109/episodes/${manualEpisode.id}/script`,
    );
    console.log(
      "Commands: report, conflict, conflict manual, stop. Conflict changes only the requested fixture's existing draft.",
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
              const fixtureIds = [episode.id, manualEpisode.id];
              const [scripts, drafts, selection, jobs, usage] =
                await Promise.all([
                  pool!.query(
                    "SELECT id, episode_id, parent_id, import_id, index_id, title, label, change_kind, blocks, retrieval, checksum, review_state FROM script_revisions WHERE episode_id=ANY($1::uuid[]) ORDER BY created_at,id",
                    [fixtureIds],
                  ),
                  pool!.query(
                    "SELECT episode_id, base_script_id, revision, title, blocks FROM episode_script_drafts WHERE episode_id=ANY($1::uuid[]) ORDER BY episode_id",
                    [fixtureIds],
                  ),
                  pool!.query(
                    "SELECT episode_id, selected_script_id, revision FROM episode_workspace_states WHERE episode_id=ANY($1::uuid[]) ORDER BY episode_id",
                    [fixtureIds],
                  ),
                  pool!.query(
                    "SELECT id,episode_id,kind,status,error FROM jobs ORDER BY created_at",
                  ),
                  pool!.query<{ count: number }>(
                    "SELECT count(*)::int AS count FROM provider_usage",
                  ),
                ]);
              console.log(
                JSON.stringify(
                  {
                    fixtureEpisodes: {
                      editing: episode.id,
                      manual: manualEpisode.id,
                    },
                    scripts: scripts.rows,
                    drafts: drafts.rows,
                    selection: selection.rows,
                    jobs: jobs.rows,
                    providerUsageCount: usage.rows[0].count,
                  },
                  null,
                  2,
                ),
              );
              assert.equal(jobs.rows.length, 0, "Unexpected fixture job.");
              assert.equal(
                usage.rows[0].count,
                0,
                "Unexpected provider usage.",
              );
              return;
            }
            if (command === "conflict" || command === "conflict manual") {
              const targetId =
                command === "conflict manual" ? manualEpisode.id : episode.id;
              const updated = await pool!.query(
                "UPDATE episode_script_drafts SET revision=revision+1,title='Concurrent fixture title',updated_at=now() WHERE episode_id=$1 RETURNING episode_id,title,revision",
                [targetId],
              );
              console.log(
                updated.rows[0] ||
                  "No existing draft to create a conflict with.",
              );
            }
          })
          .catch((error: unknown) => {
            console.error(
              error instanceof Error ? error.message : "FIXTURE_COMMAND_FAILED",
            );
          });
      });
    });
    await commands;
  } finally {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      await new Promise<void>((resolve) => {
        const forceStop = setTimeout(() => server?.kill("SIGKILL"), 5000);
        server!.once("exit", () => {
          clearTimeout(forceStop);
          resolve();
        });
        server!.kill("SIGTERM");
      });
    }
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "SCRIPT_EDITING_FIXTURE_FAILED",
  );
  process.exitCode = 1;
});
