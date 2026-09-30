import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const directions = [
  {
    angle: "Waiting without reading silence as rejection",
    title: "When waiting feels heavy",
    hook: "You can be tired of waiting without giving up hope.",
    takeaway: "Name one small action that remains within your control today.",
  },
  {
    angle: "Making room for grief and trust at the same time",
    title: "Trust can hold a tired heart",
    hook: "Faith does not require you to pretend this is easy.",
    takeaway: "Write one honest sentence about the difficulty before reflecting.",
  },
  {
    angle: "Turning an uncertain season into a gentle next step",
    title: "A small step while the answer is unclear",
    hook: "You do not need the whole path to choose the next kind step.",
    takeaway: "Choose one useful task that takes less than ten minutes.",
  },
];

const supported = { supported: true, reason: "", directions };

test("idea suggestions retain revision snapshots without replacing episode or script work", async () => {
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  assert(configuredDatabaseUrl, "Run pnpm db:configure and pnpm db:up first.");
  const admin = new Pool({
    connectionString: configuredDatabaseUrl,
    connectionTimeoutMillis: 3000,
  });
  const database = `sabr_ideas_${randomUUID().replaceAll("-", "")}`;
  let applicationPool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(configuredDatabaseUrl);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool, getDb } = await import("../../lib/server/db/client");
    applicationPool = getPool();
    await migrate(drizzle(applicationPool), { migrationsFolder: "drizzle" });
    await migrate(drizzle(applicationPool), { migrationsFolder: "drizzle" });

    const { EMPTY_EPISODE } = await import("../../lib/domain/episode");
    const { createEpisode, updateEpisode, findEpisode } = await import(
      "../../lib/server/db/episodes"
    );
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "A persistent intention",
      brief: "I have tried for months and feel that nothing is changing.",
      theme: "patience",
    });
    const otherEpisode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "A separate episode",
    });

    const {
      embeddingIndexes,
      episodeScriptDrafts,
      episodeWorkspaceStates,
      ideaSuggestionSets,
      scriptRevisions,
      sourceImports,
    } = await import("../../lib/server/db/schema");
    const db = getDb();
    const sourceImport = (
      await db
        .insert(sourceImports)
        .values({
          environment: "prelive",
          resourceId: 85,
          name: "Synthetic source fixture",
          author: "Fixture",
          status: "completed",
          expectedChapters: 1,
          expectedVerses: 1,
          completedChapters: [1],
          metadata: {},
          rightsNotes: "Synthetic integration fixture; not publication evidence.",
        })
        .returning()
    )[0];
    const index = (
      await db
        .insert(embeddingIndexes)
        .values({
          importId: sourceImport.id,
          configHash: "idea-test-fixture",
          model: "text-embedding-3-small",
          dimensions: 1536,
          preprocessing: "synthetic fixture",
          state: "ready",
        })
        .returning()
    )[0];
    const script = (
      await db
        .insert(scriptRevisions)
        .values({
          episodeId: episode.id,
          episodeRevision: episode.revision,
          importId: sourceImport.id,
          indexId: index.id,
          model: episode.llmModel,
          title: "Existing selected script",
          blocks: [{ kind: "reflection", text: "Existing immutable script." }],
          retrieval: { fixture: true },
          checksum: "a".repeat(64),
        })
        .returning()
    )[0];
    const draft = (
      await db
        .insert(episodeScriptDrafts)
        .values({
          episodeId: episode.id,
          baseScriptId: script.id,
          revision: 4,
          title: "Existing working draft",
          blocks: [{ kind: "reflection", text: "Unsaved creator wording." }],
        })
        .returning()
    )[0];
    await db.insert(episodeWorkspaceStates).values({
      episodeId: episode.id,
      selectedScriptId: script.id,
    });

    const { requestIdeaSuggestions, ideaAssistanceState, retryIdeaSuggestion } =
      await import("../../lib/server/ideas/suggestions");
    const { createIdeaSuggestions } = await import(
      "../../lib/server/ideas/suggestions"
    );
    const { runOne } = await import("../../lib/server/jobs/run");
    const { claimJob, findJob } = await import("../../lib/server/jobs/store");
    const initialInput = {
      title: episode.title,
      brief: episode.brief,
      theme: episode.theme,
      targetSeconds: episode.targetSeconds,
    };
    const firstRequest = {
      episodeRevision: episode.revision,
      model: "openai/gpt-5.6-luna" as const,
      instructions: "Make the tone more reassuring.",
      input: initialInput,
    };
    const firstRequestId = randomUUID();
    const firstJob = await requestIdeaSuggestions(
      episode.id,
      firstRequest,
      firstRequestId,
    );
    const idempotentFirstJob = await requestIdeaSuggestions(
      episode.id,
      firstRequest,
      firstRequestId,
    );
    assert.equal(idempotentFirstJob.id, firstJob.id);
    await assert.rejects(
      requestIdeaSuggestions(
        episode.id,
        {
          ...firstRequest,
          input: { ...initialInput, title: "Different idea under same identity" },
        },
        firstRequestId,
      ),
      /IDEA_REQUEST_ID_REUSED/,
    );
    const freshAlternative = await requestIdeaSuggestions(
      episode.id,
      {
        ...firstRequest,
        model: "google/gemini-3.8-flash",
        instructions: "Use a gentler practical takeaway.",
      },
      randomUUID(),
    );
    assert.notEqual(freshAlternative.id, firstJob.id);

    const editedEpisode = await updateEpisode(
      episode.id,
      {
        title: "A persistent intention, revised",
        brief: "The creator has updated the episode brief while suggestions run.",
        theme: episode.theme,
        targetSeconds: episode.targetSeconds,
        llmModel: episode.llmModel,
        narrationProvider: episode.narrationProvider,
        format: episode.format,
        purpose: episode.purpose,
      },
      episode.revision,
    );
    assert(editedEpisode);
    const staleIdempotentRequest = await requestIdeaSuggestions(
      episode.id,
      firstRequest,
      firstRequestId,
    );
    assert.equal(staleIdempotentRequest.id, firstJob.id);

    const generatorCalls: Array<{ jobId: string; model: string; prompt: string }> =
      [];
    const validGenerator = async (
      job: { id: string; input: unknown },
      model: string,
      prompt: string,
    ) => {
      generatorCalls.push({ jobId: job.id, model, prompt });
      const snapshot = (job.input as { input: typeof initialInput }).input;
      assert.deepEqual(
        (JSON.parse(prompt) as { episode: typeof initialInput }).episode,
        snapshot,
      );
      return supported;
    };
    const firstRun = await runOne(firstJob.id, (job) =>
      createIdeaSuggestions(job, validGenerator),
    );
    assert.equal(firstRun?.status, "succeeded");
    const alternativeRun = await runOne(freshAlternative.id, (job) =>
      createIdeaSuggestions(job, validGenerator),
    );
    assert.equal(alternativeRun?.status, "succeeded");
    assert.deepEqual(
      generatorCalls.map(({ model }) => model),
      ["openai/gpt-5.6-luna", "google/gemini-3.8-flash"],
    );

    const retainedBeforeRetry = await db
      .select()
      .from(ideaSuggestionSets)
      .where(eq(ideaSuggestionSets.episodeId, episode.id));
    assert.equal(retainedBeforeRetry.length, 2);
    const firstSet = retainedBeforeRetry.find((set) => set.jobId === firstJob.id);
    assert(firstSet);
    assert.equal(firstSet.episodeRevision, episode.revision);
    assert.equal(firstSet.model, firstRequest.model);
    assert.equal(firstSet.instructions, firstRequest.instructions);
    assert.deepEqual(firstSet.inputSnapshot, initialInput);
    assert.deepEqual(firstSet.suggestions, directions);
    const secondSet = retainedBeforeRetry.find(
      (set) => set.jobId === freshAlternative.id,
    );
    assert(secondSet);
    assert.equal(secondSet.model, "google/gemini-3.8-flash");
    assert.equal(secondSet.episodeRevision, episode.revision);

    const currentEpisode = await findEpisode(episode.id);
    assert.equal(currentEpisode?.revision, editedEpisode.revision);
    assert.equal(currentEpisode?.title, editedEpisode.title);
    assert.equal(currentEpisode?.brief, editedEpisode.brief);
    const retainedWorkspace = (
      await db
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episode.id))
    )[0];
    assert.equal(retainedWorkspace.selectedScriptId, script.id);
    const retainedDraft = (
      await db
        .select()
        .from(episodeScriptDrafts)
        .where(eq(episodeScriptDrafts.episodeId, episode.id))
    )[0];
    assert.equal(retainedDraft.episodeId, draft.episodeId);
    assert.equal(retainedDraft.revision, draft.revision);
    assert.equal(retainedDraft.title, draft.title);
    assert.deepEqual(retainedDraft.blocks, draft.blocks);

    const firstState = await ideaAssistanceState(episode.id);
    const otherState = await ideaAssistanceState(otherEpisode.id);
    assert(firstState.jobs.some((job) => job.id === firstJob.id));
    assert(firstState.suggestions.some((set) => set.model === firstRequest.model));
    assert(!otherState.jobs.some((job) => job.id === firstJob.id));
    assert(!otherState.suggestions.some((set) => set.id === firstSet.id));
    await assert.rejects(
      retryIdeaSuggestion(otherEpisode.id, firstJob.id),
      /IDEA/,
    );

    const revisedInput = {
      title: editedEpisode.title,
      brief: editedEpisode.brief,
      theme: editedEpisode.theme,
      targetSeconds: editedEpisode.targetSeconds,
    };
    const retryableJob = await requestIdeaSuggestions(
      episode.id,
      {
        episodeRevision: editedEpisode.revision,
        model: "openai/gpt-5.6-luna",
        instructions: "Fixture for retry identity.",
        input: revisedInput,
      },
      randomUUID(),
    );
    const malformedRun = await runOne(retryableJob.id, (job) =>
      createIdeaSuggestions(job, async () => ({
        supported: true,
        reason: "",
        directions: directions.slice(0, 2),
      })),
    );
    assert.equal(malformedRun?.status, "failed");
    const afterMalformed = await db
      .select()
      .from(ideaSuggestionSets)
      .where(eq(ideaSuggestionSets.episodeId, episode.id));
    assert.equal(afterMalformed.length, 2);
    const firstRetry = await retryIdeaSuggestion(episode.id, retryableJob.id);
    const repeatedRetry = await retryIdeaSuggestion(
      episode.id,
      retryableJob.id,
    );
    assert.equal(firstRetry.id, retryableJob.id);
    assert.equal(repeatedRetry.id, retryableJob.id);
    const retryRun = await runOne(retryableJob.id, (job) =>
      createIdeaSuggestions(job, validGenerator),
    );
    assert.equal(retryRun?.status, "succeeded");
    const afterRetry = await db
      .select()
      .from(ideaSuggestionSets)
      .where(eq(ideaSuggestionSets.episodeId, episode.id));
    assert.equal(afterRetry.length, 3);
    assert.equal(
      afterRetry.filter((set) => set.jobId === retryableJob.id).length,
      1,
      "Retry keeps its original job identity and creates one retained set.",
    );
    const completedJob = await findJob(retryableJob.id);
    assert(completedJob);
    const callCountBeforeDuplicate = generatorCalls.length;
    await createIdeaSuggestions(completedJob, validGenerator);
    assert.equal(
      generatorCalls.length,
      callCountBeforeDuplicate,
      "Reprocessing a retained job must reuse its result without another generation.",
    );

    const unsupportedJob = await requestIdeaSuggestions(
      episode.id,
      {
        episodeRevision: editedEpisode.revision,
        model: "google/gemini-3.8-flash",
        instructions: "Fixture for unsupported output.",
        input: revisedInput,
      },
      randomUUID(),
    );
    const unsupportedRun = await runOne(unsupportedJob.id, (job) =>
      createIdeaSuggestions(job, async () => ({
        supported: false,
        reason: "This asks for a religious ruling.",
        directions: [],
      })),
    );
    assert.equal(unsupportedRun?.status, "failed");
    const afterUnsupported = await db
      .select()
      .from(ideaSuggestionSets)
      .where(eq(ideaSuggestionSets.episodeId, episode.id));
    assert.equal(afterUnsupported.length, 3);

    const leaseJob = await requestIdeaSuggestions(
      episode.id,
      {
        episodeRevision: editedEpisode.revision,
        model: "openai/gpt-5.6-luna",
        instructions: "Fixture for ownership check.",
        input: revisedInput,
      },
      randomUUID(),
    );
    const lease = await claimJob(leaseJob.id);
    assert(lease?.owner);
    await applicationPool.query("UPDATE jobs SET owner = $2 WHERE id = $1", [
      lease.id,
      randomUUID(),
    ]);
    await assert.rejects(
      createIdeaSuggestions(lease, validGenerator),
      /JOB_LEASE_LOST|IDEA_JOB_LEASE_LOST/,
    );
    const afterLostLease = await db
      .select()
      .from(ideaSuggestionSets)
      .where(eq(ideaSuggestionSets.episodeId, episode.id));
    assert.equal(afterLostLease.length, 3);
  } finally {
    await applicationPool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
