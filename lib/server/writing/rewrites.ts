import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  reflectionSelectionSchema,
  rewriteAlternativeSchema,
  rewriteRequestSchema,
  rewriteResultSchema,
} from "../../domain/script-rewrites";
import { scriptBlockSchema } from "../../domain/script";
import { getDb } from "../db/client";
import {
  episodes,
  episodeWorkspaceStates,
  episodeScriptDrafts,
  scriptRevisions,
  scriptRewriteSuggestions,
  jobs,
} from "../db/schema";
import { digest } from "../hash";
import { progress, type Job } from "../jobs/store";
import {
  generateReflectionRewrites,
  ProviderError,
} from "../providers/openrouter";

export const REWRITE_JOB_KIND = "script_rewrite";
const jobInputSchema = rewriteRequestSchema
  .extend({ episodeId: z.string().uuid(), requestId: z.string().uuid() })
  .strict();
export type RewriteGenerator = (
  job: Job,
  model: string,
  prompt: string,
) => Promise<unknown>;

export async function requestScriptRewrite(
  episodeId: string,
  raw: unknown,
  requestId = randomUUID(),
) {
  const input = {
    ...rewriteRequestSchema.parse(raw),
    episodeId,
    requestId: z.string().uuid().parse(requestId),
  };
  const key = digest({ kind: REWRITE_JOB_KIND, episodeId, requestId });
  return getDb().transaction(async (tx) => {
    const [episode] = await tx
      .select()
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .for("no key update");
    if (!episode) throw new Error("EPISODE_NOT_FOUND");
    const [prior] = await tx.select().from(jobs).where(eq(jobs.key, key));
    if (prior) {
      if (
        prior.kind !== REWRITE_JOB_KIND ||
        digest(prior.input) !== digest(input)
      )
        throw new Error("REWRITE_REQUEST_ID_REUSED");
      return prior;
    }
    if (episode.revision !== input.episodeRevision)
      throw new Error("EPISODE_REVISION_CHANGED");
    const [workspace] = await tx
      .select()
      .from(episodeWorkspaceStates)
      .where(eq(episodeWorkspaceStates.episodeId, episodeId))
      .for("update");
    const [base] = await tx
      .select()
      .from(scriptRevisions)
      .where(
        and(
          eq(scriptRevisions.id, input.baseScriptId),
          eq(scriptRevisions.episodeId, episodeId),
        ),
      );
    if (!base) throw new Error("SCRIPT_NOT_FOUND");
    if (workspace?.selectedScriptId && workspace.selectedScriptId !== base.id)
      throw new Error("SCRIPT_SELECTION_CHANGED");
    const [draft] = await tx
      .select()
      .from(episodeScriptDrafts)
      .where(eq(episodeScriptDrafts.episodeId, episodeId))
      .for("update");
    if (
      (draft?.revision ?? 0) !== input.draftRevision ||
      (draft && draft.baseScriptId !== base.id)
    )
      throw new Error("SCRIPT_DRAFT_CONFLICT");
    const blocks = z
      .array(scriptBlockSchema)
      .parse(draft?.blocks ?? base.blocks);
    const target = blocks[input.selection.blockIndex];
    if (
      !target ||
      target.kind !== "reflection" ||
      target.text !== input.selection.blockText
    )
      throw new Error("REWRITE_TARGET_CHANGED");
    const [created] = await tx
      .insert(jobs)
      .values({ episodeId, kind: REWRITE_JOB_KIND, key, input })
      .returning();
    return created;
  });
}

function leaseCondition(job: Job) {
  if (!job.owner) throw new ProviderError("JOB_LEASE_LOST");
  return and(
    eq(jobs.id, job.id),
    eq(jobs.kind, REWRITE_JOB_KIND),
    eq(jobs.status, "running"),
    eq(jobs.owner, job.owner),
    sql`${jobs.leaseUntil} > now()`,
  );
}

