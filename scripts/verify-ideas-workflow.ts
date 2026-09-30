import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// A disposable browser fixture. The injected generator never contacts a provider.
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert(process.env.DATABASE_URL, "Configure the local database first.");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const database = `sabr_ideas_browser_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  let server: ChildProcess | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool } = await import("../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const { createEpisode } = await import("../lib/server/db/episodes");
    const { EMPTY_EPISODE } = await import("../lib/domain/episode");
    const { runOne } = await import("../lib/server/jobs/run");
    const { createIdeaSuggestions, requestIdeaSuggestions } = await import(
      "../lib/server/ideas/suggestions"
    );
    const { parseIdeaDirectionsResponse, ProviderError } = await import(
      "../lib/server/providers/openrouter"
    );
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic idea assistance fixture",
      brief: "I have been trying for months and feel like nothing is changing.",
      theme: "patience",
      purpose: "audition",
    });
    const input = {
      title: episode.title,
      brief: episode.brief,
      theme: episode.theme,
      targetSeconds: episode.targetSeconds,
    };
    let generation = 0;
    const complete = async (jobId: string, mode = "complete") => {
      generation += 1;
      const result = await runOne(jobId, (job) =>
        createIdeaSuggestions(job, async (_job, model) => {
          if (mode === "fail")
            throw new ProviderError("FIXTURE_GENERATION_STOPPED");
          if (mode === "uncertain")
            throw new ProviderError("FIXTURE_RESULT_UNCERTAIN", false, true);
          return parseIdeaDirectionsResponse(
            {
              model,
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      supported: true,
                      reason: "",
                      directions: [
                        {
                          angle: "Waiting without losing the next step",
                          title: `A small step still matters ${generation}`,
                          hook: "Waiting can feel heavier than moving.",
                          takeaway: "Choose one possible action today.",
                        },
                        {
                          angle: "Care during uncertainty",
                          title: `Held in the waiting ${generation}`,
                          hook: "Uncertainty does not erase your effort.",
                          takeaway: "Name one form of support you can accept.",
                        },
                        {
                          angle: "Hope without a deadline",
                          title: `Hope can be quiet ${generation}`,
                          hook: "Hope does not need to predict an outcome.",
                          takeaway: "Make room for one gentle routine.",
                        },
                      ],
                    }),
                  },
                },
              ],
            },
            model,
          );
        }),
      );
      assert(result, "No queued fixture job was claimed.");
      console.log("Fixture job", result.status, result.error || "completed");
    };
    for (const model of [
      "openai/gpt-5.6-luna",
      "google/gemini-3.8-flash",
    ] as const) {
      const job = await requestIdeaSuggestions(episode.id, {
        episodeRevision: episode.revision,
        model,
        instructions: "More reassuring; synthetic acceptance fixture.",
        input,
      });
      await complete(job.id);
    }
    console.log("Deterministic idea fixture seeded; no provider requests.");
    if (!process.argv.includes("--serve")) return;
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
        env: { ...process.env, OPENROUTER_API_KEY: "" },
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    console.log(
      `Synthetic browser fixture at http://127.0.0.1:3109/episodes/${episode.id}/brief`,
    );
    console.log(
      "Commands: complete, fail, uncertain, report, stop. Only this fixture's jobs are processed.",
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
              console.log(
                (
                  await pool!.query(
                    "SELECT title, brief, revision FROM episodes WHERE id=$1",
                    [episode.id],
                  )
                ).rows,
              );
              console.log(
                (
                  await pool!.query(
                    "SELECT id,status,error FROM jobs WHERE episode_id=$1 ORDER BY created_at",
                    [episode.id],
                  )
                ).rows,
              );
              return;
            }
            if (!["complete", "fail", "uncertain"].includes(command)) return;
            const queued = await pool!.query<{ id: string }>(
              "SELECT id FROM jobs WHERE episode_id=$1 AND kind='idea_suggestion' AND status='queued' ORDER BY created_at LIMIT 1",
              [episode.id],
            );
            if (!queued.rows[0]) return console.log("No queued fixture job.");
            await complete(queued.rows[0].id, command);
          })
          .catch((error: unknown) => {
            console.error(
              error instanceof Error ? error.message : "FIXTURE_COMMAND_FAILED",
            );
          });
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
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "IDEA_WORKFLOW_FIXTURE_FAILED",
  );
  process.exitCode = 1;
});
