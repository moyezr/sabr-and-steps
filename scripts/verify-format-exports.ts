import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";

// Actual short renders, synthetic words/media/review. Never creator approval evidence.
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert(process.env.DATABASE_URL);
  const runId = randomUUID();
  const root = path.resolve(".data/evidence/format-exports", runId);
  process.env.APP_DATA_DIR = root;
  const exec = promisify(execFile);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `sabr_format_exports_${runId.replaceAll("-", "")}`;
  let pool: Pool | undefined;
  let server: ChildProcess | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    const { getDb, getPool } = await import("../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const { createEpisode } = await import("../lib/server/db/episodes");
    const { EMPTY_EPISODE } = await import("../lib/domain/episode");
    const { compositionSchema } = await import("../lib/domain/media");
    const { defaultEditorSettings } = await import(
      "../lib/domain/scene-settings"
    );
    const { EMPTY_REVIEW_CHECKLIST } = await import(
      "../lib/domain/export-review"
    );
    const { digest } = await import("../lib/server/hash");
    const {
      sourceImports,
      sourcePassages,
      scriptRevisions,
      compositions,
      episodeWorkspaceStates,
      videoExports,
      voiceTakes,
      captionTracks,
      jobs,
    } = await import("../lib/server/db/schema");
    const { importAsset, checkedAsset } = await import(
      "../lib/server/media/assets"
    );
    const { enqueueJob, findJob } = await import("../lib/server/jobs/store");
    const { runOne } = await import("../lib/server/jobs/run");
    const { renderVideo } = await import("../lib/server/media/render");
    const { validateCurrentComposition } = await import(
      "../lib/server/media/composition"
    );
    const { saveConsolidatedReview, consolidatedReviewState } = await import(
      "../lib/server/media/review"
    );
    const { dataPath } = await import("../lib/server/jobs/files");
    const { probeMedia } = await import("../lib/server/media/probe");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const imagePath = path.join(root, "synthetic-scene.png");
    await exec("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x180:rate=1",
      "-frames:v",
      "1",
      imagePath,
    ]);
    const importedImage = await importAsset(
      new Uint8Array(await readFile(imagePath)),
      {
        kind: "image",
        name: "Synthetic scene background",
        provenance:
          "Generated test pattern; original synthetic acceptance fixture.",
      },
    );
    const image = await checkedAsset(importedImage.id, "image");
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic format export acceptance",
      purpose: "audition",
    });
    const edition = (
      await db
        .insert(sourceImports)
        .values({
          environment: "prelive",
          resourceId: 85,
          name: "Synthetic export edition",
          author: "Fixture",
          status: "completed",
          expectedChapters: 1,
          expectedVerses: 1,
          completedChapters: [1],
          metadata: { synthetic: true },
          rightsNotes: "Synthetic fixture; no actual source rights clearance.",
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
          text: "Synthetic acceptance wording.",
          arabic: "اختبار",
          raw: {},
          checksum: "fixture",
        })
        .returning()
    )[0];
    const blocks = [
      {
        kind: "reflection" as const,
        text: "An original synthetic opening for safe rewrite acceptance.",
      },
      {
        kind: "quote" as const,
        text: passage.text,
        sourceId: passage.id,
        reference: passage.reference,
        importId: edition.id,
        edition: edition.name,
      },
      {
        kind: "reflection" as const,
        text: "An original synthetic closing with a gentle next step.",
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
    const editorSettings = {
      ...defaultEditorSettings(),
      openingSeconds: 0,
      closingSeconds: 0.2,
      sceneOverrides: [{ cueIndex: 0, imageId: image.id, imageDim: 0.45 }],
    };
    const data = compositionSchema.parse({
      version: 3,
      editorSettings,
      sceneImages: [
        {
          cueIndex: 0,
          image: {
            id: image.id,
            url: `/api/assets/${image.id}`,
            checksum: image.checksum,
            name: image.name,
            provenance: image.provenance,
            mime: image.mime,
            width: image.width,
            height: image.height,
          },
        },
      ],
      title: script.title,
      scriptChecksum: script.checksum,
      voiceChecksum: "",
      captionChecksum: "synthetic",
      duration: 1.2,
      fps: 30,
      cues: blocks.map((block, index) => ({
        start: index / 3,
        end: (index + 1) / 3,
        text: block.text,
        kind: block.kind,
        blockIndex: index,
        ...(block.kind === "quote"
          ? { reference: block.reference, edition: block.edition }
          : {}),
      })),
      audioUrl: "",
      background: "forest",
      ambience: "none",
      ambienceVolume: 0,
      narrationVolume: 0,
      mode: "text",
      draft: true,
      attribution: "Synthetic acceptance fixture",
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
    const next = (
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
    await db.insert(episodeWorkspaceStates).values({
      episodeId: episode.id,
      selectedScriptId: script.id,
      selectedCompositionId: c.id,
    });
    await validateCurrentComposition(c.id);
    const requests = await Promise.all(
      (["landscape", "vertical", "both"] as const).map((format) =>
        enqueueJob(
          "render",
          { compositionId: c.id, compositionChecksum: c.checksum, format },
          episode.id,
        ),
      ),
    );
    // Each queued render retains its immutable snapshot after the creator selects another preview.
    await db
      .update(episodeWorkspaceStates)
      .set({ selectedCompositionId: next.id })
      .where(eq(episodeWorkspaceStates.episodeId, episode.id));
    await assert.rejects(validateCurrentComposition(c.id), /COMPOSITION_STALE/);
    const outputs = [];
    for (let index = 0; index < requests.length; index++) {
      const job = requests[index];
      const format = ["landscape", "vertical", "both"][index];
      console.log(`Rendering synthetic ${format} snapshot.`);
      const result = await runOne(job.id, renderVideo);
      assert.equal(
        result?.status,
        "succeeded",
        result?.error || "Render failed",
      );
      const output = (
        await db
          .select()
          .from(videoExports)
          .where(eq(videoExports.jobId, job.id))
      )[0];
      assert.equal(Boolean(output.landscapePath), format !== "vertical");
      assert.equal(Boolean(output.verticalPath), format !== "landscape");
      for (const [orientation, relative] of [
        ["landscape", output.landscapePath],
        ["vertical", output.verticalPath],
      ] as const) {
        if (!relative) {
          await assert.rejects(
            access(dataPath(`exports/${c.id}/${job.id}/${orientation}.mp4`)),
          );
          continue;
        }
        const info = await probeMedia(dataPath(relative));
        const stream = info.streams.find(
          (entry) => entry.codec_type === "video",
        )!;
        assert.equal(stream.width, orientation === "landscape" ? 1920 : 1080);
        assert.equal(stream.height, orientation === "landscape" ? 1080 : 1920);
        assert(Math.abs(info.duration - data.duration) < 0.2);
        assert(!info.streams.some((entry) => entry.codec_type === "audio"));
        await exec("ffmpeg", [
          "-v",
          "error",
          "-i",
          dataPath(relative),
          "-f",
          "null",
          "-",
        ]);
      }
      assert(
        (await readFile(dataPath(output.descriptionPath), "utf8")).includes(
          "Scene 1 background: Synthetic scene background",
        ),
      );
      const completed = await findJob(job.id);
      assert(completed);
      assert.equal((await renderVideo(completed)).exportId, output.id);
      outputs.push(output);
    }
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
    const review = {
      compositionId: c.id,
      compositionChecksum: c.checksum,
      exportId: outputs[2].id,
      checklist,
      feedback:
        "Synthetic review fixture. No creator approval or listening evidence is claimed.",
      mediaRightsConfirmed: false,
      mediaRightsNotes: "",
    };
    await saveConsolidatedReview(episode.id, {
      ...review,
      decision: "needs_changes",
    });
    await saveConsolidatedReview(episode.id, {
      ...review,
      decision: "approved",
    });
    const reviewState = await consolidatedReviewState(episode.id, [c, next]);
    assert.equal(reviewState.reviews.length, 2);
    assert.equal(reviewState.eligibility[0].publicationReady, false);
    assert(
      reviewState.eligibility[0].blockers.some((blocker) =>
        blocker.includes(edition.name),
      ),
    );
    assert(
      reviewState.eligibility[0].blockers.some((blocker) =>
        blocker.includes("uploaded media"),
      ),
    );
    assert.equal(reviewState.eligibility[1].reviewId, null);
    assert.equal(
      (await pool.query("SELECT count(*)::int AS count FROM provider_usage"))
        .rows[0].count,
      0,
    );
    const report = {
      synthetic: true,
      actualRender: true,
      providerInference: false,
      creatorApproval: false,
      compositionChecksum: c.checksum,
      outputs,
      reviewState,
    };
    await writeFile(
      path.join(root, "verification.json"),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
    console.log(
      `All requested-only render, immutable snapshot, decoding, and synthetic review checks passed. Evidence: ${root}`,
    );
    if (!process.argv.includes("--serve")) return;
    // Browser controls use only this disposable DB and generated tone/test pattern.
    await db
      .update(episodeWorkspaceStates)
      .set({ selectedCompositionId: c.id })
      .where(eq(episodeWorkspaceStates.episodeId, episode.id));
    const tonePath = path.join(root, "synthetic-tone.mp3");
    await exec("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:a",
      "libmp3lame",
      tonePath,
    ]);
    const musicUpload = await importAsset(
      new Uint8Array(await readFile(tonePath)),
      {
        kind: "audio",
        name: "Synthetic tone track",
        provenance:
          "Generated sine tone; fixture audio, not narration or music acceptance.",
      },
    );
    const music = await checkedAsset(musicUpload.id, "audio");
    const narratedEpisode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic tone narration fixture",
      brief:
        "Synthetic tone only. No real speech or creator listening approval.",
      purpose: "audition",
    });
    const narratedScript = (
      await db
        .insert(scriptRevisions)
        .values({
          episodeId: narratedEpisode.id,
          episodeRevision: 1,
          importId: edition.id,
          indexId: null,
          model: "manual",
          title: narratedEpisode.title,
          blocks,
          retrieval: { sources: [] },
          checksum: digest(blocks),
        })
        .returning()
    )[0];
    const toneJob = await enqueueJob(
      "synthetic_tone_fixture",
      { fixture: runId },
      narratedEpisode.id,
    );
    await db
      .update(jobs)
      .set({
        status: "succeeded",
        progress: "Synthetic fixture; no speech was generated",
      })
      .where(eq(jobs.id, toneJob.id));
    const toneBytes = new Uint8Array(await readFile(tonePath));
    const take = (
      await db
        .insert(voiceTakes)
        .values({
          scriptId: narratedScript.id,
          jobId: toneJob.id,
          provider: "synthetic",
          model: "tone-only",
          voiceId: "synthetic",
          voiceName: "Synthetic tone (not speech)",
          settings: { speed: 1, stability: 0.65, similarity_boost: 0.75 },
          purpose: "audition",
          transcript: blocks.map((block) => block.text).join("\n\n"),
          audioPath: "synthetic-tone.mp3",
          duration: 2,
          checksum: (await import("node:crypto"))
            .createHash("sha256")
            .update(toneBytes)
            .digest("hex"),
          rights: { synthetic: true, commercial: false },
          alignment: { synthetic: true },
        })
        .returning()
    )[0];
    const toneCues = blocks.map((block, index) => ({
      start: index * 0.6,
      end: (index + 1) * 0.6,
      text: block.text,
      kind: block.kind,
      blockIndex: index,
      ...(block.kind === "quote"
        ? { reference: block.reference, edition: block.edition }
        : {}),
    }));
    const track = (
      await db
        .insert(captionTracks)
        .values({
          voiceTakeId: take.id,
          cues: toneCues,
          checksum: digest(toneCues),
        })
        .returning()
    )[0];
    const narratedData = compositionSchema.parse({
      ...data,
      title: narratedScript.title,
      duration: 2.6,
      audioUrl: `/api/media/${take.id}`,
      voiceChecksum: take.checksum,
      captionChecksum: track.checksum,
      cues: toneCues,
      mode: "narrated",
      narrationVolume: 0.5,
      music: {
        id: music.id,
        url: `/api/assets/${music.id}`,
        checksum: music.checksum,
        name: music.name,
        provenance: music.provenance,
        duration: music.duration,
      },
      musicVolume: 0.15,
      musicLoop: true,
    });
    const narratedComposition = (
      await db
        .insert(compositions)
        .values({
          episodeId: narratedEpisode.id,
          scriptId: narratedScript.id,
          voiceTakeId: take.id,
          captionTrackId: track.id,
          data: narratedData,
          checksum: digest(narratedData),
        })
        .returning()
    )[0];
    await db
      .insert(episodeWorkspaceStates)
      .values({
        episodeId: narratedEpisode.id,
        selectedScriptId: narratedScript.id,
        selectedVoiceTakeId: take.id,
        selectedCaptionTrackId: track.id,
        selectedCompositionId: narratedComposition.id,
      });
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
      `Text fixture: http://127.0.0.1:3109/episodes/${episode.id}/studio?section=exports`,
    );
    console.log(
      `Narrated tone fixture: http://127.0.0.1:3109/episodes/${narratedEpisode.id}/studio?section=voice`,
    );
    console.log(
      "Commands: report, render, complete-rewrite, complete-ideas, stop. No live inference is processed.",
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
              const { mediaState } = await import("../lib/server/media/state");
              const [textState, toneState, usage] = await Promise.all([
                mediaState(episode.id),
                mediaState(narratedEpisode.id),
                pool!.query(
                  "SELECT count(*)::int AS count FROM provider_usage",
                ),
              ]);
              const summarize = (state: typeof textState) => ({
                episode: state.episode,
                selectedScriptId: state.selectedScriptId,
                selectedVoiceTakeId: state.selectedVoiceTakeId,
                selectedCaptionTrackId: state.selectedCaptionTrackId,
                selectedCompositionId: state.selectedCompositionId,
                scripts: state.scripts.map((entry) => ({
                  id: entry.id,
                  title: entry.title,
                  blocks: entry.blocks,
                  reviewState: entry.reviewState,
                })),
                workingDraft: state.workingDraft,
                jobs: state.jobs,
                exports: state.exports,
                reviews: state.reviews,
                eligibility: state.eligibility,
              });
              console.log(
                JSON.stringify(
                  {
                    text: summarize(textState),
                    tone: summarize(toneState),
                    providerUsageCount: usage.rows[0].count,
                  },
                  null,
                  2,
                ),
              );
              assert.equal(usage.rows[0].count, 0);
            }
            if (
              ["render", "complete-rewrite", "complete-ideas"].includes(command)
            ) {
              const kind =
                command === "render"
                  ? "render"
                  : command === "complete-rewrite"
                    ? "script_rewrite"
                    : "idea_suggestion";
              const queued = await pool!.query<{ id: string }>(
                "SELECT id FROM jobs WHERE kind=$1 AND status='queued' ORDER BY created_at",
                [kind],
              );
              for (const pending of queued.rows) {
                const result = await runOne(pending.id, async (job) => {
                  if (kind === "render") return renderVideo(job);
                  if (kind === "script_rewrite") {
                    const { createScriptRewrites } = await import(
                      "../lib/server/writing/rewrites"
                    );
                    return createScriptRewrites(job, async () => ({
                      supported: true,
                      reason: "",
                      alternatives: [
                        {
                          text: "A synthetic gentler step is possible today.",
                          reason: "Synthetic gentler alternative.",
                        },
                        {
                          text: "Take one synthetic small step with patience.",
                          reason: "Synthetic shorter alternative.",
                        },
                        {
                          text: "Let this synthetic moment make room for hope.",
                          reason: "Synthetic hopeful alternative.",
                        },
                      ],
                    }));
                  }
                  const { createIdeaSuggestions } = await import(
                    "../lib/server/ideas/suggestions"
                  );
                  return createIdeaSuggestions(job, async () => ({
                    supported: true,
                    reason: "",
                    directions: [
                      {
                        angle: "Synthetic patience",
                        title: "A synthetic gentle step",
                        hook: "A synthetic uncertain day can still hold care.",
                        takeaway: "Choose one possible synthetic action.",
                      },
                      {
                        angle: "Synthetic support",
                        title: "Synthetic support in waiting",
                        hook: "A synthetic heavy moment can be shared.",
                        takeaway: "Name one synthetic form of support.",
                      },
                      {
                        angle: "Synthetic hope",
                        title: "Synthetic hope without a deadline",
                        hook: "A synthetic quiet hope can remain.",
                        takeaway: "Make room for a synthetic helpful routine.",
                      },
                    ],
                  }));
                });
                console.log(
                  `${kind} fixture job ${pending.id}: ${result?.status || "not claimable"}${result?.error ? ` ${result.error}` : ""}`,
                );
              }
              if (!queued.rows.length)
                console.log(`No queued ${kind} fixture jobs.`);
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
        const forceStop = setTimeout(() => server?.kill("SIGKILL"), 5000);
        server!.once("exit", () => {
          clearTimeout(forceStop);
          resolve();
        });
        server!.kill("SIGTERM");
      });
    }
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "FORMAT_EXPORT_VERIFICATION_FAILED",
  );
  process.exitCode = 1;
});
