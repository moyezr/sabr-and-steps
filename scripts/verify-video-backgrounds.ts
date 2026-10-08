import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";

// Real local upload/render pipeline; synthetic clips and words, no inference or publication.
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert(process.env.DATABASE_URL);
  const runId = randomUUID();
  const root = path.resolve(".data/evidence/video-backgrounds", runId);
  process.env.APP_DATA_DIR = root;
  const exec = promisify(execFile);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `sabr_video_${runId.replaceAll("-", "")}`;
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
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const schema = await import("../lib/server/db/schema");
    const { importAsset, checkedAsset, MAX_ASSET_BYTES } = await import(
      "../lib/server/media/assets"
    );
    const { saveComposition } = await import("../lib/server/media/composition");
    const { createEpisode } = await import("../lib/server/db/episodes");
    const { EMPTY_EPISODE } = await import("../lib/domain/episode");
    const { defaultEditorSettings } = await import(
      "../lib/domain/scene-settings"
    );
    const { compositionSchema } = await import("../lib/domain/media");
    const { selectFirstScript } = await import(
      "../lib/server/writing/versions"
    );
    const { enqueueJob } = await import("../lib/server/jobs/store");
    const { runOne } = await import("../lib/server/jobs/run");
    const { renderVideo } = await import("../lib/server/media/render");
    const { serveAsset } = await import("../lib/server/media/serve");
    const { dataPath } = await import("../lib/server/jobs/files");
    const { digest } = await import("../lib/server/hash");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const clip = path.join(root, "synthetic-motion.mp4");
    const second = path.join(root, "synthetic-scene.mp4");
    const png = path.join(root, "synthetic-still.png");
    await exec("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30:duration=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      clip,
    ]);
    await exec("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30:duration=1",
      "-vf",
      "hflip",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      second,
    ]);
    await exec("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=navy:size=320x180",
      "-frames:v",
      "1",
      png,
    ]);
    const meta = {
      kind: "video",
      name: "Original synthetic motion",
      provenance:
        "Original FFmpeg test pattern; synthetic acceptance, no religious source or stock rights claimed.",
    };
    const imported = await importAsset(
      new Uint8Array(await readFile(clip)),
      meta,
    );
    const sceneClip = await importAsset(
      new Uint8Array(await readFile(second)),
      { ...meta, name: "Original synthetic scene clip" },
    );
    const still = await importAsset(new Uint8Array(await readFile(png)), {
      ...meta,
      kind: "image",
      name: "Legacy still fixture",
    });
    const asset = await checkedAsset(imported.id, "video");
    assert.equal(asset.mime, "video/mp4");
    assert.equal(asset.duration, 1);
    await checkedAsset(imported.id, "background");
    await assert.rejects(
      checkedAsset(imported.id, "image"),
      /ASSET_KIND_MISMATCH/,
    );
    await assert.rejects(
      importAsset(new Uint8Array(await readFile(png)), meta),
    );
    await assert.rejects(importAsset(new Uint8Array([1, 2, 3]), meta));
    await assert.rejects(
      importAsset(new Uint8Array(MAX_ASSET_BYTES + 1), meta),
      /ASSET_SIZE_LIMIT/,
    );
    const folders = await readdir(path.join(root, "assets"));
    let retained = 0;
    for (const folder of folders)
      retained += (await readdir(path.join(root, "assets", folder))).length;
    assert.equal(retained, 3, "Rejected upload retained bytes");
    const sourceBytes = await readFile(dataPath(asset.path));
    for (const range of ["bytes=0-1", "bytes=-128", "bytes=100-"]) {
      const response = await serveAsset(
        new Request("http://localhost/asset", { headers: { range } }),
        asset.path,
        asset.mime,
      );
      assert.equal(response.status, 206);
      const [start, end] = response.headers
        .get("content-range")!
        .match(/bytes (\d+)-(\d+)/)!
        .slice(1)
        .map(Number);
      assert.deepEqual(
        new Uint8Array(await response.arrayBuffer()),
        new Uint8Array(sourceBytes.subarray(start, end + 1)),
      );
    }
    assert.equal(
      (
        await serveAsset(
          new Request("http://localhost/asset", {
            headers: { range: "bytes=99999999-" },
          }),
          asset.path,
          asset.mime,
        )
      ).status,
      416,
    );
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic video background acceptance",
    });
    const edition = (
      await db
        .insert(schema.sourceImports)
        .values({
          environment: "prelive",
          resourceId: 85,
          name: "Synthetic fixture edition",
          author: "Fixture",
          status: "completed",
          expectedChapters: 1,
          expectedVerses: 1,
          completedChapters: [1],
          metadata: {},
          rightsNotes: "Synthetic test only",
        })
        .returning()
    )[0];
    const blocks = [
      { kind: "reflection" as const, text: "Take one small step today." },
      { kind: "reflection" as const, text: "Give yourself time to breathe." },
    ];
    const script = (
      await db
        .insert(schema.scriptRevisions)
        .values({
          episodeId: episode.id,
          episodeRevision: episode.contentRevision ?? episode.revision,
          importId: edition.id,
          model: "manual",
          title: episode.title,
          blocks,
          retrieval: { sources: [] },
          checksum: digest(blocks),
        })
        .returning()
    )[0];
    await selectFirstScript(episode.id, script.id);
    const settings = {
      ...defaultEditorSettings(),
      openingSeconds: 0,
      closingSeconds: 0.2,
      cardDurations: [2.2, 1.8],
      sceneOverrides: [{ cueIndex: 1, imageId: sceneClip.id, imageDim: 0.2 }],
    };
    const workspace = (
      await db
        .select()
        .from(schema.episodeWorkspaceStates)
        .where(eq(schema.episodeWorkspaceStates.episodeId, episode.id))
    )[0];
    const input = {
      selectionRevision: workspace.revision,
      scriptId: script.id,
      mode: "text",
      background: "forest",
      narrationVolume: 0,
      imageId: imported.id,
      imageDim: 0.2,
      editorSettings: settings,
    };
    const composition = await saveComposition(episode.id, input);
    const saved = compositionSchema.parse(composition.data);
    assert.equal(saved.version, 4);
    assert.equal(saved.image!.kind, "video");
    assert.equal(saved.sceneImages![0].image!.kind, "video");
    const [reread] = await db
      .select()
      .from(schema.compositions)
      .where(eq(schema.compositions.id, composition.id));
    assert.deepEqual(reread.data, composition.data);
    // An old image-only preview still saves v3 and cannot rewrite the queued video snapshot.
    const legacy = await saveComposition(episode.id, {
      ...input,
      selectionRevision: workspace.revision + 1,
      imageId: still.id,
      editorSettings: { ...settings, sceneOverrides: [] },
    });
    assert.equal(compositionSchema.parse(legacy.data).version, 3);
    await db
      .update(schema.episodeWorkspaceStates)
      .set({ selectedCompositionId: composition.id })
      .where(eq(schema.episodeWorkspaceStates.episodeId, episode.id));
    const render = async () => {
      const current = (
        await db
          .select()
          .from(schema.episodeWorkspaceStates)
          .where(eq(schema.episodeWorkspaceStates.episodeId, episode.id))
      )[0];
      const c = (
        await db
          .select()
          .from(schema.compositions)
          .where(eq(schema.compositions.id, current.selectedCompositionId!))
      )[0];
      const job = await enqueueJob(
        "render",
        {
          compositionId: c.id,
          compositionChecksum: c.checksum,
          format: "both",
        },
        episode.id,
      );
      let requestPath = "";
      const result = await runOne(job.id, async (leasedJob) => {
        requestPath = dataPath(
          `render-attempts/${job.id}/${leasedJob.owner}/request.json`,
        );
        return renderVideo(leasedJob);
      });
      assert.equal(
        result?.status,
        "succeeded",
        result?.error || "Render failed",
      );
      const output = (
        await db
          .select()
          .from(schema.videoExports)
          .where(eq(schema.videoExports.jobId, job.id))
      )[0];
      for (const relative of [output.landscapePath, output.verticalPath]) {
        const { stdout } = await exec("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          dataPath(relative),
        ]);
        const info = JSON.parse(stdout);
        assert(
          !info.streams.some(
            (s: { codec_type: string }) => s.codec_type === "audio",
          ),
          "Clip audio leaked into silent export",
        );
        assert.equal(
          info.streams[0].width,
          relative === output.landscapePath ? 1920 : 1080,
        );
        await exec("ffmpeg", [
          "-v",
          "error",
          "-xerror",
          "-i",
          dataPath(relative),
          "-f",
          "null",
          "-",
        ]);
      }
      assert(
        (await readFile(dataPath(output.descriptionPath), "utf8")).includes(
          "Clip audio muted",
        ),
      );
      console.log("Actual both-format render and complete decoding passed.");
      return {
        output,
        requestPath,
      };
    };
    const first = await render();
    await writeFile(
      path.join(root, "fixture.json"),
      JSON.stringify(
        {
          episodeId: episode.id,
          databaseName: name,
          clip,
          sceneClip: second,
          still: png,
          root,
          ...first,
        },
        null,
        2,
      ),
    );
    // Mutated bytes must be refused before rendering, then restored for browser checks.
    await writeFile(dataPath(asset.path), "tampered");
    await assert.rejects(
      checkedAsset(imported.id, "video"),
      /ASSET_CHECKSUM_MISMATCH/,
    );
    await writeFile(dataPath(asset.path), new Uint8Array(sourceBytes));
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM provider_usage"))
        .rows[0].n,
      0,
    );
    console.log(`Video evidence: ${root}`);
    if (!process.argv.includes("--serve")) return;
    server = spawn(
      "pnpm",
      ["start", "--hostname", "127.0.0.1", "--port", "3112"],
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
      `Browser fixture: http://127.0.0.1:3112/episodes/${episode.id}/studio?section=background`,
    );
    console.log("Commands: render, report, stop. No inference is processed.");
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
            if (line.trim() === "stop") return stop();
            if (line.trim() === "render") await render();
            if (line.trim() === "report") {
              const { mediaState } = await import("../lib/server/media/state");
              const state = await mediaState(episode.id);
              console.log(
                JSON.stringify(
                  {
                    selectedCompositionId: state.selectedCompositionId,
                    composition: state.compositions.find(
                      (c) => c.id === state.selectedCompositionId,
                    ),
                    assets: state.assets,
                    providerUsage: (
                      await pool!.query(
                        "SELECT count(*)::int AS n FROM provider_usage",
                      )
                    ).rows[0].n,
                  },
                  null,
                  2,
                ),
              );
            }
          })
          .catch(reject);
      });
    });
    await commands;
  } finally {
    server?.kill("SIGTERM");
    await pool?.end();
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "VIDEO_FIXTURE_FAILED",
  );
  process.exitCode = 1;
});
