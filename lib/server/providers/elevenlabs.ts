import "server-only";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { jobs, providerUsage } from "../db/schema";
import { type Job, heartbeat } from "../jobs/store";
import { readArtifact, writeArtifact } from "../jobs/files";
import { digest } from "../hash";
import { ProviderError } from "./openrouter";
import { availableSpeechCharacters } from "../../domain/speech-credits";
import { voiceSettingsSchema } from "../../domain/media";
const subscriptionSchema = z.object({
  tier: z.string(),
  status: z.string(),
  character_count: z.number().nonnegative(),
  character_limit: z.number().nonnegative(),
  can_extend_character_limit: z.boolean(),
  next_character_count_reset_unix: z.number().optional(),
});
async function get(path: string) {
  if (!process.env.ELEVEN_LABS_API_KEY)
    throw new ProviderError("ELEVENLABS_KEY_MISSING");
  let r: Response;
  try {
    r = await fetch(`https://api.elevenlabs.io/${path}`, {
      headers: { "xi-api-key": process.env.ELEVEN_LABS_API_KEY },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ProviderError("ELEVENLABS_ACCOUNT_UNAVAILABLE");
  }
  if (!r.ok) throw new ProviderError(`ELEVENLABS_ACCOUNT_HTTP_${r.status}`);
  return r.json();
}
export async function elevenAccount() {
  const account = subscriptionSchema.parse(await get("v1/user/subscription"));
  return {
    ...account,
    remaining: Math.max(0, account.character_limit - account.character_count),
    commercial:
      account.tier !== "free" &&
      ["active", "trialing"].includes(account.status),
    checkedAt: new Date().toISOString(),
    rightsSource:
      "https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform",
  };
}
export async function elevenAccountAvailability() {
  const account = await elevenAccount();
  const usage = await getDb()
    .select()
    .from(providerUsage)
    .where(eq(providerUsage.provider, "elevenlabs"));
  return {
    ...account,
    providerReportedRemaining: account.remaining,
    remaining: availableSpeechCharacters(account, usage),
  };
}
export async function elevenVoices() {
  const data = z
    .object({
      voices: z.array(
        z.object({
          voice_id: z.string(),
          name: z.string(),
          category: z.string(),
          labels: z.record(z.string(), z.string()).optional(),
          preview_url: z.string().nullable().optional(),
        }),
      ),
    })
    .parse(await get("v1/voices"));
  return data.voices.filter((v) => v.category === "premade");
}
export async function elevenSpeech(
  job: Job,
  text: string,
  voiceId: string,
  settings: z.infer<typeof voiceSettingsSchema>,
  purpose: "audition" | "publish",
) {
  const model = "eleven_multilingual_v2";
  const request = {
    text,
    model_id: model,
    voice_settings: { ...settings, style: 0, use_speaker_boost: true },
  };
  const requestHash = digest({ request, voiceId, purpose });
  const artifact = `jobs/${job.id}/speech.json`;
  const cached = (await readArtifact(artifact)) as {
    requestHash: string;
    response: unknown;
    account: Awaited<ReturnType<typeof elevenAccount>>;
    voice: { voice_id: string; name: string };
  } | null;
  if (cached) {
    if (cached.requestHash !== requestHash)
      throw new ProviderError("CACHED_REQUEST_MISMATCH");
    return cached;
  }
  await heartbeat(job);
  const voices = await elevenVoices();
  const voice = voices.find((v) => v.voice_id === voiceId);
  if (!voice) throw new ProviderError("VOICE_NOT_AVAILABLE");
  const operation = `${job.id}:narration`;
  const db = getDb();
  let account: Awaited<ReturnType<typeof elevenAccount>> | undefined;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(85004,2)`);
    account = await elevenAccount();
    if (purpose === "publish" && !account.commercial)
      throw new ProviderError("SPEECH_PUBLICATION_RIGHTS_NOT_CLEARED");
    if (!["free", "active", "trialing"].includes(account.status))
      throw new ProviderError("SPEECH_ACCOUNT_NOT_ACTIVE");
    const prior = (
      await tx
        .select()
        .from(providerUsage)
        .where(eq(providerUsage.operation, operation))
    )[0];
    if (prior && prior.state !== "released")
      throw new ProviderError("PROVIDER_RESULT_UNCERTAIN", false, true);
    const usage = await tx
      .select()
      .from(providerUsage)
      .where(eq(providerUsage.provider, "elevenlabs"));
    // Multilingual v2 uses one credit per character. Reserve a margin; no overage dispatch.
    const estimate = Math.ceil(Array.from(text).length * 1.05);
    if (availableSpeechCharacters(account, usage) < estimate + 100)
      throw new ProviderError("SPEECH_INCLUDED_CREDITS_INSUFFICIENT");
    const values = {
      jobId: job.id,
      operation,
      provider: "elevenlabs",
      model,
      unit: "characters",
      estimated: estimate,
      state: "reserved",
      details: {
        account,
        voice: {
          id: voice.voice_id,
          name: voice.name,
          category: voice.category,
        },
        requestHash,
        purpose,
      },
    };
    if (prior)
      await tx
        .update(providerUsage)
        .set(values)
        .where(eq(providerUsage.id, prior.id));
    else await tx.insert(providerUsage).values(values);
  });
  await db.transaction(async (tx) => {
    await tx
      .update(providerUsage)
      .set({ state: "dispatched" })
      .where(eq(providerUsage.operation, operation));
    const owned = await tx
      .update(jobs)
      .set({ dispatchedAt: new Date() })
      .where(
        and(
          eq(jobs.id, job.id),
          eq(jobs.owner, job.owner!),
          eq(jobs.status, "running"),
        ),
      )
      .returning({ id: jobs.id });
    if (!owned.length) throw new ProviderError("JOB_LEASE_LOST");
  });
  let r: Response;
  try {
    r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVEN_LABS_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      },
    );
  } catch {
    throw new ProviderError("SPEECH_RESULT_UNCERTAIN", false, true);
  }
  if (!r.ok) {
    const certain = r.status >= 400 && r.status < 500;
    await db
      .update(providerUsage)
      .set({ state: certain ? "released" : "uncertain" })
      .where(eq(providerUsage.operation, operation));
    if (certain)
      await db
        .update(jobs)
        .set({ dispatchedAt: null })
        .where(eq(jobs.id, job.id));
    throw new ProviderError(
      `ELEVENLABS_HTTP_${r.status}`,
      r.status === 429,
      !certain,
    );
  }
  const response: unknown = await r.json();
  const output = {
    requestHash,
    response,
    account: account!,
    voice: { voice_id: voice.voice_id, name: voice.name },
  };
  await writeArtifact(artifact, output);
  const count = Number(r.headers.get("character-cost"));
  const actual =
    Number.isFinite(count) && count > 0 ? count : Array.from(text).length;
  await db.transaction(async (tx) => {
    await tx
      .update(providerUsage)
      .set({
        state: "settled",
        actual,
        details: {
          account,
          requestHash,
          purpose,
          requestId: r.headers.get("request-id"),
          actualIsEstimate: !r.headers.has("character-cost"),
        },
      })
      .where(eq(providerUsage.operation, operation));
    await tx
      .update(jobs)
      .set({ dispatchedAt: null })
      .where(and(eq(jobs.id, job.id), eq(jobs.owner, job.owner!)));
  });
  return output;
}
