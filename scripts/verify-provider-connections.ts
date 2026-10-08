import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { cartesiaStatus } from "../lib/server/providers/cartesia-status";
import { deepgramStatus } from "../lib/server/providers/deepgram-status";
async function main() {
  if (!process.argv.includes("--run"))
    throw new Error(
      "Use --run for explicit read-only account checks. No audio is submitted.",
    );
  nextEnv.loadEnvConfig(process.cwd());
  const diagnostics = await Promise.all([cartesiaStatus(), deepgramStatus()]);
  const directory = ".data/evidence/2026-10-08";
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/provider-connections.json`,
    JSON.stringify(
      { readOnly: true, inferenceDispatched: false, diagnostics },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  for (const d of diagnostics)
    console.log(
      `${d.provider}: ${d.connection}; ${d.creditStatus}; generation disabled. ${d.facts.join(" ")}`,
    );
}
void main().catch(() => {
  console.error("PROVIDER_DIAGNOSTICS_UNAVAILABLE");
  process.exitCode = 1;
});
