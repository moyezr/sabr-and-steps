import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";

// Synthetic sources/generation; actual queued compositions and MP4 renders.
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert(process.env.DATABASE_URL);
  const id = randomUUID();
  const root = path.resolve(".data/evidence/automation", id);
  process.env.APP_DATA_DIR = root;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const database = `sabr_automation_browser_${id.replaceAll("-", "")}`;
  let pool: Pool | undefined;
  let server: ChildProcess | undefined;
  let created = false;
  let input: ReturnType<typeof createInterface> | undefined;
  const exec = promisify(execFile);
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getDb, getPool } = await import("../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const db = getDb();
    const { seedAutomationFixture } = await import(
      "../tests/fixtures/automation"
    );
    const fixture = await seedAutomationFixture();
    const { requestProduction, automationState } = await import(
      "../lib/server/automation/store"
    );
    const { createProductionDraft } = await import(
      "../lib/server/automation/run"
    );
    const { createDraft } = await import("../lib/server/writing/drafts");
    const { runOne } = await import("../lib/server/jobs/run");
    const { jobs, videoExports, compositions } = await import(
      "../lib/server/db/schema"
    );
    const { dataPath } = await import("../lib/server/jobs/files");
    const { probeMedia } = await import("../lib/server/media/probe");
    await requestProduction({
      profileId: fixture.profile.id,
      requestId: randomUUID(),
      title: "Synthetic automation preview",
      brief: "Synthetic quiet reminder for pipeline checks.",
    });
    const complete = async (mode = "complete") => {
      const queued = await db
        .select()
        .from(jobs)
        .where(eq(jobs.status, "queued"));
      for (const job of queued.filter((j) => j.kind === "production_draft")) {
        await fixture.prepareQuery(job.episodeId!);
        const result = await runOne(job.id, async (owned) => {
          if (mode === "fail") throw new Error("SYNTHETIC_FIXTURE_FAILURE");
          if (mode === "uncertain") {
            await db
              .update(jobs)
              .set({ dispatchedAt: new Date() })
              .where(eq(jobs.id, owned.id));
            throw new Error("SYNTHETIC_PROVIDER_UNCERTAIN");
          }
          return createProductionDraft(owned, (j) =>
            createDraft(j, fixture.generator),
          );
        });
        if (mode === "complete")
          assert.equal(
            result?.status,
            "succeeded",
            result?.error || "Run failed",
          );
        console.log(`Fixture run ${job.id}: ${result?.status}`);
      }
      if (mode !== "complete") return;
      for (const output of await db.select().from(videoExports)) {
        const c = (
          await db
            .select()
            .from(compositions)
            .where(eq(compositions.id, output.compositionId))
        )[0];
        const duration = (c.data as { duration: number }).duration;
        for (const [orientation, relative] of [
          ["landscape", output.landscapePath],
          ["vertical", output.verticalPath],
        ] as const) {
          assert(relative);
          const info = await probeMedia(dataPath(relative));
          const video = info.streams.find((s) => s.codec_type === "video")!;
          assert.equal(video.width, orientation === "landscape" ? 1920 : 1080);
          assert.equal(video.height, orientation === "landscape" ? 1080 : 1920);
          assert(Math.abs(info.duration - duration) < 0.2);
          assert(!info.streams.some((s) => s.codec_type === "audio"));
          await exec(
            "ffmpeg",
            ["-v", "error", "-i", dataPath(relative), "-f", "null", "-"],
            { timeout: 30000 },
          );
        }
      }
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(root, "verification.json"),
        JSON.stringify(
          {
            synthetic: true,
            actualRenders: true,
            providerInference: false,
            creatorApproval: false,
            state: await automationState(),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        `Both-format render/probe/full-decode checks passed. Evidence: ${root}`,
      );
    };
    if (!process.argv.includes("--serve")) {
      await complete();
      return;
    }
    const safeEnv = {
      ...process.env,
      OPENROUTER_API_KEY: "",
      ELEVEN_LABS_API_KEY: "",
      CARTESIA_API_KEY: "",
      DEEPGRAM_API_KEY: "",
      QURAN_CLIENT_ID: "",
      QURAN_CLIENT_SECRET: "",
      SUNNAH_API_KEY: "",
      PORT: "3109",
    };
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        "3109",
      ],
      { env: safeEnv, stdio: ["ignore", "pipe", "pipe"] },
    );
    server.stdout?.pipe(process.stdout);
    server.stderr?.pipe(process.stderr);
    console.log(
      `Synthetic automation browser fixture: http://127.0.0.1:3109/automation`,
    );
    console.log(
      "Commands: complete, fail, uncertain, report, stop. No live inference or real approvals.",
    );
    input = createInterface({ input: process.stdin });
    for await (const line of input) {
      if (line.trim() === "stop") {
        input.close();
        break;
      }
      if (["complete", "fail", "uncertain"].includes(line.trim()))
        await complete(line.trim());
      if (line.trim() === "report")
        console.log(JSON.stringify(await automationState()));
    }
  } finally {
    input?.close();
    process.stdin.pause();
    if (server && server.exitCode === null) {
      const closed = new Promise<void>((resolve) =>
        server!.once("exit", () => resolve()),
      );
      server.kill("SIGTERM");
      await closed;
    }
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
