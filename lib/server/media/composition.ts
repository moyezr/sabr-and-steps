import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  captionTracks,
  compositions,
  episodeWorkspaceStates,
  episodes,
  scriptRevisions,
  voiceTakes,
} from "../db/schema";
import {
  compositionSchema,
  cueSchema,
  validateCues,
  readingCues,
} from "../../domain/media";
import { scriptBlockSchema } from "../../domain/script";
import { checkedAsset } from "./assets";
import { digest } from "../hash";
export const compositionInputSchema = z.object({
  selectionRevision: z.number().int().positive(),
  scriptId: z.string().uuid(),
  voiceTakeId: z.string().uuid().nullable().optional(),
  captionTrackId: z.string().uuid().nullable().optional(),
  background: z.enum(["forest", "dusk", "sand"]),
  narrationVolume: z.number().min(0).max(1),
  mode: z.enum(["narrated", "text"]).default("narrated"),
  readingWpm: z.number().min(70).max(180).default(110),
  imageId: z.string().uuid().nullable().default(null),
  imageDim: z.number().min(0.2).max(0.85).default(0.45),
  imagePosition: z.number().min(0).max(100).default(50),
  musicId: z.string().uuid().nullable().default(null),
  musicVolume: z.number().min(0).max(1).default(0.2),
  musicLoop: z.boolean().default(true),
  musicFade: z.number().min(0).max(10).default(3),
});
export async function saveComposition(episodeId: string, input: unknown) {
  const data = compositionInputSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const episode = (
      await tx
        .select()
        .from(episodes)
        .where(eq(episodes.id, episodeId))
        .for("update")
    )[0];
    if (!episode) throw new Error("EPISODE_NOT_FOUND");
    const requestedScript = (
      await tx
        .select()
        .from(scriptRevisions)
        .where(
          and(
            eq(scriptRevisions.id, data.scriptId),
            eq(scriptRevisions.episodeId, episodeId),
          ),
        )
    )[0];
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspace.revision !== data.selectionRevision)
      throw new Error("MEDIA_SELECTION_CONFLICT");
    const fallback = workspace?.selectedScriptId
      ? undefined
      : (
          await tx
            .select({ id: scriptRevisions.id })
            .from(scriptRevisions)
            .where(eq(scriptRevisions.episodeId, episodeId))
            .orderBy(desc(scriptRevisions.createdAt), desc(scriptRevisions.id))
            .limit(1)
        )[0];
    if (
      !requestedScript ||
      (workspace?.selectedScriptId || fallback?.id) !== requestedScript.id ||
      requestedScript.episodeRevision !== episode.revision
    )
      throw new Error("SCRIPT_REVISION_CHANGED");
    const script = requestedScript;
    const imageAsset = data.imageId
      ? await checkedAsset(data.imageId, "image")
      : null;
    const musicAsset = data.musicId
      ? await checkedAsset(data.musicId, "audio")
      : null;
    let take: typeof voiceTakes.$inferSelect | undefined;
    let track: typeof captionTracks.$inferSelect | undefined;
    let cues;
    let duration;
    if (data.mode === "narrated") {
      if (!data.voiceTakeId || !data.captionTrackId)
        throw new Error("NARRATION_REQUIRED");
      take = (
        await tx
          .select()
          .from(voiceTakes)
          .where(eq(voiceTakes.id, data.voiceTakeId))
      )[0];
      if (
        !take ||
        take.scriptId !== script.id ||
        workspace.selectedVoiceTakeId !== take.id
      )
        throw new Error("VOICE_REVISION_CHANGED");
      track = (
        await tx
          .select()
          .from(captionTracks)
          .where(eq(captionTracks.voiceTakeId, take.id))
          .orderBy(desc(captionTracks.createdAt))
          .limit(1)
      )[0];
      if (
        !track ||
        track.id !== data.captionTrackId ||
        workspace.selectedCaptionTrackId !== track.id
      )
        throw new Error("CAPTION_REVISION_CHANGED");
      cues = z.array(cueSchema).parse(track.cues);
      validateCues(cues, take.duration);
      duration = take.duration + 0.6;
    } else {
      cues = readingCues(
        z.array(scriptBlockSchema).parse(script.blocks),
        data.readingWpm,
      );
      duration = cues[cues.length - 1].end + 0.6;
    }
    const snapshot = (a: NonNullable<typeof imageAsset>) => ({
      id: a.id,
      url: `/api/assets/${a.id}`,
      checksum: a.checksum,
      name: a.name,
      provenance: a.provenance,
    });
    const composition = compositionSchema.parse({
      version: 2,
      title: script.title,
      scriptChecksum: script.checksum,
      voiceChecksum: take?.checksum || "",
      captionChecksum: track?.checksum || digest(cues),
      duration,
      fps: 30,
      cues,
      audioUrl: take ? `/api/media/${take.id}` : "",
      background: data.background,
      ambience: "none",
      ambienceVolume: 0,
      narrationVolume: data.narrationVolume,
      mode: data.mode,
      readingWpm: data.readingWpm,
      image: imageAsset
        ? {
            ...snapshot(imageAsset),
            mime: imageAsset.mime,
            width: imageAsset.width,
            height: imageAsset.height,
          }
        : null,
      imageDim: data.imageDim,
      imagePosition: data.imagePosition,
      music: musicAsset
        ? { ...snapshot(musicAsset), duration: musicAsset.duration }
        : null,
      musicVolume: data.musicVolume,
      musicLoop: data.musicLoop,
      musicFade: data.musicFade,
      draft: true,
      attribution: take
        ? `Narration: ${take.provider === "elevenlabs" ? "elevenlabs.io" : take.provider} · Original reflection; quotation attributed on screen`
        : "Original reflection · Quotation attributed on screen",
    });
    const checksum = digest({ episodeId, composition });
    const saved = (
      await tx
        .insert(compositions)
        .values({
          episodeId,
          scriptId: script.id,
          voiceTakeId: take?.id || null,
          captionTrackId: track?.id || null,
          data: composition,
          checksum,
        })
        .returning()
    )[0];
    const selected = (
      await tx
        .update(episodeWorkspaceStates)
        .set({
          selectedCompositionId: saved.id,
          revision: workspace.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWorkspaceStates.episodeId, episodeId),
            eq(episodeWorkspaceStates.revision, data.selectionRevision),
          ),
        )
        .returning({ episodeId: episodeWorkspaceStates.episodeId })
    )[0];
    if (!selected) throw new Error("MEDIA_SELECTION_CONFLICT");
    return saved;
  });
}
export async function validateCurrentComposition(id: string) {
  const db = getDb();
  const c = (
    await db.select().from(compositions).where(eq(compositions.id, id))
  )[0];
  if (!c) throw new Error("COMPOSITION_NOT_FOUND");
  const episode = (
    await db.select().from(episodes).where(eq(episodes.id, c.episodeId))
  )[0];
  const workspace = (
    await db
      .select()
      .from(episodeWorkspaceStates)
      .where(eq(episodeWorkspaceStates.episodeId, c.episodeId))
  )[0];
  const fallback = workspace?.selectedScriptId
    ? undefined
    : (
        await db
          .select({ id: scriptRevisions.id })
          .from(scriptRevisions)
          .where(eq(scriptRevisions.episodeId, c.episodeId))
          .orderBy(desc(scriptRevisions.createdAt), desc(scriptRevisions.id))
          .limit(1)
      )[0];
  const selectedScriptId = workspace?.selectedScriptId || fallback?.id;
  const selectedScript = selectedScriptId
    ? (
        await db
          .select({ episodeRevision: scriptRevisions.episodeRevision })
          .from(scriptRevisions)
          .where(eq(scriptRevisions.id, selectedScriptId))
      )[0]
    : undefined;
  const data = compositionSchema.parse(c.data);
  if (
    !episode ||
    workspace?.selectedCompositionId !== c.id ||
    selectedScriptId !== c.scriptId ||
    selectedScript?.episodeRevision !== episode.revision
  )
    throw new Error("COMPOSITION_STALE");
  if (data.mode === "text") {
    if (c.voiceTakeId || c.captionTrackId || data.audioUrl)
      throw new Error("COMPOSITION_INVALID");
    return c;
  }
  if (!c.voiceTakeId || !c.captionTrackId) throw new Error("COMPOSITION_STALE");
  if (
    selectedScriptId !== c.scriptId ||
    workspace?.selectedVoiceTakeId !== c.voiceTakeId ||
    workspace?.selectedCaptionTrackId !== c.captionTrackId
  )
    throw new Error("COMPOSITION_STALE");
  return c;
}
