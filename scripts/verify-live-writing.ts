import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Explicit opt-in only; routine verification never dispatches paid inference.
async function main() {
  assert(
    process.argv.includes("--run"),
    "Use --run only with creator authorization.",
  );
  nextEnv.loadEnvConfig(process.cwd());
  const { LLM_MODELS, EMPTY_EPISODE } = await import("../lib/domain/episode");
  const {
    openRouterAccount,
    generateIdeaDirections,
    generateReflectionRewrites,
  } = await import("../lib/server/providers/openrouter");
  const evidence: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    authorizedEstimatedCapUsd: 0.03,
    dispatchCount: 0,
    resultCount: 0,
  };
  let pool: Pool | undefined;
  let admin: Pool | undefined;
  let database: string | undefined;
  try {
    const balance = await openRouterAccount();
    evidence.creditsConfirmed = balance >= 0.1;
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`MODEL_CATALOG_HTTP_${response.status}`);
    const catalog = (await response.json()) as {
      data: { id: string; pricing?: { prompt: string; completion: string } }[];
    };
    assert(Array.isArray(catalog.data), "MODEL_CATALOG_INVALID");
    const eligible = LLM_MODELS.map((id) => {
      const entry = catalog.data.find((model) => model.id === id);
      const input = Number(entry?.pricing?.prompt);
      const output = Number(entry?.pricing?.completion);
      return {
        id,
        available: Boolean(entry),
        pricesKnown:
          Boolean(entry) &&
          Number.isFinite(input) &&
          Number.isFinite(output) &&
          input >= 0 &&
          output >= 0,
      };
    });
    evidence.models = eligible;
    const chosen = eligible.find(
      (model) => model.available && model.pricesKnown,
    );
    if (!chosen) {
      evidence.blocker = "PERMITTED_MODELS_NOT_AVAILABLE_WITH_KNOWN_PRICES";
      return;
    }
    if (balance < 0.13) {
      evidence.blocker = "CONFIRMED_CREDITS_BELOW_BOUNDED_RUN_RESERVE";
      return;
    }
    evidence.model = chosen.id;
    assert(process.env.DATABASE_URL, "DATABASE_NOT_CONFIGURED");
    admin = new Pool({ connectionString: process.env.DATABASE_URL });
    database = `sabr_live_writing_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool, getDb } = await import("../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const { createEpisode } = await import("../lib/server/db/episodes");
    const { sourceImports } = await import("../lib/server/db/schema");
    const {
      requestIdeaSuggestions,
      createIdeaSuggestions,
      ideaAssistanceState,
    } = await import("../lib/server/ideas/suggestions");
    const { requestScriptRewrite, createScriptRewrites, scriptRewriteState } =
      await import("../lib/server/writing/rewrites");
    const { startManualDraft } = await import("../lib/server/writing/versions");
    const { runOne } = await import("../lib/server/jobs/run");
    const db = getDb();
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Making room for a gentle next step",
      brief:
        "A creator wants compassionate reassurance after a difficult week, without religious guarantees.",
      theme: "patience",
      llmModel: chosen.id,
    });
    const idea = await requestIdeaSuggestions(episode.id, {
      episodeRevision: episode.revision,
      model: chosen.id,
      instructions:
        "Offer concise, practical encouragement without quotations.",
      input: {
        title: episode.title,
        brief: episode.brief,
        theme: episode.theme,
        targetSeconds: episode.targetSeconds,
      },
    });
    const ideaResult = await runOne(idea.id, (job) =>
      createIdeaSuggestions(job, (owned, model, prompt) =>
        generateIdeaDirections(owned, model, prompt, 0.015),
      ),
    );
    evidence.idea = {
      status: ideaResult?.status,
      error: ideaResult?.error,
      retainedSetCount: (await ideaAssistanceState(episode.id)).suggestions
        .length,
    };
    const [edition] = await db
      .insert(sourceImports)
      .values({
        environment: "prelive",
        resourceId: 85,
        name: "Manual live-check provenance fixture",
        author: "Fixture",
        status: "completed",
        expectedChapters: 1,
        expectedVerses: 1,
        completedChapters: [1],
        metadata: { synthetic: true },
        rightsNotes: "No source quotations used",
      })
      .returning();
    const text =
      "You do not have to solve everything today. Take one gentle step that remains within your control.";
    const script = await startManualDraft(episode.id, {
      importId: edition.id,
      episodeRevision: episode.revision,
      title: episode.title,
      text,
    });
    const selection = {
      blockIndex: 0,
      blockText: text,
      start: 0,
      end: text.indexOf(" Take"),
      text: "You do not have to solve everything today.",
    };
    const rewrite = await requestScriptRewrite(episode.id, {
      baseScriptId: script.id,
      draftRevision: 0,
      episodeRevision: episode.revision,
      model: chosen.id,
      instructions:
        "Simplify this reassurance without promises or canonical quotations.",
      selection,
    });
    const rewriteResult = await runOne(rewrite.id, (job) =>
      createScriptRewrites(job, (owned, model, prompt) =>
        generateReflectionRewrites(owned, model, prompt, 0.015),
      ),
    );
    evidence.rewrite = {
      status: rewriteResult?.status,
      error: rewriteResult?.error,
      retainedSetCount: (await scriptRewriteState(episode.id)).suggestions
        .length,
    };
    const usage = (
      await pool.query(
        "SELECT state, estimated, actual, model FROM provider_usage ORDER BY created_at",
      )
    ).rows;
    evidence.usage = usage;
    evidence.dispatchCount = usage.filter((row) =>
      ["settled", "uncertain", "dispatched"].includes(row.state),
    ).length;
    evidence.estimatedUsd = usage.reduce(
      (total, row) => total + row.estimated,
      0,
    );
    evidence.actualUsd = usage.reduce(
      (total, row) => total + (row.actual ?? 0),
      0,
    );
    evidence.resultCount =
      (await ideaAssistanceState(episode.id)).suggestions.length +
      (await scriptRewriteState(episode.id)).suggestions.length;
    assert(Number(evidence.estimatedUsd) <= 0.03);
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "LIVE_WRITING_CHECK_UNAVAILABLE";
    evidence.blocker = code;
  } finally {
    await pool?.end();
    if (admin && database)
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin?.end();
    await mkdir(".data/evidence/2026-10-08", { recursive: true });
    await writeFile(
      ".data/evidence/2026-10-08/live-writing.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  }
}
void main();
