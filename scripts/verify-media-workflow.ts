import nextEnv from "@next/env";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { spawn, execFile } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  await readFile(".data/render-fixture/fixture.mp3").catch(() => {
    throw new Error("Run pnpm exec tsx scripts/render-fixture.ts first");
  });
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = "sabr_media_" + randomUUID().replaceAll("-", "");
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/" + name;
  process.env.DATABASE_URL = url.toString();
  const { getPool, getDb } = await import("../lib/server/db/client");
  const pool = getPool();
  try {
    const db = getDb();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const {
      episodes,
      sourceImports,
      sourcePassages,
      embeddingIndexes,
      scriptRevisions,
      voiceTakes,
      captionTracks,
    } = await import("../lib/server/db/schema");
    const { EMPTY_EPISODE } = await import("../lib/domain/episode");
    const { enqueueJob } = await import("../lib/server/jobs/store");
    const { saveComposition } = await import("../lib/server/media/composition");
    const { selectFirstNarration } = await import(
      "../lib/server/media/selections"
    );
    const { scriptVersionState, selectFirstScript } = await import(
      "../lib/server/writing/versions"
    );
    const { runOne } = await import("../lib/server/jobs/run");
    const episode = (
      await db
        .insert(episodes)
        .values({ ...EMPTY_EPISODE, title: "Synthetic media workflow fixture" })
        .returning()
    )[0];
    const edition = (
      await db
        .insert(sourceImports)
        .values({
          environment: "prelive",
          resourceId: 85,
          name: "Synthetic fixture",
          author: "Fixture",
          status: "completed",
          expectedChapters: 1,
          expectedVerses: 1,
          completedChapters: [1],
          metadata: {},
          rightsNotes: "Not a source",
        })
        .returning()
    )[0];
    const index = (
      await db
        .insert(embeddingIndexes)
        .values({
          importId: edition.id,
          configHash: "fixture",
          model: "fixture",
          dimensions: 1536,
          preprocessing: "fixture",
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
          chapterName: "Fixture",
          text: "Synthetic source text.",
          arabic: "اختبار",
          raw: {},
          checksum: "fixture",
        })
        .returning()
    )[0];
    const script = (
      await db
        .insert(scriptRevisions)
        .values({
          episodeId: episode.id,
          episodeRevision: episode.revision,
          importId: edition.id,
          indexId: index.id,
          model: episode.llmModel,
          title: "Synthetic media workflow fixture",
          blocks: [
            { kind: "reflection", text: "A small step toward a calmer day." },
            {
              kind: "quote",
              text: passage.text,
              reference: "1:1",
              sourceId: passage.id,
              importId: edition.id,
              edition: "Synthetic fixture — not a source",
            },
          ],
          retrieval: { sources: [] },
          checksum: "fixture",
        })
        .returning()
    )[0];
    await selectFirstScript(episode.id, script.id);
    const job = await enqueueJob(
      "fixture",
      { scriptId: script.id },
      episode.id,
    );
    const audio = await readFile(".data/render-fixture/fixture.mp3");
    const checksum = createHash("sha256")
      .update(new Uint8Array(audio))
      .digest("hex");
    const { probeMedia } = await import("../lib/server/media/probe");
    const info = await probeMedia(".data/render-fixture/fixture.mp3");
    const take = (
      await db
        .insert(voiceTakes)
        .values({
          scriptId: script.id,
          jobId: job.id,
          provider: "fixture",
          model: "tone-only",
          voiceId: "fixture",
          voiceName: "Tone fixture",
          settings: {},
          purpose: "audition",
          transcript: "A small step toward a calmer day.",
          audioPath: "render-fixture/fixture.mp3",
          duration: info.duration,
          checksum,
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
            { start: 0, end: 2.4, text: "A small step", kind: "reflection" },
            {
              start: 2.4,
              end: 5,
              text: "Synthetic source text.",
              kind: "quote",
              reference: "1:1",
              edition: "Synthetic fixture — not a source",
            },
          ],
          checksum: "fixture",
        })
        .returning()
    )[0];
    await selectFirstNarration(episode.id, script.id, take.id, track.id);
    const composition = await saveComposition(episode.id, {
      selectionRevision: (await scriptVersionState(episode.id))
        .selectionRevision,
      scriptId: script.id,
      voiceTakeId: take.id,
      captionTrackId: track.id,
      background: "forest",
      narrationVolume: 0.8,
    });
    const render = await enqueueJob(
      "render",
      { compositionId: composition.id },
      episode.id,
    );
    console.log("Render fixture job", render.id);
    const { handleJob } = await import("../lib/server/jobs/run");
    const result = await runOne(render.id, async (j) => {
      try {
        return await handleJob(j);
      } catch (e) {
        console.error(e);
        throw e;
      }
    });
    console.log(
      JSON.stringify({
        status: result?.status,
        error: result?.error,
        result: result?.result,
      }),
    );
    await writeFile(
      ".data/render-fixture/workflow-ids.json",
      JSON.stringify({
        episodeId: episode.id,
        takeId: take.id,
        captionId: track.id,
        compositionId: composition.id,
        jobId: render.id,
        result: result?.result,
      }),
      { mode: 0o600 },
    );
    if (result?.status !== "succeeded")
      throw new Error("MEDIA_WORKFLOW_FIXTURE_FAILED");
    if (process.argv.includes("--variants")) {
      const exec = promisify(execFile);
      const { importAsset } = await import("../lib/server/media/assets");
      const { videoExports } = await import("../lib/server/db/schema");
      const { eq } = await import("drizzle-orm");
      const { dataPath } = await import("../lib/server/jobs/files");
      await exec("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=4:duration=2",
        ".data/render-fixture/background.gif",
      ]);
      const gif = await importAsset(
        new Uint8Array(await readFile(".data/render-fixture/background.gif")),
        {
          kind: "image",
          name: "Animated test pattern",
          provenance: "Synthetic GIF fixture",
        },
      );
      const music = await importAsset(new Uint8Array(audio), {
        kind: "audio",
        name: "Synthetic tone",
        provenance: "Test fixture, not a music recommendation",
      });
      const variants = [];
      for (const mode of ["text", "narrated", "silent"] as const) {
        const variant = await saveComposition(episode.id, {
          selectionRevision: (await scriptVersionState(episode.id))
            .selectionRevision,
          scriptId: script.id,
          voiceTakeId: mode === "narrated" ? take.id : null,
          captionTrackId: mode === "narrated" ? track.id : null,
          mode: mode === "silent" ? "text" : mode,
          background: "forest",
          imageId: gif.id,
          imagePosition: 65,
          narrationVolume: 1,
          musicId: mode === "silent" ? null : music.id,
          musicVolume: 0.3,
          musicFade: 1,
          musicLoop: true,
        });
        const queued = await enqueueJob(
          "render",
          { compositionId: variant.id },
          episode.id,
        );
        const completed = await runOne(queued.id, handleJob);
        assert.equal(
          completed?.status,
          "succeeded",
          `${mode}: ${completed?.error}`,
        );
        const output = (
          await db
            .select()
            .from(videoExports)
            .where(eq(videoExports.jobId, queued.id))
        )[0];
        for (const relative of [output.landscapePath, output.verticalPath]) {
          const probe = await probeMedia(dataPath(relative));
          assert.equal(
            probe.streams.some((s) => s.codec_type === "audio"),
            mode !== "silent",
          );
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
        const description = await readFile(
          dataPath(output.descriptionPath),
          "utf8",
        );
        assert(description.includes("Synthetic GIF fixture"));
        assert(
          description.includes(
            mode === "narrated" ? "AI narration:" : "No AI narration.",
          ),
        );
        variants.push({ mode, compositionId: variant.id, output });
        console.log("Verified GIF", mode, output.id);
      }
      await writeFile(
        ".data/render-fixture/variants.json",
        JSON.stringify(variants, null, 2),
      );
    }
    if (process.argv.includes("--serve")) {
      const server = spawn(
        "pnpm",
        ["start", "--hostname", "127.0.0.1", "--port", "3109"],
        { env: process.env, stdio: "inherit" },
      );
      console.log(
        `Synthetic browser fixture at http://127.0.0.1:3109/episodes/${episode.id}/studio`,
      );
      await new Promise<void>((resolve, reject) => {
        const stop = () => {
          server.kill("SIGTERM");
          resolve();
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        server.once("error", reject);
        server.once("exit", () => {
          process.off("SIGINT", stop);
          process.off("SIGTERM", stop);
          resolve();
        });
      });
    }
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
}

void main().catch(() => {
  console.error("MEDIA_WORKFLOW_FIXTURE_FAILED");
  process.exitCode = 1;
});
