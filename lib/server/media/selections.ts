import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  captionTracks,
  compositions,
  episodeWorkspaceStates,
  scriptRevisions,
  voiceTakes,
} from "../db/schema";

const selectionInputSchema = z.object({
  selectionRevision: z.number().int().positive(),
});

export const voiceSelectionInputSchema = selectionInputSchema.extend({
  voiceTakeId: z.string().uuid(),
});

export const captionSelectionInputSchema = selectionInputSchema.extend({
  captionTrackId: z.string().uuid(),
});

export const compositionSelectionInputSchema = selectionInputSchema.extend({
  compositionId: z.string().uuid(),
});

export async function selectVoiceTake(episodeId: string, raw: unknown) {
  const input = voiceSelectionInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspace.revision !== input.selectionRevision)
      throw new Error("MEDIA_SELECTION_CONFLICT");
    const take = (
      await tx
        .select({
          id: voiceTakes.id,
          scriptId: voiceTakes.scriptId,
          episodeId: scriptRevisions.episodeId,
        })
        .from(voiceTakes)
        .innerJoin(scriptRevisions, eq(scriptRevisions.id, voiceTakes.scriptId))
        .where(eq(voiceTakes.id, input.voiceTakeId))
    )[0];
    if (!take || take.episodeId !== episodeId)
      throw new Error("VOICE_TAKE_NOT_FOUND");
    if (take.scriptId !== workspace.selectedScriptId)
      throw new Error("VOICE_SCRIPT_MISMATCH");
    if (workspace.selectedVoiceTakeId === take.id) return workspace;
    const updated = (
      await tx
        .update(episodeWorkspaceStates)
        .set({
          selectedVoiceTakeId: take.id,
          revision: workspace.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWorkspaceStates.episodeId, episodeId),
            eq(episodeWorkspaceStates.revision, input.selectionRevision),
          ),
        )
        .returning()
    )[0];
    if (!updated) throw new Error("MEDIA_SELECTION_CONFLICT");
    return updated;
  });
}

export async function selectCaptionTrack(episodeId: string, raw: unknown) {
  const input = captionSelectionInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspace.revision !== input.selectionRevision)
      throw new Error("MEDIA_SELECTION_CONFLICT");
    const track = (
      await tx
        .select({
          id: captionTracks.id,
          voiceTakeId: captionTracks.voiceTakeId,
          scriptId: voiceTakes.scriptId,
          episodeId: scriptRevisions.episodeId,
        })
        .from(captionTracks)
        .innerJoin(voiceTakes, eq(voiceTakes.id, captionTracks.voiceTakeId))
        .innerJoin(scriptRevisions, eq(scriptRevisions.id, voiceTakes.scriptId))
        .where(eq(captionTracks.id, input.captionTrackId))
    )[0];
    if (!track || track.episodeId !== episodeId)
      throw new Error("CAPTION_TRACK_NOT_FOUND");
    if (track.voiceTakeId !== workspace.selectedVoiceTakeId)
      throw new Error("CAPTION_VOICE_MISMATCH");
    if (workspace.selectedCaptionTrackId === track.id) return workspace;
    const updated = (
      await tx
        .update(episodeWorkspaceStates)
        .set({
          selectedCaptionTrackId: track.id,
          revision: workspace.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWorkspaceStates.episodeId, episodeId),
            eq(episodeWorkspaceStates.revision, input.selectionRevision),
          ),
        )
        .returning()
    )[0];
    if (!updated) throw new Error("MEDIA_SELECTION_CONFLICT");
    return updated;
  });
}

export async function selectComposition(episodeId: string, raw: unknown) {
  const input = compositionSelectionInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspace.revision !== input.selectionRevision)
      throw new Error("MEDIA_SELECTION_CONFLICT");
    const composition = (
      await tx
        .select({ id: compositions.id })
        .from(compositions)
        .where(
          and(
            eq(compositions.id, input.compositionId),
            eq(compositions.episodeId, episodeId),
          ),
        )
    )[0];
    if (!composition) throw new Error("COMPOSITION_NOT_FOUND");
    if (workspace.selectedCompositionId === composition.id) return workspace;
    const updated = (
      await tx
        .update(episodeWorkspaceStates)
        .set({
          selectedCompositionId: composition.id,
          revision: workspace.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWorkspaceStates.episodeId, episodeId),
            eq(episodeWorkspaceStates.revision, input.selectionRevision),
          ),
        )
        .returning()
    )[0];
    if (!updated) throw new Error("MEDIA_SELECTION_CONFLICT");
    return updated;
  });
}

/** Selects the first complete narration only when the creator has no voice choice. */
export async function selectFirstNarration(
  episodeId: string,
  scriptId: string,
  voiceTakeId: string,
  captionTrackId: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    if (
      !workspace ||
      workspace.selectedScriptId !== scriptId ||
      workspace.selectedVoiceTakeId
    )
      return workspace || null;
    return (
      await tx
        .update(episodeWorkspaceStates)
        .set({
          selectedVoiceTakeId: voiceTakeId,
          selectedCaptionTrackId: captionTrackId,
          revision: workspace.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWorkspaceStates.episodeId, episodeId),
            eq(episodeWorkspaceStates.revision, workspace.revision),
          ),
        )
        .returning()
    )[0];
  });
}
