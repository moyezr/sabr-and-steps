import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  voiceTakes,
  captionTracks,
  compositions,
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
  const ids = writing.scripts.map((s) => s.id);
  const takes = ids.length
    ? await db
        .select()
        .from(voiceTakes)
        .where(inArray(voiceTakes.scriptId, ids))
        .orderBy(desc(voiceTakes.createdAt))
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
        .orderBy(desc(captionTracks.createdAt))
    : [];
  const saved = await db
    .select()
    .from(compositions)
    .where(eq(compositions.episodeId, episodeId))
    .orderBy(desc(compositions.createdAt));
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
        .orderBy(desc(videoExports.createdAt))
    : [];
  return {
    ...writing,
    assets: await listAssets(),
    takes: takes.map((t) => ({
      id: t.id,
      scriptId: t.scriptId,
      provider: t.provider,
      voiceName: t.voiceName,
      duration: t.duration,
      reviewState: t.reviewState,
      purpose: t.purpose,
      audioUrl: `/api/media/${t.id}`,
      stale:
        t.scriptId !== selectedScript?.id ||
        selectedScript?.episodeRevision !== writing.episode.revision,
    })),
    tracks: tracks.map((t) => ({
      id: t.id,
      voiceTakeId: t.voiceTakeId,
      cues: z.array(cueSchema).parse(t.cues),
      reviewState: t.reviewState,
    })),
    compositions: saved.map((c) => ({
      id: c.id,
      scriptId: c.scriptId,
      voiceTakeId: c.voiceTakeId,
      captionTrackId: c.captionTrackId,
      data: compositionSchema.parse(c.data),
      reviewState: c.reviewState,
      stale:
        (c.voiceTakeId !== null &&
          c.voiceTakeId !== takes.find((t) => t.scriptId === c.scriptId)?.id) ||
        c.scriptId !== selectedScript?.id ||
        selectedScript?.episodeRevision !== writing.episode.revision ||
        (c.captionTrackId !== null &&
          tracks.find((t) => t.voiceTakeId === c.voiceTakeId)?.id !==
            c.captionTrackId),
    })),
    exports: exports.map((e) => ({
      id: e.id,
      compositionId: e.compositionId,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
export type MediaState = Awaited<ReturnType<typeof mediaState>>;
