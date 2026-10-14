import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
nextEnv.loadEnvConfig(process.cwd());

test("private production runs snapshot, resume, preserve manual work and enforce spending/lease boundaries", async (context) => {
  assert(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const database = `sabr_automation_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  const assetRoot = await mkdtemp(
    path.join(os.tmpdir(), "sabr-automation-assets-"),
  );
  process.env.APP_DATA_DIR = assetRoot;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getDb, getPool } = await import("../../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const { seedAutomationFixture } = await import("../fixtures/automation");
    const fixture = await seedAutomationFixture();
    const {
      requestProduction,
      retryProduction,
      automationState,
      saveAutomationProfile,
    } = await import("../../lib/server/automation/store");
    const { createProductionDraft } = await import(
      "../../lib/server/automation/run"
    );
    const { createDraft } = await import("../../lib/server/writing/drafts");
    const { runOne } = await import("../../lib/server/jobs/run");
    const { persistRenderedExport } = await import(
      "../../lib/server/media/render"
    );
    const { claimJob, findJob } = await import("../../lib/server/jobs/store");
    const {
      jobs,
      productionRuns,
      compositions,
      scriptRevisions,
      providerUsage,
      episodeScriptDrafts,
      episodes,
      mediaAssets,
    } = await import("../../lib/server/db/schema");
    const input = {
      profileId: fixture.profile.id,
      requestId: randomUUID(),
      title: "A synthetic intention",
      brief: "Synthetic source and encouragement",
    };
    const [run, duplicate] = await Promise.all([
      requestProduction(input),
      requestProduction(input),
    ]);
    assert.equal(run.id, duplicate.id);
    assert.equal(run.episodeId, duplicate.episodeId);
    await assert.rejects(
      requestProduction({ ...input, brief: "Changed identity" }),
      /REQUEST_ID_REUSED/,
    );
    assert.equal((await db.select().from(episodes)).length, 1);
    await fixture.prepareQuery(run.episodeId);
    let calls = 0;
    const draft = async (job: Parameters<typeof createDraft>[0]) =>
      createDraft(job, async () => {
        calls++;
        return fixture.generator();
      });
    const interrupted = await runOne(run.jobId, (job) =>
      createProductionDraft(job, draft, async () => {
        throw new Error("SYNTHETIC_RENDER_INTERRUPTED");
      }),
    );
    assert.equal(interrupted?.status, "failed");
    const checkpoint = (
      await db
        .select()
        .from(productionRuns)
        .where(eq(productionRuns.id, run.id))
    )[0];
    assert(checkpoint.scriptId);
    assert(checkpoint.compositionId);
    assert.equal(
      (await db.select().from(scriptRevisions))[0].reviewState,
      "unreviewed",
    );
    assert.equal((await db.select().from(compositions)).length, 1);
    assert.equal(calls, 1);
    // Simulate a process dying after checkpointing, then reclaim on another owner.
    await retryProduction(run.id);
    const expired = await claimJob(run.jobId);
    assert(expired);
    await pool.query(
      "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [run.jobId],
    );
    const render = async (job: Parameters<typeof createDraft>[0]) => {
      const data = job.input as { compositionId: string; format: string };
      assert.equal(data.compositionId, checkpoint.compositionId);
      assert.equal(data.format, "both");
      const output = await persistRenderedExport(job, {
        compositionId: data.compositionId,
        jobId: job.id,
        landscapePath: "synthetic-no-media",
        verticalPath: "synthetic-no-media",
        srtPath: "synthetic",
        descriptionPath: "synthetic",
        metadata: { synthetic: true, actualRender: false },
      });
      return { exportId: output.id };
    };
    const recovered = await runOne(run.jobId, (job) =>
      createProductionDraft(job, draft, render),
    );
    assert.equal(recovered?.status, "succeeded");
    assert.equal(calls, 1);
    assert.equal((await db.select().from(compositions)).length, 1);
    assert((await automationState()).runs[0].exportId);

    const manual = await requestProduction({
      ...input,
      requestId: randomUUID(),
      title: "Manual work race",
    });
    await fixture.prepareQuery(manual.episodeId);
    const manualResult = await runOne(manual.jobId, (job) =>
      createProductionDraft(
        job,
        async (j) =>
          createDraft(j, async () => {
            await db.insert(episodeScriptDrafts).values({
              episodeId: manual.episodeId,
              title: "Creator working text",
              blocks: [{ kind: "reflection", text: "Retain this work." }],
            });
            return fixture.generator();
          }),
        render,
      ),
    );
    assert.equal(manualResult?.status, "failed");
    assert.match(manualResult?.error || "", /MANUAL_WORK_PRESENT/);
    assert.equal(
      (await db.select().from(episodeScriptDrafts))[0].title,
      "Creator working text",
    );
    assert.equal((await db.select().from(compositions)).length, 1);

    const uncertain = await requestProduction({
      ...input,
      requestId: randomUUID(),
      title: "Uncertain provider",
    });
    const uncertainResult = await runOne(uncertain.jobId, async () => {
      await db
        .update(jobs)
        .set({ dispatchedAt: new Date() })
        .where(eq(jobs.id, uncertain.jobId));
      throw new Error("SYNTHETIC_UNCERTAIN");
    });
    assert.equal(uncertainResult?.status, "needs_attention");
    await assert.rejects(
      retryProduction(uncertain.id),
      /RECONCILIATION_REQUIRED/,
    );

    const lost = await requestProduction({
      ...input,
      requestId: randomUUID(),
      title: "Lease lost while drafting",
    });
    await fixture.prepareQuery(lost.episodeId);
    const lease = await claimJob(lost.jobId);
    assert(lease);
    await assert.rejects(
      createProductionDraft(
        lease,
        async (j) =>
          createDraft(j, async () => {
            await db
              .update(jobs)
              .set({ owner: randomUUID() })
              .where(eq(jobs.id, lost.jobId));
            return fixture.generator();
          }),
        render,
      ),
      /JOB_LEASE_LOST/,
    );
    assert.equal(
      (
        await db
          .select()
          .from(scriptRevisions)
          .where(eq(scriptRevisions.jobId, lost.jobId))
      ).length,
      0,
    );

    const budget = await requestProduction({
      ...input,
      requestId: randomUUID(),
      title: "Cumulative budget",
    });
    const budgetJob = await claimJob(budget.jobId);
    assert(budgetJob);
    await db.insert(providerUsage).values({
      jobId: budgetJob.id,
      operation: `${budgetJob.id}:previous`,
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      unit: "USD",
      estimated: 0.0499,
      actual: 0.0499,
      state: "settled",
      details: {},
    });
    let dispatched = false;
    const fetchMock = context.mock.method(
      globalThis,
      "fetch",
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") dispatched = true;
        return Response.json({
          data: [
            {
              id: "openai/gpt-5.6-luna",
              pricing: { prompt: "0.00001", completion: "0.00001" },
            },
          ],
        });
      },
    );
    try {
      const { openRouterRequest } = await import(
        "../../lib/server/providers/openrouter"
      );
      await assert.rejects(
        openRouterRequest(
          budgetJob,
          "budget-test",
          "openai/gpt-5.6-luna",
          "chat/completions",
          { messages: [{ content: "Synthetic test prompt" }], max_tokens: 20 },
        ),
        /AUTOMATION_BUDGET_EXCEEDED/,
      );
      assert.equal(dispatched, false);
      assert.equal(
        (
          await db
            .select()
            .from(providerUsage)
            .where(eq(providerUsage.jobId, budgetJob.id))
        ).length,
        1,
      );
    } finally {
      fetchMock.mock.restore();
    }
    assert.equal((await findJob(budgetJob.id))?.dispatchedAt, null);
    // The bytes and DB metadata can agree while still differing from the run's
    // captured media snapshot. Such a change must stop before inference.
    const bytes = new Uint8Array(
      Buffer.from("Synthetic media integrity fixture"),
    );
    const assetPath = path.join(assetRoot, "fixture.bin");
    await writeFile(assetPath, bytes);
    const asset = (
      await db
        .insert(mediaAssets)
        .values({
          kind: "image",
          name: "Synthetic integrity asset",
          path: "fixture.bin",
          mime: "image/png",
          width: 100,
          height: 100,
          checksum: createHash("sha256").update(bytes).digest("hex"),
          provenance:
            "Synthetic metadata fixture, not actual image acceptance.",
        })
        .returning()
    )[0];
    const mediaProfile = await saveAutomationProfile({
      ...fixture.profile.settings,
      name: "Separate media profile",
      imageId: asset.id,
    });
    const changedMedia = await requestProduction({
      ...input,
      profileId: mediaProfile.id,
      requestId: randomUUID(),
    });
    assert.equal(run.snapshot.profile.imageId, null);
    await writeFile(assetPath, "Changed synthetic bytes");
    await db
      .update(mediaAssets)
      .set({
        checksum: createHash("sha256")
          .update("Changed synthetic bytes")
          .digest("hex"),
      })
      .where(eq(mediaAssets.id, asset.id));
    const changedResult = await runOne(changedMedia.jobId, (j) =>
      createProductionDraft(j, draft, render),
    );
    assert.equal(changedResult?.error, "ASSET_CHECKSUM_MISMATCH");
    assert.equal(
      (
        await db
          .select()
          .from(scriptRevisions)
          .where(eq(scriptRevisions.jobId, changedMedia.jobId))
      ).length,
      0,
    );
    const { POST, GET } = await import("../../app/api/automation/route");
    const rejected = await POST(
      new Request("http://localhost:3109/api/automation", {
        method: "POST",
        headers: {
          origin: "https://foreign.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "start", data: input }),
      }),
    );
    assert.equal(rejected.status, 403);
    const headers = {
      origin: "http://localhost:3109",
      host: "localhost:3109",
      "content-type": "application/json",
    };
    const accepted = await POST(
      new Request("http://localhost:3109/api/automation", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "start", data: input }),
      }),
    );
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).episodeId, run.episodeId);
    const malformed = await POST(
      new Request("http://localhost:3109/api/automation", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "start",
          data: { ...input, brief: "" },
        }),
      }),
    );
    assert.equal(malformed.status, 422);
    const beforeRead = (await db.select().from(jobs)).length;
    const read = await GET();
    assert.equal(read.status, 200);
    assert.equal((await db.select().from(jobs)).length, beforeRead);
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
    await rm(assetRoot, { recursive: true, force: true });
  }
});
