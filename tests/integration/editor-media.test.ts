import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import {
  defaultEditorSettings,
  splitCue,
} from "../../lib/domain/scene-settings";
nextEnv.loadEnvConfig(process.cwd());

test("v3 settings persist, preference changes preserve narration, and caption restructure stays canonical", async () => {
  const original = process.env.DATABASE_URL!;
  const admin = new Pool({ connectionString: original });
  const name = `sabr_editor_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(original);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool, getDb } = await import("../../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const schema = await import("../../lib/server/db/schema");
    const { createEpisode, updateEpisode } = await import(
      "../../lib/server/db/episodes"
    );
    const { EMPTY_EPISODE } = await import("../../lib/domain/episode");
    const { selectFirstScript } = await import(
      "../../lib/server/writing/versions"
    );
    const { selectFirstNarration } = await import(
      "../../lib/server/media/selections"
    );
    const { saveComposition, validateCurrentComposition } = await import(
      "../../lib/server/media/composition"
    );
    const { saveCaptionTiming } = await import(
      "../../lib/server/media/narration"
    );
    const { enqueueJob } = await import("../../lib/server/jobs/store");
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic editor fixture",
    });
    const edition = (
      await db
        .insert(schema.sourceImports)
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
          rightsNotes: "Synthetic only",
        })
        .returning()
    )[0];
    const script = (
      await db
        .insert(schema.scriptRevisions)
        .values({
          episodeId: episode.id,
          episodeRevision: episode.revision,
          importId: edition.id,
          model: "manual",
          title: episode.title,
          blocks: [{ kind: "reflection", text: "Take one small step today." }],
          retrieval: { sources: [] },
          checksum: "fixture",
        })
        .returning()
    )[0];
    await selectFirstScript(episode.id, script.id);
    const job = await enqueueJob(
      "fixture",
      { nonce: randomUUID() },
      episode.id,
    );
    const take = (
      await db
        .insert(schema.voiceTakes)
        .values({
          scriptId: script.id,
          jobId: job.id,
          provider: "fixture",
          model: "fixture",
          voiceId: "fixture",
          voiceName: "Synthetic",
          settings: {},
          purpose: "audition",
          transcript: "Take one small step today.",
          audioPath: "fixture/not-real.mp3",
          duration: 5,
          checksum: "voice",
          rights: {},
          alignment: {},
        })
        .returning()
    )[0];
    const cue = {
      start: 0.1,
      end: 4.5,
      text: "Take one small step today.",
      kind: "reflection" as const,
      blockIndex: 0,
    };
    const track = (
      await db
        .insert(schema.captionTracks)
        .values({ voiceTakeId: take.id, cues: [cue], checksum: "caption" })
        .returning()
    )[0];
    await selectFirstNarration(episode.id, script.id, take.id, track.id);
    const selection = async () =>
      (
        await db
          .select()
          .from(schema.episodeWorkspaceStates)
          .where(eq(schema.episodeWorkspaceStates.episodeId, episode.id))
      )[0].revision;
    const settings = {
      ...defaultEditorSettings(),
      openingSeconds: 1,
      closingSeconds: 2,
      visual: { ...defaultEditorSettings().visual, font: "sans" as const },
      sceneOverrides: [
        {
          cueIndex: 0,
          framing: {
            landscape: { x: 20, y: 30, zoom: 1.2 },
            vertical: { x: 75, y: 50, zoom: 1.5 },
          },
        },
      ],
    };
    const input = {
      selectionRevision: await selection(),
      scriptId: script.id,
      voiceTakeId: take.id,
      captionTrackId: track.id,
      background: "forest",
      narrationVolume: 1,
      mode: "narrated",
      editorSettings: settings,
    };
    const composition = await saveComposition(episode.id, input);
    const { compositionSchema } = await import("../../lib/domain/media");
    const saved = compositionSchema.parse(composition.data);
    assert.equal(saved.version, 3);
    assert.equal(saved.audioOffset, 1);
    assert.equal(saved.cues[0].start, 1.1);
    assert.equal(saved.duration, 8);
    assert.equal(saved.editorSettings?.framing.vertical.zoom, 1);
    assert.deepEqual(
      saved.editorSettings?.sceneOverrides[0].framing,
      settings.sceneOverrides[0].framing,
    );
    const preferred = await updateEpisode(
      episode.id,
      {
        ...EMPTY_EPISODE,
        title: episode.title,
        llmModel: "google/gemini-3.8-flash",
        format: "vertical",
      },
      episode.revision,
    );
    assert.equal(preferred!.revision, 2);
    assert.equal(preferred!.contentRevision, 1);
    await validateCurrentComposition(composition.id);
    const split = splitCue([cue], 0, 2);
    const next = await saveCaptionTiming(
      episode.id,
      take.id,
      track.id,
      await selection(),
      [],
      split,
    );
    assert.equal((next.cues as unknown[]).length, 2);
    await assert.rejects(
      validateCurrentComposition(composition.id),
      /COMPOSITION_STALE/,
    );
    await assert.rejects(
      saveCaptionTiming(
        episode.id,
        take.id,
        next.id,
        await selection(),
        [],
        [{ ...cue, text: "Words changed." }],
      ),
      /CAPTION_WORDS_CHANGED/,
    );
    const text = await saveComposition(episode.id, {
      ...input,
      selectionRevision: await selection(),
      mode: "text",
      voiceTakeId: null,
      captionTrackId: null,
      editorSettings: { ...settings, cardDurations: [7] },
    });
    const textData = compositionSchema.parse(text.data);
    assert.equal(textData.cues[0].end, 8);
    assert.equal(textData.duration, 10);
    await assert.rejects(
      saveComposition(episode.id, {
        ...input,
        selectionRevision: await selection(),
        mode: "text",
        editorSettings: { ...settings, sceneOverrides: [{ cueIndex: 99 }] },
      }),
      /SCENES_CHANGED/,
    );
    const changed = await updateEpisode(
      episode.id,
      { ...EMPTY_EPISODE, title: episode.title, brief: "Changed actual idea" },
      preferred!.revision,
    );
    assert.equal(changed!.contentRevision, 3);
    await assert.rejects(
      validateCurrentComposition(text.id),
      /COMPOSITION_STALE/,
    );
  } finally {
    if (pool) await pool.end();
    process.env.DATABASE_URL = original;
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
