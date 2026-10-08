import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
nextEnv.loadEnvConfig(process.cwd());

test("rewrite jobs retain immutable reflection alternatives and preserve later script work", async () => {
  const configured = process.env.DATABASE_URL;
  assert(configured);
  const admin = new Pool({ connectionString: configured });
  const database = `sabr_rewrites_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(configured);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool, getDb } = await import("../../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const { EMPTY_EPISODE } = await import("../../lib/domain/episode");
    const { createEpisode, findEpisode } = await import(
      "../../lib/server/db/episodes"
    );
    const {
      sourceImports,
      sourcePassages,
      episodeScriptDrafts,
      scriptRevisions,
      jobs,
    } = await import("../../lib/server/db/schema");
    const { startManualDraft, autosaveWorkingDraft, scriptVersionState } =
      await import("../../lib/server/writing/versions");
    const {
      requestScriptRewrite,
      createScriptRewrites,
      scriptRewriteState,
      rejectScriptRewrite,
      retryScriptRewrite,
    } = await import("../../lib/server/writing/rewrites");
    const { runOne } = await import("../../lib/server/jobs/run");
    const { claimJob } = await import("../../lib/server/jobs/store");
    const { applyReflectionRewrite } = await import(
      "../../lib/domain/script-rewrites"
    );
    const db = getDb();
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Rewrite fixture",
    });
    const otherEpisode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Other fixture",
    });
    const [edition] = await db
      .insert(sourceImports)
      .values({
        environment: "prelive",
        resourceId: 85,
        name: "Synthetic",
        author: "Fixture",
        status: "completed",
        expectedChapters: 1,
        expectedVerses: 1,
        completedChapters: [1],
        metadata: {},
        rightsNotes: "Fixture only",
      })
      .returning();
    const [passage] = await db
      .insert(sourcePassages)
      .values({
        importId: edition.id,
        chapter: 1,
        verse: 1,
        reference: "1:1",
        chapterName: "Fixture",
        text: "Canonical fixture wording.",
        arabic: "اختبار",
        raw: {},
        checksum: "fixture",
      })
      .returning();
    const text = "Before. A tired heart can rest. After.";
    const manual = await startManualDraft(episode.id, {
      importId: edition.id,
      episodeRevision: episode.revision,
      title: episode.title,
      text,
    });
    const start = text.indexOf("A tired");
    const selection = {
      blockIndex: 0,
      blockText: text,
      start,
      end: text.indexOf(" After."),
      text: "A tired heart can rest.",
    };
    const input = {
      baseScriptId: manual.id,
      draftRevision: 0,
      episodeRevision: episode.revision,
      model: "openai/gpt-5.6-luna",
      instructions: "Gentler",
      selection,
    };
    const requestId = randomUUID();
    const first = await requestScriptRewrite(episode.id, input, requestId);
    assert.equal(
      (await requestScriptRewrite(episode.id, input, requestId)).id,
      first.id,
    );
    await assert.rejects(
      requestScriptRewrite(
        episode.id,
        { ...input, instructions: "Changed" },
        requestId,
      ),
      /REWRITE_REQUEST_ID_REUSED/,
    );
    const second = await requestScriptRewrite(episode.id, {
      ...input,
      model: "google/gemini-3.8-flash",
    });
    assert.notEqual(first.id, second.id);
    await assert.rejects(
      requestScriptRewrite(episode.id, { ...input, draftRevision: 1 }),
      /SCRIPT_DRAFT_CONFLICT/,
    );
    await assert.rejects(
      requestScriptRewrite(otherEpisode.id, input),
      /SCRIPT_NOT_FOUND/,
    );
    await assert.rejects(
      requestScriptRewrite(episode.id, {
        ...input,
        selection: {
          ...selection,
          blockText: text.replace("tired", "weary"),
          text: "A weary heart can rest.",
        },
      }),
      /REWRITE_TARGET_CHANGED/,
    );
    const alternatives = [
      { text: "Let your heart pause.", reason: "Simpler" },
      { text: "Rest can be a small step.", reason: "Practical" },
      { text: "Make room for a quiet moment.", reason: "Gentler" },
    ];
    const output = { supported: true, reason: "", alternatives };
    const quote = {
      kind: "quote" as const,
      text: passage.text,
      sourceId: passage.id,
      reference: passage.reference,
      edition: edition.name,
      importId: edition.id,
    };
    const laterBlocks = [
      { kind: "reflection" as const, text },
      quote,
      { kind: "reflection" as const, text: "Later work must survive." },
    ];
    const completed = await runOne(first.id, (job) =>
      createScriptRewrites(job, async (_job, model) => {
        assert.equal(model, input.model);
        await autosaveWorkingDraft(episode.id, {
          baseScriptId: manual.id,
          revision: 0,
          title: "Later title",
          blocks: laterBlocks,
        });
        return output;
      }),
    );
    assert.equal(completed?.status, "succeeded");
    let state = await scriptRewriteState(episode.id);
    assert.equal(state.suggestions.length, 1);
    assert.deepEqual(state.suggestions[0].selection, selection);
    assert.equal(state.suggestions[0].draftRevision, 0);
    assert.equal(state.suggestions[0].model, input.model);
    assert.deepEqual(
      (await scriptVersionState(episode.id)).workingDraft?.blocks,
      laterBlocks,
    );
    assert.equal(
      (await scriptVersionState(episode.id)).selectedScriptId,
      manual.id,
    );
    assert.equal((await findEpisode(episode.id))?.title, episode.title);
    assert.equal((await db.select().from(scriptRevisions)).length, 1);
    await assert.rejects(
      requestScriptRewrite(episode.id, {
        ...input,
        draftRevision: 1,
        selection: {
          blockIndex: 1,
          blockText: quote.text,
          start: 0,
          end: quote.text.length,
          text: quote.text,
        },
      }),
      /REWRITE_TARGET_CHANGED/,
    );
    const secondCompleted = await runOne(second.id, (job) =>
      createScriptRewrites(job, async () => output),
    );
    assert.equal(secondCompleted?.status, "succeeded");
    state = await scriptRewriteState(episode.id);
    assert.equal(state.suggestions.length, 2);
    assert.deepEqual(
      new Set(state.suggestions.map((suggestion) => suggestion.model)),
      new Set([input.model, "google/gemini-3.8-flash"]),
    );
    const accepted = applyReflectionRewrite(
      laterBlocks,
      selection,
      alternatives[0].text,
    );
    await autosaveWorkingDraft(episode.id, {
      baseScriptId: manual.id,
      revision: 1,
      title: "Later title",
      blocks: accepted,
    });
    assert.equal(accepted[0].text, "Before. Let your heart pause. After.");
    assert.deepEqual(accepted[1], quote);
    assert.equal(accepted[2].text, "Later work must survive.");
    await rejectScriptRewrite(episode.id, state.suggestions[0].id);
    assert.equal(
      (await scriptRewriteState(episode.id)).suggestions.find(
        (suggestion) => suggestion.id === state.suggestions[0].id,
      )?.rejected,
      true,
    );
    assert.deepEqual(
      (await scriptVersionState(episode.id)).workingDraft?.blocks,
      accepted,
    );
    await assert.rejects(
      rejectScriptRewrite(otherEpisode.id, state.suggestions[0].id),
      /REWRITE_NOT_FOUND/,
    );
    const updatedSelection = {
      blockIndex: 0,
      blockText: accepted[0].text,
      start: 0,
      end: accepted[0].text.length,
      text: accepted[0].text,
    };
    const freshInput = {
      ...input,
      draftRevision: 2,
      selection: updatedSelection,
    };
    const invalid = await requestScriptRewrite(episode.id, freshInput);
    const stopped = await runOne(invalid.id, (job) =>
      createScriptRewrites(job, async () => ({
        ...output,
        alternatives: alternatives.slice(0, 2),
      })),
    );
    assert.equal(stopped?.status, "failed");
    assert.equal(stopped?.error, "REWRITE_SCHEMA_INVALID");
    assert.equal(
      (await retryScriptRewrite(episode.id, invalid.id)).id,
      invalid.id,
    );
    assert.equal(
      (await retryScriptRewrite(episode.id, invalid.id)).status,
      "queued",
    );
    const uncertain = await requestScriptRewrite(episode.id, freshInput);
    await db
      .update(jobs)
      .set({ status: "needs_attention", dispatchedAt: new Date() })
      .where(eq(jobs.id, uncertain.id));
    await assert.rejects(
      retryScriptRewrite(episode.id, uncertain.id),
      /REWRITE_UNCERTAIN/,
    );
    const stolen = await requestScriptRewrite(episode.id, freshInput);
    const owned = await claimJob(stolen.id);
    assert(owned);
    await assert.rejects(
      createScriptRewrites(owned, async () => {
        await db
          .update(jobs)
          .set({ owner: randomUUID() })
          .where(eq(jobs.id, owned.id));
        return output;
      }),
      /JOB_LEASE_LOST/,
    );
    assert.equal((await scriptRewriteState(episode.id)).suggestions.length, 2);
    assert.equal((await db.select().from(episodeScriptDrafts))[0].revision, 2);
    // A tighter authorized budget must fail before reservation or inference.
    const { generateReflectionRewrites } = await import(
      "../../lib/server/providers/openrouter"
    );
    const budgetJob = await requestScriptRewrite(episode.id, freshInput);
    const realFetch = globalThis.fetch;
    const realKey = process.env.OPENROUTER_API_KEY;
    let inferenceCalls = 0;
    process.env.OPENROUTER_API_KEY = "synthetic-budget-fixture";
    globalThis.fetch = async (request) => {
      if (String(request).endsWith("/models"))
        return Response.json({
          data: [
            {
              id: input.model,
              pricing: { prompt: "0.0000001", completion: "0.0000001" },
            },
          ],
        });
      inferenceCalls++;
      throw new Error("Budget-limited fixture must not dispatch");
    };
    try {
      const capped = await runOne(budgetJob.id, (job) =>
        createScriptRewrites(job, (owned, model, prompt) =>
          generateReflectionRewrites(owned, model, prompt, 0.00000001),
        ),
      );
      assert.equal(capped?.status, "failed");
      assert.equal(capped?.error, "REQUEST_EXCEEDS_SPENDING_LIMIT");
      assert.equal(inferenceCalls, 0);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM provider_usage"))
          .rows[0].n,
        0,
      );
    } finally {
      globalThis.fetch = realFetch;
      if (realKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = realKey;
    }
    const { POST } = await import("../../app/api/episodes/[id]/rewrites/route");
    const request = new Request(
      `http://localhost:3109/api/episodes/${episode.id}/rewrites`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3109",
          host: "localhost:3109",
        },
        body: JSON.stringify({ action: "generate", data: freshInput }),
      },
    );
    assert.equal(
      (await POST(request, { params: Promise.resolve({ id: episode.id }) }))
        .status,
      202,
    );
    const foreignRequest = new Request(
      `http://localhost:3109/api/episodes/${episode.id}/rewrites`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://foreign.test",
          host: "localhost:3109",
        },
        body: "{}",
      },
    );
    assert.equal(
      (
        await POST(foreignRequest, {
          params: Promise.resolve({ id: episode.id }),
        })
      ).status,
      403,
    );
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
    process.env.DATABASE_URL = configured;
  }
});
