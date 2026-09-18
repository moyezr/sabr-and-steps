import { z } from "zod";
import { randomUUID } from "node:crypto";
import { writingState } from "@/lib/server/writing/state";
import { findEpisode } from "@/lib/server/db/episodes";
import { enqueueJob, retryJob } from "@/lib/server/jobs/store";
import { saveDraft, reviewDraft } from "@/lib/server/writing/drafts";
import { mutationAllowed, readJson } from "@/lib/server/http";
import {
  autosaveWorkingDraft,
  checkpointWorkingDraft,
  discardWorkingDraft,
  restoreScriptVersion,
  selectScriptVersion,
} from "@/lib/server/writing/versions";
const idSchema = z.string().uuid();
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return Response.json({ error: "Episode not found" }, { status: 404 });
  try {
    return Response.json(await writingState(id));
  } catch {
    return Response.json(
      { error: "Writing workspace unavailable" },
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
  if (!idSchema.safeParse(id).success)
    return Response.json({ error: "Episode not found" }, { status: 404 });
  try {
    const body = z
      .object({
        action: z.enum([
          "generate",
          "autosave",
          "select",
          "checkpoint",
          "discard",
          "restore",
          "save",
          "review",
          "retry",
        ]),
        data: z.unknown(),
      })
      .parse(await readJson(request));
    if (body.action === "generate") {
      const input = z
        .object({
          importId: idSchema,
          episodeRevision: z.number().int().positive(),
          generationInstructions: z.string().max(2000).default(""),
        })
        .parse(body.data);
      const episode = await findEpisode(id);
      if (!episode || episode.revision !== input.episodeRevision)
        return Response.json(
          { error: "Episode changed. Reload before generating." },
          { status: 409 },
        );
      const job = await enqueueJob(
        "draft",
        {
          episodeId: id,
          episodeRevision: episode.revision,
          importId: input.importId,
          requestId: randomUUID(),
          generationInstructions: input.generationInstructions,
        },
        id,
      );
      return Response.json({ jobId: job.id }, { status: 202 });
    }
    if (body.action === "autosave")
      await autosaveWorkingDraft(id, body.data);
    if (body.action === "select") await selectScriptVersion(id, body.data);
    if (body.action === "checkpoint")
      await checkpointWorkingDraft(id, body.data);
    if (body.action === "discard") await discardWorkingDraft(id, body.data);
    if (body.action === "restore")
      await restoreScriptVersion(id, body.data);
    if (body.action === "save") await saveDraft(id, body.data);
    if (body.action === "review") {
      const data = z
        .object({
          scriptId: idSchema,
          checksum: z.string().length(64),
          notes: z.string().max(2000),
        })
        .parse(body.data);
      await reviewDraft(id, data.scriptId, data.checksum, data.notes);
    }
    if (body.action === "retry") {
      const data = z.object({ jobId: idSchema }).parse(body.data);
      const state = await writingState(id);
      if (!state.jobs.some((j) => j.id === data.jobId))
        throw new Error("JOB_NOT_FOUND");
      await retryJob(data.jobId);
    }
    return Response.json(await writingState(id));
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Invalid writing request" },
        { status: 422 },
      );
    const message =
      error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "WRITING_UNAVAILABLE";
    return Response.json(
      { error: message },
      {
        status:
          message.includes("CONFLICT") ||
          message.includes("CHANGED") ||
          message.includes("DRAFT_EXISTS") ||
          message.includes("DRAFT_NOT_FOUND")
            ? 409
            : 503,
      },
    );
  }
}
