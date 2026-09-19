import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
nextEnv.loadEnvConfig(process.cwd());
test("durable jobs claim once, recover safely, and script edits preserve canonical text and invalidate review", async () => {
  assert(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `sabr_writing_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool, getDb } = await import("../../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const { enqueueJob, claimJob, findJob } = await import(
      "../../lib/server/jobs/store"
    );
    const job = await enqueueJob("fixture", { test: 1 });
    assert.equal((await enqueueJob("fixture", { test: 1 })).id, job.id);
    const narrationRequest = {
      scriptId: randomUUID(),
      provider: "elevenlabs",
      voiceId: "fixture",
      settings: { speed: 1, stability: 0.65, similarity_boost: 0.75 },
      purpose: "audition",
      reviewMode: "consolidated",
      providerOverride: false,
    };
    const firstAlternative = await enqueueJob("narration", {
      ...narrationRequest,
      requestId: randomUUID(),
    });
    const secondAlternative = await enqueueJob("narration", {
      ...narrationRequest,
      requestId: randomUUID(),
    });
    assert.notEqual(firstAlternative.id, secondAlternative.id);
    const claims = await Promise.all([claimJob(job.id), claimJob(job.id)]);
    assert.equal(claims.filter(Boolean).length, 1);
    await pool.query(
      "UPDATE jobs SET lease_until=now()-interval '1 minute' WHERE id=$1",
      [job.id],
    );
    assert(await claimJob(job.id));
    await pool.query(
      "UPDATE jobs SET lease_until=now()-interval '1 minute',dispatched_at=now() WHERE id=$1",
      [job.id],
    );
    assert.equal(await claimJob(job.id), null);
    assert.equal((await findJob(job.id))?.status, "needs_attention");
    const { createEpisode } = await import("../../lib/server/db/episodes");
    const { EMPTY_EPISODE } = await import("../../lib/domain/episode");
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Writing fixture",
    });
    const {
      sourceImports,
      sourcePassages,
      embeddingIndexes,
      episodeWorkspaceStates,
      scriptRevisions,
    } = await import("../../lib/server/db/schema");
    const db = getDb();
    const selectionRevision = async () =>
      (
        await db
          .select({ revision: episodeWorkspaceStates.revision })
          .from(episodeWorkspaceStates)
      )[0].revision;
    const edition = (
      await db
        .insert(sourceImports)
        .values({
          environment: "prelive",
          resourceId: 85,
          name: "Fixture",
          author: "Fixture",
          status: "completed",
          expectedChapters: 1,
          expectedVerses: 1,
          completedChapters: [1],
          metadata: {},
          rightsNotes: "Synthetic fixture",
        })
        .returning()
    )[0];
    const source = (
      await db
        .insert(sourcePassages)
        .values({
          importId: edition.id,
          chapter: 1,
          verse: 1,
          reference: "1:1",
          chapterName: "Fixture",
          text: "Synthetic canonical fixture.",
          arabic: "اختبار",
          raw: {},
          checksum: "fixture",
        })
        .returning()
    )[0];
    const { EMBEDDING_CONFIG } = await import("../../lib/domain/script");
    const index = (
      await db
        .insert(embeddingIndexes)
        .values({
          importId: edition.id,
          configHash: "fixture",
          ...EMBEDDING_CONFIG,
          state: "ready",
        })
        .returning()
    )[0];
    const blocks = [
      {
        kind: "quote" as const,
        text: source.text,
        sourceId: source.id,
        reference: "1:1",
        edition: "Fixture",
        importId: edition.id,
      },
      { kind: "reflection" as const, text: "Synthetic reflection." },
    ];
    const script = (
      await db
        .insert(scriptRevisions)
        .values({
          episodeId: episode.id,
          episodeRevision: 1,
          importId: edition.id,
          indexId: index.id,
          model: episode.llmModel,
          title: "Fixture",
          blocks,
          retrieval: { sources: [] },
          checksum: "a".repeat(64),
        })
        .returning()
    )[0];
    const { reviewDraft, saveDraft, listDrafts } = await import(
      "../../lib/server/writing/drafts"
    );
    await reviewDraft(episode.id, script.id, script.checksum, "Fixture review");
    await assert.rejects(
      saveDraft(episode.id, {
        parentId: script.id,
        title: "Fixture",
        blocks: [{ ...blocks[0], text: "Altered canonical text" }, blocks[1]],
      }),
      /CANONICAL_QUOTATION_CHANGED/,
    );
    const saved = await saveDraft(episode.id, {
      parentId: script.id,
      title: "Edited fixture",
      blocks: [blocks[0], { kind: "reflection", text: "Edited reflection." }],
    });
    assert.equal(saved.reviewState, "unreviewed");
    assert.equal((await listDrafts(episode.id))[1].reviewState, "reviewed");
    await assert.rejects(
      saveDraft(episode.id, { parentId: script.id, title: "Stale", blocks }),
      /SCRIPT_REVISION_CONFLICT/,
    );
    const { voiceTakes, captionTracks } = await import(
      "../../lib/server/db/schema"
    );
    const {
      saveComposition: saveTextComposition,
      validateCurrentComposition: validateTextComposition,
    } = await import("../../lib/server/media/composition");
    const { compositionSchema } = await import("../../lib/domain/media");
    const silent = await saveTextComposition(episode.id, {
      selectionRevision: await selectionRevision(),
      scriptId: saved.id,
      mode: "text",
      background: "sand",
      narrationVolume: 0,
      readingWpm: 100,
    });
    assert.equal(silent.voiceTakeId, null);
    assert.equal(silent.captionTrackId, null);
    const silentData = compositionSchema.parse(silent.data);
    assert.equal(silentData.audioUrl, "");
    assert.equal(
      silentData.cues.map((c) => c.text).join(" "),
      "Synthetic canonical fixture. Edited reflection.",
    );
    await validateTextComposition(silent.id);
    const slower = await saveTextComposition(episode.id, {
      selectionRevision: await selectionRevision(),
      scriptId: saved.id,
      mode: "text",
      background: "sand",
      narrationVolume: 0,
      readingWpm: 70,
    });
    assert.notEqual(slower.id, silent.id);
    assert.notEqual(slower.checksum, silent.checksum);
    const { importAsset, checkedAsset } = await import(
      "../../lib/server/media/assets"
    );
    await assert.rejects(
      importAsset(new Uint8Array(Buffer.from("<svg>not an image</svg>")), {
        kind: "image",
        name: "Bad image",
        provenance: "Fixture",
      }),
    );
    const wav = Buffer.alloc(48044);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24000, 24);
    wav.writeUInt32LE(48000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(48000, 40);
    const asset = await importAsset(new Uint8Array(wav), {
      kind: "audio",
      name: "Synthetic silence",
      provenance: "Test fixture only",
    });
    await assert.rejects(
      checkedAsset(asset.id, "image"),
      /ASSET_KIND_MISMATCH/,
    );
    const withMusic = await saveTextComposition(episode.id, {
      selectionRevision: await selectionRevision(),
      scriptId: saved.id,
      mode: "text",
      background: "dusk",
      narrationVolume: 0,
      musicId: asset.id,
      musicVolume: 0.4,
      musicLoop: false,
      musicFade: 1,
    });
    assert.equal(
      compositionSchema.parse(withMusic.data).music?.name,
      "Synthetic silence",
    );
    await validateTextComposition(withMusic.id);
    // Text-only compositions remain valid when narration is later generated.
    const narrationJob = await enqueueJob(
      "fixture-audio",
      { scriptId: saved.id },
      episode.id,
    );
    const take = (
      await db
        .insert(voiceTakes)
        .values({
          scriptId: saved.id,
          jobId: narrationJob.id,
          provider: "fixture",
          model: "synthetic",
          voiceId: "fixture",
          voiceName: "Fixture",
          settings: {},
          purpose: "audition",
          transcript: "Edited reflection.",
          audioPath: "fixture-not-a-real-file",
          duration: 5,
          checksum: "fixture-audio",
          rights: {},
          alignment: {},
        })
        .returning()
    )[0];
    const track = (
      await db
        .insert(captionTracks)
        .values({
          voiceTakeId: take.id,
          cues: [
            {
              start: 0,
              end: 2,
              text: "Edited reflection.",
              kind: "reflection",
            },
          ],
          checksum: "fixture-caption",
        })
        .returning()
    )[0];
    const { saveCaptionTiming } = await import(
      "../../lib/server/media/narration"
    );
    const {
      selectCaptionTrack,
      selectComposition,
      selectFirstNarration,
      selectVoiceTake,
    } = await import("../../lib/server/media/selections");
    const { saveComposition, validateCurrentComposition } = await import(
      "../../lib/server/media/composition"
    );
    // A newly generated alternative does not replace an existing composition.
    await validateTextComposition(withMusic.id);
    await selectFirstNarration(episode.id, saved.id, take.id, track.id);
    let selectedMedia = (
      await db
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episode.id))
    )[0];
    assert.equal(selectedMedia.selectedVoiceTakeId, take.id);
    assert.equal(selectedMedia.selectedCaptionTrackId, track.id);
    await validateTextComposition(withMusic.id);
    const composition = await saveComposition(episode.id, {
      selectionRevision: await selectionRevision(),
      scriptId: saved.id,
      voiceTakeId: take.id,
      captionTrackId: track.id,
      background: "forest",
      narrationVolume: 1,
    });
    await validateCurrentComposition(composition.id);
    await assert.rejects(
      saveCaptionTiming(
        episode.id,
        take.id,
        track.id,
        await selectionRevision(),
        [{ start: 3, end: 8 }],
      ),
      /CAPTION_TIMING_INVALID/,
    );
    const revised = await saveCaptionTiming(
      episode.id,
      take.id,
      track.id,
      await selectionRevision(),
      [{ start: 0.1, end: 2.1 }],
    );
    assert.equal(
      (revised.cues as { text: string }[])[0].text,
      "Edited reflection.",
    );
    await assert.rejects(
      validateCurrentComposition(composition.id),
      /COMPOSITION_STALE/,
    );
    await assert.rejects(
      saveCaptionTiming(
        episode.id,
        take.id,
        track.id,
        await selectionRevision(),
        [{ start: 0, end: 2 }],
      ),
      /CAPTION_REVISION_CONFLICT/,
    );
    let fresh = await saveComposition(episode.id, {
      selectionRevision: await selectionRevision(),
      scriptId: saved.id,
      voiceTakeId: take.id,
      captionTrackId: revised.id,
      background: "dusk",
      narrationVolume: 0.9,
    });
    const newerJob = await enqueueJob(
      "fixture-new-take",
      { scriptId: saved.id },
      episode.id,
    );
    const newerTake = (
      await db
        .insert(voiceTakes)
        .values({
          ...take,
          id: randomUUID(),
          jobId: newerJob.id,
          checksum: "new-audio",
          createdAt: new Date(Date.now() + 1),
        })
        .returning()
    )[0];
    const newerTrack = (
      await db
        .insert(captionTracks)
        .values({
          voiceTakeId: newerTake.id,
          cues: revised.cues,
          checksum: "new-caption",
        })
        .returning()
    )[0];
    await selectFirstNarration(
      episode.id,
      saved.id,
      newerTake.id,
      newerTrack.id,
    );
    selectedMedia = (
      await db
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episode.id))
    )[0];
    assert.equal(selectedMedia.selectedVoiceTakeId, take.id);
    assert.equal(selectedMedia.selectedCaptionTrackId, revised.id);
    await validateCurrentComposition(fresh.id);
    await assert.rejects(
      saveComposition(episode.id, {
        selectionRevision: await selectionRevision(),
        scriptId: saved.id,
        voiceTakeId: newerTake.id,
        captionTrackId: newerTrack.id,
        background: "forest",
        narrationVolume: 1,
      }),
      /VOICE_REVISION_CHANGED/,
    );
    await selectVoiceTake(episode.id, {
      voiceTakeId: newerTake.id,
      selectionRevision: await selectionRevision(),
    });
    await selectCaptionTrack(episode.id, {
      captionTrackId: newerTrack.id,
      selectionRevision: await selectionRevision(),
    });
    await assert.rejects(
      validateCurrentComposition(fresh.id),
      /COMPOSITION_STALE/,
    );
    fresh = await saveComposition(episode.id, {
      selectionRevision: await selectionRevision(),
      scriptId: saved.id,
      voiceTakeId: newerTake.id,
      captionTrackId: newerTrack.id,
      background: "forest",
      narrationVolume: 1,
    });
    const mediaSelectionRevision = await selectionRevision();
    const competingPreviewSelections = await Promise.allSettled([
      selectComposition(episode.id, {
        compositionId: composition.id,
        selectionRevision: mediaSelectionRevision,
      }),
      selectComposition(episode.id, {
        compositionId: withMusic.id,
        selectionRevision: mediaSelectionRevision,
      }),
    ]);
    assert.equal(
      competingPreviewSelections.filter((result) => result.status === "fulfilled")
        .length,
      1,
    );
    assert.equal(
      competingPreviewSelections.filter((result) => result.status === "rejected")
        .length,
      1,
    );
    await selectComposition(episode.id, {
      compositionId: fresh.id,
      selectionRevision: await selectionRevision(),
    });
    await validateCurrentComposition(fresh.id);
    await assert.rejects(
      validateTextComposition(silent.id),
      /COMPOSITION_STALE/,
    );
    const finalScript = await saveDraft(episode.id, {
      parentId: saved.id,
      title: "Edited again",
      blocks,
    });
    await assert.rejects(
      validateCurrentComposition(fresh.id),
      /COMPOSITION_STALE/,
    );
    await assert.rejects(
      validateTextComposition(silent.id),
      /COMPOSITION_STALE/,
    );
    const {
      autosaveWorkingDraft,
      checkpointWorkingDraft,
      discardWorkingDraft,
      restoreScriptVersion,
      scriptVersionState,
      selectFirstScript,
      selectScriptVersion,
    } = await import("../../lib/server/writing/versions");
    await assert.rejects(
      autosaveWorkingDraft(episode.id, {
        baseScriptId: finalScript.id,
        revision: 0,
        title: "Unsafe draft",
        blocks: [{ ...blocks[0], text: "Changed quotation" }, blocks[1]],
      }),
      /CANONICAL_QUOTATION_CHANGED/,
    );
    let versionState = await scriptVersionState(episode.id);
    assert.equal(versionState.selectedScriptId, finalScript.id);
    assert.equal(versionState.workingDraft, null);
    const firstAutosave = await autosaveWorkingDraft(episode.id, {
      baseScriptId: finalScript.id,
      revision: 0,
      title: "Autosaved working title",
      blocks: [blocks[0], { kind: "reflection", text: "Autosaved words." }],
    });
    assert.equal(firstAutosave.revision, 1);
    const concurrent = await Promise.allSettled([
      autosaveWorkingDraft(episode.id, {
        baseScriptId: finalScript.id,
        revision: 1,
        title: "Concurrent A",
        blocks: [blocks[0], { kind: "reflection", text: "Concurrent A." }],
      }),
      autosaveWorkingDraft(episode.id, {
        baseScriptId: finalScript.id,
        revision: 1,
        title: "Concurrent B",
        blocks: [blocks[0], { kind: "reflection", text: "Concurrent B." }],
      }),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      concurrent.filter((result) => result.status === "rejected").length,
      1,
    );
    versionState = await scriptVersionState(episode.id);
    assert.equal(versionState.workingDraft?.revision, 2);
    assert.match(versionState.workingDraft?.title || "", /^Concurrent [AB]$/);
    await assert.rejects(
      selectScriptVersion(episode.id, {
        scriptId: saved.id,
        selectionRevision: versionState.selectionRevision,
      }),
      /SCRIPT_DRAFT_EXISTS/,
    );
    const checkpoint = await checkpointWorkingDraft(episode.id, {
      revision: versionState.workingDraft!.revision,
      selectionRevision: versionState.selectionRevision,
      label: "Creator checkpoint",
    });
    assert.equal(checkpoint.parentId, finalScript.id);
    assert.equal(checkpoint.label, "Creator checkpoint");
    assert.equal(checkpoint.changeKind, "checkpoint");
    versionState = await scriptVersionState(episode.id);
    assert.equal(versionState.selectedScriptId, checkpoint.id);
    assert.equal(versionState.workingDraft, null);
    await selectScriptVersion(episode.id, {
      scriptId: saved.id,
      selectionRevision: versionState.selectionRevision,
    });
    versionState = await scriptVersionState(episode.id);
    assert.equal(versionState.selectedScriptId, saved.id);
    await validateCurrentComposition(fresh.id);
    const restored = await restoreScriptVersion(episode.id, {
      scriptId: script.id,
      selectionRevision: versionState.selectionRevision,
      label: "Restore first version",
    });
    assert.notEqual(restored.id, script.id);
    assert.equal(restored.parentId, script.id);
    assert.equal(restored.changeKind, "restored");
    assert.equal(restored.model, script.model);
    assert.equal(restored.generationInstructions, script.generationInstructions);
    versionState = await scriptVersionState(episode.id);
    assert.equal(versionState.selectedScriptId, restored.id);
    const alternative = (
      await db
        .insert(scriptRevisions)
        .values({
          ...script,
          id: randomUUID(),
          parentId: null,
          jobId: null,
          title: "Generated alternative",
          label: "Generated alternative",
          checksum: "alternative",
          createdAt: new Date(Date.now() + 2),
        })
        .returning()
    )[0];
    await selectFirstScript(episode.id, alternative.id);
    assert.equal(
      (await scriptVersionState(episode.id)).selectedScriptId,
      restored.id,
    );
    const disposableDraft = await autosaveWorkingDraft(episode.id, {
      baseScriptId: restored.id,
      revision: 0,
      title: restored.title,
      blocks: restored.blocks,
    });
    await discardWorkingDraft(episode.id, {
      revision: disposableDraft.revision,
    });
    assert.equal((await scriptVersionState(episode.id)).workingDraft, null);
    // Provider fixtures are deterministic; no network or live-provider evidence.
    const { elevenSpeech } = await import(
      "../../lib/server/providers/elevenlabs"
    );
    const realFetch = globalThis.fetch,
      realKey = process.env.ELEVEN_LABS_API_KEY;
    let speechCalls = 0;
    let remaining = 0;
    process.env.ELEVEN_LABS_API_KEY = "synthetic-fixture-key";
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/voices"))
        return Response.json({
          voices: [
            { voice_id: "fixture", name: "Fixture", category: "premade" },
          ],
        });
      if (url.endsWith("/v1/user/subscription"))
        return Response.json({
          tier: "free",
          status: "free",
          character_count: 0,
          character_limit: remaining,
          can_extend_character_limit: false,
        });
      speechCalls++;
      throw new Error("Unexpected dispatch");
    };
    try {
      const candidate = await enqueueJob(
        "fixture-guard",
        { fixture: true },
        episode.id,
      );
      const claimed = await claimJob(candidate.id);
      assert(claimed);
      const settings = { speed: 1, stability: 0.65, similarity_boost: 0.75 };
      await assert.rejects(
        elevenSpeech(claimed, "Test text", "fixture", settings, "audition"),
        /CREDITS_INSUFFICIENT/,
      );
      remaining = 1000;
      await assert.rejects(
        elevenSpeech(claimed, "Test text", "fixture", settings, "publish"),
        /RIGHTS_NOT_CLEARED/,
      );
      const { providerUsage } = await import("../../lib/server/db/schema");
      await db.insert(providerUsage).values({
        jobId: narrationJob.id,
        operation: "other-reservation",
        provider: "elevenlabs",
        model: "fixture",
        unit: "characters",
        estimated: 950,
        state: "reserved",
        details: {},
      });
      await assert.rejects(
        elevenSpeech(claimed, "Test text", "fixture", settings, "audition"),
        /CREDITS_INSUFFICIENT/,
      );
      assert.equal(speechCalls, 0);
    } finally {
      globalThis.fetch = realFetch;
      if (realKey === undefined) delete process.env.ELEVEN_LABS_API_KEY;
      else process.env.ELEVEN_LABS_API_KEY = realKey;
    }
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
