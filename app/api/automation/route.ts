import { z } from "zod";
import { mutationAllowed, readJson } from "@/lib/server/http";
import {
  automationState,
  requestProduction,
  retryProduction,
  saveAutomationProfile,
} from "@/lib/server/automation/store";

export async function GET() {
  try {
    return Response.json(await automationState());
  } catch {
    return Response.json(
      { error: "Automation workspace unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!mutationAllowed(request))
    return Response.json(
      { error: "Request origin not allowed" },
      { status: 403 },
    );
  try {
    const { action, data } = z
      .object({
        action: z.enum(["profile", "start", "retry"]),
        data: z.unknown(),
      })
      .parse(await readJson(request));
    if (action === "profile")
      return Response.json(
        { profile: await saveAutomationProfile(data) },
        { status: 201 },
      );
    if (action === "start") {
      const run = await requestProduction(data);
      return Response.json(
        { runId: run.id, episodeId: run.episodeId },
        { status: 202 },
      );
    }
    await retryProduction(
      z.object({ runId: z.string().uuid() }).parse(data).runId,
    );
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Check the profile and topic fields." },
        { status: 422 },
      );
    const code =
      error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "AUTOMATION_UNAVAILABLE";
    return Response.json(
      { error: code },
      {
        status:
          code === "INVALID_BODY"
            ? 422
            : code.includes("NOT_FOUND")
              ? 404
              : code.includes("REUSED") ||
                  code.includes("RECONCILIATION") ||
                  code.includes("RETRY_UNAVAILABLE")
                ? 409
                : 503,
      },
    );
  }
}
