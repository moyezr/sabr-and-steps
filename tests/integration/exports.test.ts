import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";

nextEnv.loadEnvConfig(process.cwd());
test("consolidated review is explicit, exact-revision, retained, and independent of persisted rights", async () => {
  assert(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `sabr_exports_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    const { getDb, getPool } = await import("../../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const { createEpisode } = await import("../../lib/server/db/episodes");
    const { EMPTY_EPISODE } = await import("../../lib/domain/episode");
    const { EMPTY_REVIEW_CHECKLIST } = await import(
      "../../lib/domain/export-review"
    );
    const { compositionSchema } = await import("../../lib/domain/media");
    const { digest } = await import("../../lib/server/hash");
    const {
      sourceImports,
      sourcePassages,
      scriptRevisions,
      compositions,
      jobs,
      videoExports,
      compositionReviews,
    } = await import("../../lib/server/db/schema");
    const { saveConsolidatedReview, consolidatedReviewState } = await import(
      "../../lib/server/media/review"
    );
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic export review",
    });
    const edition = (
      await db
        .insert(sourceImports)
        .values({
          environment: "prelive",
          resourceId: 85,
          name: "Synthetic review edition",
          author: "Fixture",
          status: "completed",
          expectedChapters: 1,
          expectedVerses: 1,
          completedChapters: [1],
          metadata: { synthetic: true },
          rightsNotes: "Synthetic boundary fixture, not publication evidence.",
        })
        .returning()
    )[0];
    const passage = (
      await db
        .insert(sourcePassages)
        .values({
          importId: edition.id,
          chapter: 1,
          verse: 1,
          reference: "1:1",
          chapterName: "Synthetic",
          text: "Synthetic review wording. Not scripture.",
          arabic: "اختبار",
          raw: {},
          checksum: "fixture",
        })
        .returning()
    )[0];
    const blocks = [
      {
        kind: "quote" as const,
        text: passage.text,
        sourceId: passage.id,
        reference: passage.reference,
        importId: edition.id,
        edition: edition.name,
      },
    ];
    const script = (
      await db
        .insert(scriptRevisions)
        .values({
          episodeId: episode.id,
          episodeRevision: 1,
          importId: edition.id,
          indexId: null,
          model: "manual",
          title: episode.title,
          blocks,
          retrieval: { sources: [] },
          checksum: digest(blocks),
        })
        .returning()
    )[0];
    const data = compositionSchema.parse({
      version: 2,
      title: script.title,
      scriptChecksum: script.checksum,
      voiceChecksum: "",
      captionChecksum: "synthetic",
      duration: 2.5,
      fps: 30,
      cues: [
        {
          start: 0,
          end: 2,
          text: passage.text,
          kind: "quote",
          reference: passage.reference,
          edition: edition.name,
        },
      ],
      audioUrl: "",
      background: "forest",
      ambience: "none",
      ambienceVolume: 0,
      narrationVolume: 0,
      mode: "text",
      draft: true,
      attribution: "Synthetic",
    });
    const c = (
      await db
        .insert(compositions)
        .values({
          episodeId: episode.id,
          scriptId: script.id,
          data,
          checksum: digest(data),
        })
        .returning()
    )[0];
    const job = (
      await db
        .insert(jobs)
        .values({
          episodeId: episode.id,
          kind: "synthetic_export",
          key: randomUUID(),
          input: {},
          status: "succeeded",
        })
        .returning()
    )[0];
    // Metadata-only persistence fixture. These paths are not rendered-video evidence.
    const output = (
      await db
        .insert(videoExports)
        .values({
          compositionId: c.id,
          jobId: job.id,
          landscapePath: "synthetic/landscape.mp4",
          verticalPath: "",
          srtPath: "synthetic/captions.srt",
          descriptionPath: "synthetic/description.txt",
          metadata: { compositionChecksum: c.checksum, synthetic: true },
        })
        .returning()
    )[0];
    const checklist = {
      ...EMPTY_REVIEW_CHECKLIST,
      sourceContext: true,
      wording: true,
      captions: true,
      visuals: true,
      audio: true,
      completePlayback: true,
      attribution: true,
    };
    const input = {
      compositionId: c.id,
      compositionChecksum: c.checksum,
      exportId: output.id,
      decision: "approved" as const,
      checklist,
      feedback: "Synthetic creator review declaration",
      mediaRightsConfirmed: false,
      mediaRightsNotes: "",
    };
    await assert.rejects(
      saveConsolidatedReview(episode.id, {
        ...input,
        compositionChecksum: "0".repeat(64),
      }),
      /COMPOSITION_REVIEW_CONFLICT/,
    );
    await assert.rejects(
      saveConsolidatedReview(episode.id, { ...input, exportId: randomUUID() }),
      /REVIEW_EXPORT_REQUIRED/,
    );
    await assert.rejects(
      saveConsolidatedReview(episode.id, {
        ...input,
        checklist: EMPTY_REVIEW_CHECKLIST,
      }),
      /REVIEW_CHECKLIST_INCOMPLETE/,
    );
    const first = await saveConsolidatedReview(episode.id, input);
    assert.equal(first.compositionChecksum, c.checksum);
    const reviewed = await consolidatedReviewState(episode.id, [c]);
    assert.equal(reviewed.reviews.length, 1);
    assert.equal(reviewed.eligibility[0].publicationReady, false);
    assert(
      reviewed.eligibility[0].blockers.some((blocker) =>
        blocker.includes(edition.name),
      ),
    );
    assert.equal(
      (
        await db
          .select()
          .from(sourceImports)
          .where(eq(sourceImports.id, edition.id))
      )[0].rightsStatus,
      "not_cleared",
    );
    assert.equal(
      (
        await db
          .select()
          .from(scriptRevisions)
          .where(eq(scriptRevisions.id, script.id))
      )[0].reviewState,
      "unreviewed",
    );
    // Only the test changes persisted fixture rights, proving a checkbox cannot clear them.
    await db
      .update(sourceImports)
      .set({ rightsStatus: "cleared" })
      .where(eq(sourceImports.id, edition.id));
    assert.equal(
      (await consolidatedReviewState(episode.id, [c])).eligibility[0]
        .publicationReady,
      true,
    );
    // Reviewing one rendered format never approves another export of the same composition.
    const verticalJob = (
      await db
        .insert(jobs)
        .values({
          episodeId: episode.id,
          kind: "synthetic_export",
          key: randomUUID(),
          input: {},
          status: "succeeded",
        })
        .returning()
    )[0];
    const verticalOutput = (
      await db
        .insert(videoExports)
        .values({
          compositionId: c.id,
          jobId: verticalJob.id,
          landscapePath: "",
          verticalPath: "synthetic/vertical.mp4",
          srtPath: "synthetic/captions.srt",
          descriptionPath: "synthetic/description.txt",
          metadata: { compositionChecksum: c.checksum, synthetic: true },
        })
        .returning()
    )[0];
    const byExport = await consolidatedReviewState(episode.id, [c]);
    assert.equal(
      byExport.eligibility.find((e) => e.exportId === output.id)
        ?.publicationReady,
      true,
    );
    assert.equal(
      byExport.eligibility.find((e) => e.exportId === verticalOutput.id)
        ?.publicationReady,
      false,
    );
    assert(
      byExport.eligibility
        .find((e) => e.exportId === verticalOutput.id)
        ?.blockers.some((b) => b.includes("exact rendered revision")),
    );
    const { enqueueJob, claimJob } = await import(
      "../../lib/server/jobs/store"
    );
    const { persistRenderedExport } = await import(
      "../../lib/server/media/render"
    );
    const renderJob = await enqueueJob(
      "render",
      { compositionId: c.id, requestId: randomUUID() },
      episode.id,
    );
    const claimed = await claimJob(renderJob.id);
    assert(claimed);
    const values = {
      compositionId: c.id,
      jobId: renderJob.id,
      landscapePath: "synthetic/owned.mp4",
      verticalPath: "",
      srtPath: "synthetic/captions.srt",
      descriptionPath: "synthetic/description.txt",
      metadata: { compositionChecksum: c.checksum, synthetic: true },
    };
    await assert.rejects(
      persistRenderedExport({ ...claimed, owner: randomUUID() }, values),
      /JOB_LEASE_LOST/,
    );
    await pool.query(
      "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [renderJob.id],
    );
    await assert.rejects(
      persistRenderedExport(claimed, values),
      /JOB_LEASE_LOST/,
    );
    const missing = await db
      .select()
      .from(videoExports)
      .where(eq(videoExports.jobId, renderJob.id));
    assert.equal(missing.length, 0);
    await pool.query(
      "UPDATE jobs SET lease_until=now()+interval '1 minute' WHERE id=$1",
      [renderJob.id],
    );
    const owned = await persistRenderedExport(claimed, values);
    assert.equal(owned.jobId, renderJob.id);
    assert.equal((await persistRenderedExport(claimed, values)).id, owned.id);
    const newer = (
      await db
        .insert(compositions)
        .values({
          episodeId: episode.id,
          scriptId: script.id,
          data: { ...data, background: "dusk" },
          checksum: digest({ ...data, background: "dusk" }),
        })
        .returning()
    )[0];
    const revised = await consolidatedReviewState(episode.id, [newer, c]);
    assert.equal(revised.eligibility[0].publicationReady, false);
    assert.equal(revised.eligibility[0].reviewId, null);
    assert.equal(
      revised.eligibility.find((entry) => entry.exportId === output.id)
        ?.publicationReady,
      true,
    );
    const changes = await saveConsolidatedReview(episode.id, {
      ...input,
      decision: "needs_changes",
      checklist: EMPTY_REVIEW_CHECKLIST,
      feedback: "Synthetic request to change captions",
    });
    assert.notEqual(changes.id, first.id);
    assert.equal(
      (await consolidatedReviewState(episode.id, [c])).eligibility.find(
        (entry) => entry.exportId === output.id,
      )?.publicationReady,
      false,
    );
    assert.equal((await db.select().from(compositionReviews)).length, 2);
    assert.equal(
      (await db.select().from(videoExports))[0].landscapePath,
      output.landscapePath,
    );
    // JSON escape expansion can exceed the generic 24k limit while retaining
    // schema-valid review feedback. The media boundary has its own bounded limit.
    const { POST: mediaPost } = await import(
      "../../app/api/episodes/[id]/media/route"
    );
    const { readJson } = await import("../../lib/server/http");
    const feedback = `x${"\u0001".repeat(5998)}x`;
    const fullBody = JSON.stringify({
      action: "consolidatedReview",
      data: { ...input, decision: "needs_changes", feedback },
    });
    assert(fullBody.length > 24_000);
    const request = (body: string) =>
      new Request(`http://localhost:3109/api/episodes/${episode.id}/media`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3109",
          host: "localhost:3109",
        },
        body,
      });
    await assert.rejects(readJson(request(fullBody)), /INVALID_BODY/);
    const accepted = await mediaPost(request(fullBody), {
      params: Promise.resolve({ id: episode.id }),
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).reviews[0].feedback, feedback);
    const oversized = JSON.stringify({
      action: "consolidatedReview",
      data: { privateMarker: "private-fixture".repeat(300_000) },
    });
    assert(oversized.length > 4_000_000);
    for (const body of [oversized, '{"private-fixture"']) {
      const rejected = await mediaPost(request(body), {
        params: Promise.resolve({ id: episode.id }),
      });
      assert.equal(rejected.status, 422);
      assert.deepEqual(await rejected.json(), { error: "INVALID_BODY" });
    }
    assert.equal((await db.select().from(compositionReviews)).length, 3);
    assert.equal(
      (await pool.query("SELECT count(*)::int AS count FROM provider_usage"))
        .rows[0].count,
      0,
    );
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
