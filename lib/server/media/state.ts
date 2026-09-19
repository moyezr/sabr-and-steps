import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  voiceTakes,
  captionTracks,
  compositions,
  episodeWorkspaceStates,
  videoExports,
} from "../db/schema";
import { listAssets } from "./assets";
import { writingState } from "../writing/state";
import { cueSchema, compositionSchema } from "../../domain/media";
export async function mediaState(episodeId: string) {
  const writing = await writingState(episodeId);
  const selectedScript = writing.scripts.find(
    (script) => script.id === writing.selectedScriptId,
  );
  const db = getDb();
  const workspace = (
    await db
      .select()
      .from(episodeWorkspaceStates)
      .where(eq(episodeWorkspaceStates.episodeId, episodeId))
  )[0];
  const ids = writing.scripts.map((s) => s.id);
  const takes = ids.length
    ? await db
        .select()
        .from(voiceTakes)
        .where(inArray(voiceTakes.scriptId, ids))
        .orderBy(desc(voiceTakes.createdAt), desc(voiceTakes.id))
    : [];
  const tracks = takes.length
    ? await db
        .select()
        .from(captionTracks)
        .where(
          inArray(
            captionTracks.voiceTakeId,
            takes.map((t) => t.id),
          ),
        )
        .orderBy(desc(captionTracks.createdAt), desc(captionTracks.id))
    : [];
  const saved = await db
    .select()
    .from(compositions)
    .where(eq(compositions.episodeId, episodeId))
    .orderBy(desc(compositions.createdAt), desc(compositions.id));
  const exports = saved.length
    ? await db
        .select()
        .from(videoExports)
        .where(
          inArray(
            videoExports.compositionId,
            saved.map((c) => c.id),
          ),
        )
        .orderBy(desc(videoExports.createdAt), desc(videoExports.id))
    : [];
  return {
    ...writing,
    selectionRevision: workspace?.revision || writing.selectionRevision,
    selectedVoiceTakeId: workspace?.selectedVoiceTakeId || null,
    selectedCaptionTrackId: workspace?.selectedCaptionTrackId || null,
    selectedCompositionId: workspace?.selectedCompositionId || null,
    assets: await listAssets(),
    takes: takes.map((t) => ({
      id: t.id,
      scriptId: t.scriptId,
      provider: t.provider,
      model: t.model,
      voiceName: t.voiceName,
      settings: t.settings,
      duration: t.duration,
      reviewState: t.reviewState,
      purpose: t.purpose,
      audioUrl: `/api/media/${t.id}`,
      createdAt: t.createdAt.toISOString(),
      stale:
        t.scriptId !== selectedScript?.id ||
        selectedScript?.episodeRevision !== writing.episode.revision,
    })),
    tracks: tracks.map((t) => ({
      id: t.id,
      voiceTakeId: t.voiceTakeId,
      parentId: t.parentId,
      cues: z.array(cueSchema).parse(t.cues),
      reviewState: t.reviewState,
      createdAt: t.createdAt.toISOString(),
      stale: t.voiceTakeId !== workspace?.selectedVoiceTakeId,
    })),
    compositions: saved.map((c) => ({
      id: c.id,
      scriptId: c.scriptId,
      voiceTakeId: c.voiceTakeId,
      captionTrackId: c.captionTrackId,
      data: compositionSchema.parse(c.data),
      reviewState: c.reviewState,
      createdAt: c.createdAt.toISOString(),
      stale:
        (c.voiceTakeId !== null &&
          c.voiceTakeId !== workspace?.selectedVoiceTakeId) ||
        c.scriptId !== selectedScript?.id ||
        selectedScript?.episodeRevision !== writing.episode.revision ||
        (c.captionTrackId !== null &&
          workspace?.selectedCaptionTrackId !== c.captionTrackId),
    })),
    exports: exports.map((e) => ({
      id: e.id,
      compositionId: e.compositionId,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
export type MediaState = Awaited<ReturnType<typeof mediaState>>;
