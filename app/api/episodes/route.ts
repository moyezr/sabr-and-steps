import { episodeInputSchema } from "@/lib/domain/episode";
import { createEpisode } from "@/lib/server/db/episodes";
import {
  mutationAllowed,
  readJson,
  unavailableResponse,
} from "@/lib/server/http";

export async function POST(request: Request) {
  if (!mutationAllowed(request))
    return Response.json(
      { error: "Request origin not allowed." },
      { status: 403 },
    );
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return Response.json({ error: "Send a valid episode." }, { status: 400 });
  }
  const input = episodeInputSchema.safeParse(body);
  if (!input.success)
    return Response.json(
      { error: input.error.issues[0].message },
      { status: 422 },
    );
  try {
    return Response.json(
      { episode: await createEpisode(input.data) },
      { status: 201 },
    );
  } catch {
    return unavailableResponse();
  }
}
