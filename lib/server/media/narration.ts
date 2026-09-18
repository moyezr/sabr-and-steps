import "server-only";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../db/client";
import {
  scriptRevisions,
  episodeWorkspaceStates,
  episodes,
  sourceImports,
  voiceTakes,
  captionTracks,
} from "../db/schema";
import {
  narrationInputSchema,
  alignmentSchema,
  cuesFromAlignment,
  validateCues,
} from "../../domain/media";
import { scriptBlockSchema, narrationText } from "../../domain/script";
import { elevenSpeech } from "../providers/elevenlabs";
import { type Job, progress } from "../jobs/store";
import { dataPath } from "../jobs/files";
import { digest } from "../hash";
import { probeMedia } from "./probe";
export async function createNarration(job: Job) {
  const input = narrationInputSchema.parse(job.input);
  const db = getDb();
  const script = (
    await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.id, input.scriptId))
  )[0];
  if (!script) throw new Error("SCRIPT_NOT_FOUND");
  const episode = (
    await db.select().from(episodes).where(eq(episodes.id, script.episodeId))
  )[0];
  if (!episode || episode.revision !== script.episodeRevision)
    throw new Error("EPISODE_REVISION_CHANGED");
  const workspace = (
    await db
      .select({ selectedScriptId: episodeWorkspaceStates.selectedScriptId })
      .from(episodeWorkspaceStates)
      .where(eq(episodeWorkspaceStates.episodeId, episode.id))
  )[0];
  const fallback = workspace?.selectedScriptId
    ? undefined
    : (
        await db
          .select({ id: scriptRevisions.id })
            .from(scriptRevisions)
            .where(eq(scriptRevisions.episodeId, episode.id))
            .orderBy(desc(scriptRevisions.createdAt), desc(scriptRevisions.id))
          .limit(1)
      )[0];
  if ((workspace?.selectedScriptId || fallback?.id) !== script.id)
    throw new Error("SCRIPT_REVISION_CHANGED");
  if (
    episode.narrationProvider !== "auto" &&
    episode.narrationProvider !== input.provider &&
    !input.providerOverride
  )
    throw new Error("PINNED_PROVIDER_MISMATCH");
  if (input.reviewMode === "stages" && script.reviewState !== "reviewed")
    throw new Error("SCRIPT_REVIEW_REQUIRED");
  const edition = (
    await db
      .select()
      .from(sourceImports)
      .where(eq(sourceImports.id, script.importId))
  )[0];
  if (
    input.purpose === "publish" &&
    (edition.rightsStatus !== "cleared" || script.reviewState !== "reviewed")
  )
    throw new Error("PUBLICATION_REVIEW_REQUIRED");
  if (input.provider !== "elevenlabs")
    throw new Error("PROVIDER_QUOTA_VERIFICATION_REQUIRED");
  const blocks = z.array(scriptBlockSchema).parse(script.blocks);
  const transcript = narrationText(blocks);
  await progress(
    job,
    "Verifying included speech credits and generating the selected voice",
  );
  const result = await elevenSpeech(
    job,
    transcript,
    input.voiceId,
    input.settings,
    input.purpose,
  );
  const response = z
    .object({
      audio_base64: z.string().min(1),
      alignment: alignmentSchema.nullable(),
      normalized_alignment: alignmentSchema.nullable().optional(),
    })
    .parse(result.response);
  const audio = new Uint8Array(Buffer.from(response.audio_base64, "base64"));
  if (audio.length < 1000) throw new Error("SPEECH_AUDIO_INVALID");
  const audioPath = `audio/${job.id}/narration.mp3`;
  const target = dataPath(audioPath);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target + ".tmp", audio, { mode: 0o600 });
  await rename(target + ".tmp", target);
  const probe = await probeMedia(target);
  if (probe.duration > 300) throw new Error("NARRATION_TOO_LONG");
  const checksum = createHash("sha256").update(audio).digest("hex");
  const previous = (
    await db.select().from(voiceTakes).where(eq(voiceTakes.jobId, job.id))
  )[0];
  const take =
    previous ||
    (
      await db
        .insert(voiceTakes)
        .values({
          scriptId: script.id,
          jobId: job.id,
          provider: input.provider,
          model: "eleven_multilingual_v2",
          voiceId: input.voiceId,
          voiceName: result.voice.name,
          settings: input.settings,
          purpose: input.purpose,
          transcript,
          audioPath,
          duration: probe.duration,
          checksum,
          rights: {
            ...result.account,
            sourceRightsStatus: edition.rightsStatus,
            scriptReviewState: script.reviewState,
            reviewMode: input.reviewMode,
            attribution: "elevenlabs.io",
          },
          alignment: response.alignment || {
            error: "ALIGNMENT_TIMESTAMPS_MISSING",
          },
        })
        .returning()
    )[0];
  if (!response.alignment) throw new Error("ALIGNMENT_TIMESTAMPS_MISSING");
  const cues = cuesFromAlignment(blocks, response.alignment);
  validateCues(cues, probe.duration);
  const existing = (
    await db
      .select()
      .from(captionTracks)
      .where(eq(captionTracks.voiceTakeId, take.id))
  )[0];
  const track =
    existing ||
    (
      await db
        .insert(captionTracks)
        .values({ voiceTakeId: take.id, cues, checksum: digest(cues) })
        .returning()
    )[0];
  return {
    voiceTakeId: take.id,
    captionTrackId: track.id,
    duration: probe.duration,
  };
}
export async function saveCaptionTiming(
  voiceTakeId: string,
  parentId: string,
  changes: { start: number; end: number }[],
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const take = (
      await tx
        .select()
        .from(voiceTakes)
        .where(eq(voiceTakes.id, voiceTakeId))
        .for("update")
    )[0];
    if (!take) throw new Error("VOICE_TAKE_NOT_FOUND");
    const latest = (
      await tx
        .select()
        .from(captionTracks)
        .where(eq(captionTracks.voiceTakeId, voiceTakeId))
        .orderBy(desc(captionTracks.createdAt))
        .limit(1)
    )[0];
    if (!latest || latest.id !== parentId)
      throw new Error("CAPTION_REVISION_CONFLICT");
    const { cueSchema } = await import("../../domain/media");
    const cues = z.array(cueSchema).parse(latest.cues);
    if (changes.length !== cues.length)
      throw new Error("CAPTION_COUNT_CHANGED");
    const updated = cues.map((c, i) => ({ ...c, ...changes[i] }));
    validateCues(updated, take.duration);
    return (
      await tx
        .insert(captionTracks)
        .values({
          voiceTakeId,
          parentId,
          cues: updated,
          checksum: digest(updated),
        })
        .returning()
    )[0];
  });
}
