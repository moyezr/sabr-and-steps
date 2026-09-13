import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  episodes,
  scriptRevisions,
  sourceImports,
  sourcePassages,
} from "../db/schema";
import { type Job, progress } from "../jobs/store";
import { buildIndex, retrieve } from "./retrieval";
import { generateDraft } from "../providers/openrouter";
import {
  resolveDraft,
  scriptBlockSchema,
  scriptEditSchema,
  validateScriptQuotes,
} from "../../domain/script";
import { digest } from "../hash";
import { z } from "zod";
export const draftJobInput = z.object({
  episodeId: z.string().uuid(),
  episodeRevision: z.number().int(),
  importId: z.string().uuid(),
});
export async function createDraft(job: Job) {
  const input = draftJobInput.parse(job.input);
  const db = getDb();
  const episode = (
    await db.select().from(episodes).where(eq(episodes.id, input.episodeId))
  )[0];
  if (!episode || episode.revision !== input.episodeRevision)
    throw new Error("EPISODE_REVISION_CHANGED");
  const indexId = await buildIndex(job, input.importId);
  await progress(job, "Finding source passages and surrounding context");
  const query = `${episode.title}. ${episode.brief} Theme: ${episode.theme}`;
  const sources = await retrieve(job, indexId, query);
  if (!sources.length) throw new Error("NO_SUPPORTING_SOURCE");
  await progress(job, "Writing the draft with canonical citation IDs");
  const draft = await generateDraft(
    job,
    episode.llmModel,
    JSON.stringify({
      brief: {
        title: episode.title,
        need: episode.brief,
        theme: episode.theme,
        targetSeconds: episode.targetSeconds,
      },
      instructions: `Aim for ${Math.round(episode.targetSeconds * 1.9)} to ${Math.round(episode.targetSeconds * 2.15)} spoken words including one short full verse quoted from the supplied sources. Offer compassionate acknowledgement, a sourced reminder, and one achievable action. Use 8–14 short blocks. The total spoken words include the canonical quote that will replace the empty quote text. Do not include a new title spoken aloud.`,
      sources,
    }),
  );
  const blocks = resolveDraft(draft, sources);
  const latest = (
    await db.select().from(episodes).where(eq(episodes.id, episode.id))
  )[0];
  if (latest.revision !== input.episodeRevision)
    throw new Error("EPISODE_REVISION_CHANGED");
  const inserted = await db
    .insert(scriptRevisions)
    .values({
      episodeId: episode.id,
      episodeRevision: episode.revision,
      jobId: job.id,
      importId: input.importId,
      indexId,
      model: episode.llmModel,
      title: draft.title,
      blocks,
      retrieval: { query, sources, reason: draft.reason },
      checksum: digest({ title: draft.title, blocks }),
    })
    .onConflictDoNothing()
    .returning();
  const result =
    inserted[0] ||
    (
      await db
        .select()
        .from(scriptRevisions)
        .where(eq(scriptRevisions.jobId, job.id))
    )[0];
  return { scriptId: result.id };
}
export async function listDrafts(episodeId: string) {
  return getDb()
    .select()
    .from(scriptRevisions)
    .where(eq(scriptRevisions.episodeId, episodeId))
    .orderBy(desc(scriptRevisions.createdAt));
}
export async function saveDraft(episodeId: string, raw: unknown) {
  const input = scriptEditSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(scriptRevisions)
        .where(
          and(
            eq(scriptRevisions.id, input.parentId),
            eq(scriptRevisions.episodeId, episodeId),
          ),
        )
    )[0];
    if (!current) throw new Error("SCRIPT_NOT_FOUND");
    const edition = (
      await tx
        .select()
        .from(sourceImports)
        .where(eq(sourceImports.id, current.importId))
    )[0];
    const sources = (
      await tx
        .select()
        .from(sourcePassages)
        .where(eq(sourcePassages.importId, current.importId))
    ).map((p) => ({ ...p, edition: edition.name }));
    validateScriptQuotes(input.blocks, sources);
    const episode = (
      await tx
        .select()
        .from(episodes)
        .where(eq(episodes.id, episodeId))
        .for("update")
    )[0];
    const latest = (
      await tx
        .select()
        .from(scriptRevisions)
        .where(eq(scriptRevisions.episodeId, episodeId))
        .orderBy(desc(scriptRevisions.createdAt))
        .limit(1)
    )[0];
    if (latest.id !== input.parentId)
      throw new Error("SCRIPT_REVISION_CONFLICT");
    return (
      await tx
        .insert(scriptRevisions)
        .values({
          episodeId,
          episodeRevision: episode.revision,
          parentId: current.id,
          importId: current.importId,
          indexId: current.indexId,
          model: current.model,
          title: input.title,
          blocks: input.blocks,
          retrieval: current.retrieval,
          checksum: digest({ title: input.title, blocks: input.blocks }),
        })
        .returning()
    )[0];
  });
}
export async function reviewDraft(
  episodeId: string,
  id: string,
  checksum: string,
  notes: string,
) {
  const db = getDb();
  const latest = (await listDrafts(episodeId))[0];
  if (!latest || latest.id !== id || latest.checksum !== checksum)
    throw new Error("SCRIPT_REVISION_CONFLICT");
  const episode = (
    await db.select().from(episodes).where(eq(episodes.id, episodeId))
  )[0];
  if (episode.revision !== latest.episodeRevision)
    throw new Error("EPISODE_REVISION_CHANGED");
  z.array(scriptBlockSchema).parse(latest.blocks);
  return (
    await db
      .update(scriptRevisions)
      .set({
        reviewState: "reviewed",
        reviewNotes: notes.slice(0, 2000),
        reviewedAt: new Date(),
      })
      .where(
        and(eq(scriptRevisions.id, id), eq(scriptRevisions.checksum, checksum)),
      )
      .returning()
  )[0];
}
