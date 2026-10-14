import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  automationProfileSchema,
  automationRequestSchema,
} from "../../domain/automation";
import { getDb } from "../db/client";
import {
  automationProfiles,
  episodes,
  jobs,
  productionRuns,
  providerUsage,
  sourceImports,
} from "../db/schema";
import { digest } from "../hash";
import { checkedAsset, listAssets } from "../media/assets";
import { retryJob } from "../jobs/store";

async function checkProfile(raw: unknown) {
  const profile = automationProfileSchema.parse(raw);
  const source = (
    await getDb()
      .select()
      .from(sourceImports)
      .where(eq(sourceImports.id, profile.importId))
  )[0];
  if (!source || source.status !== "completed")
    throw new Error("SOURCE_IMPORT_NOT_COMPLETE");
  const image = profile.imageId
    ? await checkedAsset(profile.imageId, "background")
    : null;
  const music = profile.musicId
    ? await checkedAsset(profile.musicId, "audio")
    : null;
  return {
    profile,
    assetChecksums: {
      image: image?.checksum ?? null,
      music: music?.checksum ?? null,
    },
  };
}

export async function saveAutomationProfile(raw: unknown) {
  const { profile } = await checkProfile(raw);
  return (
    await getDb()
      .insert(automationProfiles)
      .values({ name: profile.name, settings: profile })
      .returning()
  )[0];
}

export async function requestProduction(raw: unknown) {
  const input = automationRequestSchema.parse(raw);
  const requestHash = digest(input);
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(85020,hashtext(${input.requestId}))`,
    );
    const prior = (
      await tx
        .select()
        .from(productionRuns)
        .where(eq(productionRuns.requestId, input.requestId))
    )[0];
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new Error("AUTOMATION_REQUEST_ID_REUSED");
      return prior;
    }
    const profile = (
      await tx
        .select()
        .from(automationProfiles)
        .where(eq(automationProfiles.id, input.profileId))
    )[0];
    if (!profile) throw new Error("AUTOMATION_PROFILE_NOT_FOUND");
    const snapshot = await checkProfile(profile.settings);
    const episode = (
      await tx
        .insert(episodes)
        .values({
          title: input.title,
          brief: input.brief,
          theme: snapshot.profile.theme,
          targetSeconds: snapshot.profile.targetSeconds,
          llmModel: snapshot.profile.model,
          narrationProvider: "auto",
          purpose: "audition",
          format: "both",
        })
        .returning()
    )[0];
    const runId = randomUUID();
    const jobInput = {
      runId,
      episodeId: episode.id,
      episodeRevision: episode.revision,
      importId: snapshot.profile.importId,
      generationInstructions: snapshot.profile.instructions,
      maxTotalEstimatedUsd: snapshot.profile.maxEstimatedUsd,
    };
    const job = (
      await tx
        .insert(jobs)
        .values({
          kind: "production_draft",
          input: jobInput,
          key: digest({ kind: "production_draft", input: jobInput }),
          episodeId: episode.id,
        })
        .returning()
    )[0];
    return (
      await tx
        .insert(productionRuns)
        .values({
          id: runId,
          requestId: input.requestId,
          requestHash,
          profileId: profile.id,
          episodeId: episode.id,
          jobId: job.id,
          snapshot,
        })
        .returning()
    )[0];
  });
}

export async function retryProduction(id: string) {
  const run = (
    await getDb().select().from(productionRuns).where(eq(productionRuns.id, id))
  )[0];
  if (!run) throw new Error("AUTOMATION_RUN_NOT_FOUND");
  const job = (
    await getDb().select().from(jobs).where(eq(jobs.id, run.jobId))
  )[0];
  if (job.status === "needs_attention" || job.dispatchedAt)
    throw new Error("PROVIDER_RECONCILIATION_REQUIRED");
  if (job.status !== "failed" && job.status !== "queued")
    throw new Error("AUTOMATION_RETRY_UNAVAILABLE");
  return (await retryJob(job.id)) || job;
}

export async function automationState() {
  const db = getDb();
  const profiles = await db
    .select()
    .from(automationProfiles)
    .orderBy(desc(automationProfiles.createdAt));
  const rows = await db
    .select({ run: productionRuns, job: jobs, title: episodes.title })
    .from(productionRuns)
    .innerJoin(jobs, eq(jobs.id, productionRuns.jobId))
    .innerJoin(episodes, eq(episodes.id, productionRuns.episodeId))
    .orderBy(desc(productionRuns.createdAt))
    .limit(50);
  const runs = await Promise.all(
    rows.map(async ({ run, job, title }) => {
      const [cost] = await db
        .select({
          usd: sql<number>`coalesce(sum(CASE WHEN ${providerUsage.state} = 'released' THEN 0 ELSE greatest(coalesce(${providerUsage.actual},0),${providerUsage.estimated}) END),0)::float8`,
        })
        .from(providerUsage)
        .where(
          and(
            eq(providerUsage.jobId, job.id),
            eq(providerUsage.provider, "openrouter"),
          ),
        );
      return {
        id: run.id,
        episodeId: run.episodeId,
        profileName: run.snapshot.profile.name,
        title,
        status: job.status,
        progress: job.progress,
        error: job.error,
        scriptId: run.scriptId,
        compositionId: run.compositionId,
        exportId: run.exportId,
        estimatedOrReportedUsd: cost.usd,
        budgetUsd: run.snapshot.profile.maxEstimatedUsd,
        createdAt: run.createdAt.toISOString(),
      };
    }),
  );
  const sources = await db
    .select({
      id: sourceImports.id,
      name: sourceImports.name,
      author: sourceImports.author,
      expectedChapters: sourceImports.expectedChapters,
      expectedVerses: sourceImports.expectedVerses,
      rightsStatus: sourceImports.rightsStatus,
    })
    .from(sourceImports)
    .where(eq(sourceImports.status, "completed"));
  return {
    profiles: profiles.map((p) => ({
      id: p.id,
      ...p.settings,
      createdAt: p.createdAt.toISOString(),
    })),
    runs,
    sources,
    assets: await listAssets(),
  };
}

export type AutomationState = Awaited<ReturnType<typeof automationState>>;
