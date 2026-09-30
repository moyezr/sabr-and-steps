import { z } from "zod";
import { mutationAllowed, readJson } from "@/lib/server/http";
import {
  ideaAssistanceState,
  ideaGenerationRequestSchema,
  requestIdeaSuggestions,
  retryIdeaSuggestion,
} from "@/lib/server/ideas/suggestions";

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return Response.json({ error: "Episode not found" }, { status: 404 });
  try {
    return Response.json(await ideaAssistanceState(id));
  } catch (error) {
    if (error instanceof Error && error.message === "EPISODE_NOT_FOUND")
      return Response.json({ error: "Episode not found" }, { status: 404 });
    return Response.json(
      { error: "Idea assistance is temporarily unavailable" },
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
    const body = await readJson(request);
    const { action, data } = z
      .object({
        action: z.enum(["generate", "retry"]),
        data: z.unknown(),
      })
      .strict()
      .parse(body);
    if (action === "generate") {
      const generation = ideaGenerationRequestSchema.parse(data);
      const job = await requestIdeaSuggestions(id, generation);
      return Response.json({ jobId: job.id }, { status: 202 });
    }

    const { jobId } = z.object({ jobId: idSchema }).strict().parse(data);
    const job = await retryIdeaSuggestion(id, jobId);
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Invalid idea assistance request" },
        { status: 422 },
      );
    const code = error instanceof Error ? error.message : "";
    const status =
      code === "EPISODE_NOT_FOUND" || code === "IDEA_JOB_NOT_FOUND"
        ? 404
        : code.includes("CHANGED") ||
            code.includes("CONFLICT") ||
            code.includes("UNCERTAIN") ||
            code.includes("NOT_RETRYABLE") ||
            code.includes("REUSED")
          ? 409
          : 503;
    const publicError =
      status === 404
        ? "Episode or idea job not found"
        : status === 409
          ? "The episode or idea job changed. Refresh and try again."
          : "Idea assistance is temporarily unavailable";
    return Response.json({ error: publicError }, { status });
  }
}
