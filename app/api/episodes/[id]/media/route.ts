import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mediaState } from "@/lib/server/media/state";
import { saveCaptionTiming } from "@/lib/server/media/narration";
import {
  saveComposition,
  validateCurrentComposition,
} from "@/lib/server/media/composition";
import { narrationInputSchema } from "@/lib/domain/media";
import {
  elevenAccountAvailability as elevenAccount,
  elevenVoices,
} from "@/lib/server/providers/elevenlabs";
import { enqueueJob, retryJob } from "@/lib/server/jobs/store";
import { mutationAllowed, readJson } from "@/lib/server/http";
import {
  selectCaptionTrack,
  selectComposition,
  selectVoiceTake,
} from "@/lib/server/media/selections";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    if (new URL(request.url).searchParams.get("voices") === "elevenlabs") {
      const [account, voices] = await Promise.all([
        elevenAccount(),
        elevenVoices(),
      ]);
      return Response.json({ account, voices });
    }
    return Response.json(await mediaState(id));
  } catch {
    return Response.json(
      { error: "Media or provider account unavailable" },
      { status: 503 },
    );
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!mutationAllowed(request))
    return Response.json(
      { error: "Request origin not allowed" },
      { status: 403 },
    );
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const { action, data } = z
      .object({
        action: z.enum([
          "narrate",
          "timing",
          "compose",
          "render",
          "retry",
          "selectVoice",
          "selectCaption",
          "selectComposition",
        ]),
        data: z.unknown(),
      })
      .parse(await readJson(request));
    const state = await mediaState(id);
    if (action === "narrate") {
      const input = narrationInputSchema.parse(data);
      if (!state.scripts.some((s) => s.id === input.scriptId))
        throw new Error("SCRIPT_NOT_FOUND");
      const job = await enqueueJob(
        "narration",
        { ...input, requestId: randomUUID() },
        id,
      );
      return Response.json({ jobId: job.id }, { status: 202 });
    }
    if (action === "selectVoice") await selectVoiceTake(id, data);
    if (action === "selectCaption") await selectCaptionTrack(id, data);
    if (action === "selectComposition") await selectComposition(id, data);
    if (action === "timing") {
      const input = z
        .object({
          voiceTakeId: z.string().uuid(),
          parentId: z.string().uuid(),
          selectionRevision: z.number().int().positive(),
          changes: z
            .array(z.object({ start: z.number(), end: z.number() }))
            .max(1000),
        })
        .parse(data);
      if (!state.takes.some((t) => t.id === input.voiceTakeId))
        throw new Error("VOICE_NOT_FOUND");
      await saveCaptionTiming(
        id,
        input.voiceTakeId,
        input.parentId,
        input.selectionRevision,
        input.changes,
      );
    }
    if (action === "compose") await saveComposition(id, data);
    if (action === "render") {
      const { compositionId } = z
        .object({ compositionId: z.string().uuid() })
        .parse(data);
      if (!state.compositions.some((c) => c.id === compositionId))
        throw new Error("COMPOSITION_NOT_FOUND");
      await validateCurrentComposition(compositionId);
      const job = await enqueueJob("render", { compositionId }, id);
      return Response.json({ jobId: job.id }, { status: 202 });
    }
    if (action === "retry") {
      const { jobId } = z.object({ jobId: z.string().uuid() }).parse(data);
      if (!state.jobs.some((j) => j.id === jobId))
        throw new Error("JOB_NOT_FOUND");
      await retryJob(jobId);
    }
    return Response.json(await mediaState(id));
  } catch (e) {
    const error =
      e instanceof z.ZodError
        ? "INVALID_MEDIA_REQUEST"
        : e instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(e.message)
          ? e.message
          : "MEDIA_UNAVAILABLE";
    return Response.json(
      { error },
      {
        status:
          error.includes("CHANGED") ||
          error.includes("STALE") ||
          error.includes("CONFLICT")
            ? 409
            : 422,
      },
    );
  }
}
