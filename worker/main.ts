import nextEnv from "@next/env";
import { setTimeout as delay } from "node:timers/promises";
import { runOne } from "../lib/server/jobs/run";
import { getPool } from "../lib/server/db/client";
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  const id = process.argv.find((a) => a.startsWith("--job="))?.slice(6);
  const once = process.argv.includes("--once") || Boolean(id);
  try {
    do {
      const result = await runOne(id);
      if (result) {
        console.log(
          JSON.stringify({
            id: result.id,
            kind: result.kind,
            status: result.status,
            error: result.error,
          }),
        );
        if (once && result.status !== "succeeded") process.exitCode = 1;
      }
      if (!once && !stopping) await delay(1500);
    } while (!once && !stopping);
  } catch {
    console.error("WORKER_FAILED");
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}
void main();