export async function createScriptRewrites(
  job: Job,
  generator: RewriteGenerator = generateReflectionRewrites,
) {
  if (job.kind !== REWRITE_JOB_KIND)
    throw new ProviderError("REWRITE_JOB_INVALID");
  const input = jobInputSchema.parse(job.input);
  if (input.episodeId !== job.episodeId)
    throw new ProviderError("REWRITE_JOB_INVALID");
  const db = getDb();
  const [prior] = await db
    .select()
    .from(scriptRewriteSuggestions)
    .where(eq(scriptRewriteSuggestions.jobId, job.id));
  if (prior) return { suggestionId: prior.id };
  const [owned] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(leaseCondition(job));
  if (!owned) throw new ProviderError("JOB_LEASE_LOST");
  await progress(job, "Writing three alternatives for the selected reflection");
  const generated = await generator(
    job,
    input.model,
    JSON.stringify({
      instructions: input.instructions,
      reflection: input.selection.blockText,
      selectedText: input.selection.text,
      task: "Rewrite only selectedText as original compassionate encouragement, with exactly three distinct alternatives and a short reason for each. Preserve intent and prose boundaries. Do not generate canonical quotations or citations.",
    }),
  );
  const result = rewriteResultSchema.safeParse(generated);
  if (!result.success) throw new ProviderError("REWRITE_SCHEMA_INVALID");
  if (!result.data.supported) throw new ProviderError("REWRITE_UNSUPPORTED");
  if (
    result.data.alternatives.some(
      (alternative) => alternative.text === input.selection.text.trim(),
    )
  )
    throw new ProviderError("REWRITE_UNCHANGED_ALTERNATIVE");
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(leaseCondition(job))
      .for("update");
    if (!current) throw new ProviderError("JOB_LEASE_LOST");
    const [existing] = await tx
      .select()
      .from(scriptRewriteSuggestions)
      .where(eq(scriptRewriteSuggestions.jobId, job.id));
    if (existing) return { suggestionId: existing.id };
    const [saved] = await tx
      .insert(scriptRewriteSuggestions)
      .values({
        episodeId: input.episodeId,
        jobId: job.id,
        baseScriptId: input.baseScriptId,
        draftRevision: input.draftRevision,
        episodeRevision: input.episodeRevision,
        model: input.model,
        instructions: input.instructions,
        selection: input.selection,
        alternatives: result.data.alternatives,
      })
      .returning({ id: scriptRewriteSuggestions.id });
    return { suggestionId: saved.id };
  });
}

export async function rejectScriptRewrite(
  episodeId: string,
  suggestionId: string,
) {
  const [suggestion] = await getDb()
    .update(scriptRewriteSuggestions)
    .set({ rejectedAt: new Date() })
    .where(
      and(
        eq(scriptRewriteSuggestions.id, suggestionId),
        eq(scriptRewriteSuggestions.episodeId, episodeId),
      ),
    )
    .returning();
  if (!suggestion) throw new Error("REWRITE_NOT_FOUND");
  return suggestion;
}

export async function retryScriptRewrite(episodeId: string, jobId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.episodeId, episodeId),
        eq(jobs.kind, REWRITE_JOB_KIND),
      ),
    );
  if (!job) throw new Error("REWRITE_NOT_FOUND");
  if (job.status === "needs_attention" || job.dispatchedAt)
    throw new Error("REWRITE_UNCERTAIN");
  if (["queued", "running", "succeeded"].includes(job.status)) return job;
  const [retried] = await db
    .update(jobs)
    .set({
      status: "queued",
      attempts: 0,
      error: null,
      owner: null,
      leaseUntil: null,
      availableAt: sql`now()`,
      progress: "Waiting for worker",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.status, "failed"),
        isNull(jobs.dispatchedAt),
      ),
    )
    .returning();
  if (!retried) throw new Error("REWRITE_RETRY_CONFLICT");
  return retried;
}

export async function scriptRewriteState(episodeId: string) {
  const db = getDb();
  const [episode] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.id, episodeId));
  if (!episode) throw new Error("EPISODE_NOT_FOUND");
  const [suggestions, work] = await Promise.all([
    db
      .select()
      .from(scriptRewriteSuggestions)
      .where(eq(scriptRewriteSuggestions.episodeId, episodeId))
      .orderBy(desc(scriptRewriteSuggestions.createdAt)),
    db
      .select()
      .from(jobs)
      .where(
        and(eq(jobs.episodeId, episodeId), eq(jobs.kind, REWRITE_JOB_KIND)),
      )
      .orderBy(desc(jobs.createdAt)),
  ]);
  return {
    suggestions: suggestions.map((suggestion) => ({
      id: suggestion.id,
      baseScriptId: suggestion.baseScriptId,
      draftRevision: suggestion.draftRevision,
      episodeRevision: suggestion.episodeRevision,
      model: suggestion.model,
      instructions: suggestion.instructions,
      selection: reflectionSelectionSchema.parse(suggestion.selection),
      alternatives: z
        .array(rewriteAlternativeSchema)
        .length(3)
        .parse(suggestion.alternatives),
      rejected: Boolean(suggestion.rejectedAt),
      createdAt: suggestion.createdAt.toISOString(),
    })),
    jobs: work.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      progress: job.progress,
      error: job.error,
    })),
  };
}
export type RewriteAssistanceState = Awaited<
  ReturnType<typeof scriptRewriteState>
>;
