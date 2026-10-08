import { z } from "zod";
import { mutationAllowed, readJson } from "@/lib/server/http";
import {
  requestScriptRewrite,
  rejectScriptRewrite,
  retryScriptRewrite,
  scriptRewriteState,
} from "@/lib/server/writing/rewrites";

const idSchema = z.string().uuid();
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return Response.json({ error: "Episode not found" }, { status: 404 });
  try {
    return Response.json(await scriptRewriteState(id));
  } catch {
    return Response.json(
      { error: "Rewrite history is temporarily unavailable" },
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
    const input = z
      .object({
        action: z.enum(["generate", "reject", "retry"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await readJson(request, 64_000));
    if (input.action === "generate") {
      const job = await requestScriptRewrite(id, input.data);
      return Response.json({ jobId: job.id }, { status: 202 });
    }
    if (input.action === "retry") {
      const { jobId } = z
        .object({ jobId: idSchema })
        .strict()
        .parse(input.data);
      const job = await retryScriptRewrite(id, jobId);
      return Response.json({ jobId: job.id }, { status: 202 });
    }
    const { suggestionId } = z
      .object({ suggestionId: idSchema })
      .strict()
      .parse(input.data);
    await rejectScriptRewrite(id, suggestionId);
    return Response.json(await scriptRewriteState(id));
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      (error instanceof Error && error.message === "INVALID_BODY")
    )
      return Response.json(
        { error: "Invalid rewrite request" },
        { status: 422 },
      );
    const code = error instanceof Error ? error.message : "";
    const status = code.includes("NOT_FOUND")
      ? 404
      : /CHANGED|CONFLICT|REUSED|UNCERTAIN/.test(code)
        ? 409
        : 503;
    return Response.json(
      {
        error:
          status === 409
            ? "The selected text or draft changed. Refresh before requesting a rewrite."
            : status === 404
              ? "Episode, script, or rewrite not found"
              : "Rewrite assistance is temporarily unavailable",
      },
      { status },
    );
  }
}
