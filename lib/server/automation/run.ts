import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { automationProfileSchema } from "../../domain/automation";
import { getDb } from "../db/client";
import {
  episodeScriptDrafts,
  episodes,
  episodeWorkspaceStates,
  jobs,
  productionRuns,
  scriptRevisions,
} from "../db/schema";
import { createDraft } from "../writing/drafts";
import { saveComposition } from "../media/composition";
import { renderVideo } from "../media/render";
import { checkedAsset } from "../media/assets";
import { heartbeat, progress, type Job } from "../jobs/store";

export async function createProductionDraft(
  job: Job,
  draft = createDraft,
  render = renderVideo,
) {
  const { runId } = z.object({ runId: z.string().uuid() }).parse(job.input);
  const db = getDb();
  let run = (
    await db.select().from(productionRuns).where(eq(productionRuns.id, runId))
  )[0];
  if (!run || run.jobId !== job.id || run.episodeId !== job.episodeId)
    throw new Error("AUTOMATION_RUN_MISMATCH");
  const profile = automationProfileSchema.parse(run.snapshot.profile);
  const input = job.input as Record<string, unknown>;
  if (
    input.importId !== profile.importId ||
    input.episodeId !== run.episodeId ||
    input.episodeRevision !== 1 ||
    input.generationInstructions !== profile.instructions ||
    input.maxTotalEstimatedUsd !== profile.maxEstimatedUsd
  )
    throw new Error("AUTOMATION_SNAPSHOT_MISMATCH");
  await heartbeat(job);
  if (run.exportId) return { runId, exportId: run.exportId };
  for (const [id, kind, checksum] of [
    [profile.imageId, "background", run.snapshot.assetChecksums.image],
    [profile.musicId, "audio", run.snapshot.assetChecksums.music],
  ] as const) {
    if (id && (await checkedAsset(id, kind)).checksum !== checksum)
      throw new Error("ASSET_CHECKSUM_MISMATCH");
  }
  if (!run.compositionId) {
    const episode = (
      await db.select().from(episodes).where(eq(episodes.id, run.episodeId))
    )[0];
    if (episode.revision !== 1) throw new Error("EPISODE_REVISION_CHANGED");
    if (
      (
        await db
          .select()
          .from(episodeScriptDrafts)
          .where(eq(episodeScriptDrafts.episodeId, run.episodeId))
      ).length
    )
      throw new Error("AUTOMATION_MANUAL_WORK_PRESENT");
    let script = (
      await db
        .select()
        .from(scriptRevisions)
        .where(eq(scriptRevisions.jobId, job.id))
    )[0];
    if (!script) {
      await progress(
        job,
        "Drafting from the saved profile and canonical sources",
      );
      const result = await draft(job);
      script = (
        await db
          .select()
          .from(scriptRevisions)
          .where(eq(scriptRevisions.id, result.scriptId))
      )[0];
    }
    if (
      !script ||
      script.episodeId !== run.episodeId ||
      script.importId !== profile.importId ||
      script.model !== profile.model
    )
      throw new Error("AUTOMATION_SCRIPT_MISMATCH");
    const workspace = (
      await db
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, run.episodeId))
    )[0];
    if (
      !workspace ||
      workspace.selectedScriptId !== script.id ||
      workspace.selectedCompositionId ||
      workspace.selectedVoiceTakeId
    )
      throw new Error("AUTOMATION_MANUAL_WORK_PRESENT");
    await progress(job, "Preparing reading cards and both private formats");
    const composition = await saveComposition(
      run.episodeId,
      {
        selectionRevision: workspace.revision,
        scriptId: script.id,
        mode: "text",
        background: profile.background,
        narrationVolume: 0,
        readingWpm: profile.readingWpm,
        imageId: profile.imageId,
        musicId: profile.musicId,
        musicVolume: profile.musicVolume,
      },
      { job, runId },
    );
    run = { ...run, scriptId: script.id, compositionId: composition.id };
  }
  const { compositions } = await import("../db/schema");
  const composition = (
    await db
      .select()
      .from(compositions)
      .where(eq(compositions.id, run.compositionId!))
  )[0];
  const result = await render({
    ...job,
    input: {
      compositionId: composition.id,
      compositionChecksum: composition.checksum,
      format: "both",
    },
  });
  await db.transaction(async (tx) => {
    const owned = (
      await tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, job.id),
            eq(jobs.owner, job.owner!),
            eq(jobs.status, "running"),
            sql`${jobs.leaseUntil}>now()`,
          ),
        )
        .for("update")
    )[0];
    if (!owned) throw new Error("JOB_LEASE_LOST");
    await tx
      .update(productionRuns)
      .set({ exportId: result.exportId })
      .where(eq(productionRuns.id, runId));
  });
  await progress(job, "Both private drafts are ready for creator review");
  return { runId, exportId: result.exportId };
}
