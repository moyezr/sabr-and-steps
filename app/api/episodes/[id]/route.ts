import { episodeIdSchema, episodeUpdateSchema } from "@/lib/domain/episode";
import { updateEpisode } from "@/lib/server/db/episodes";
import {
  mutationAllowed,
  readJson,
  unavailableResponse,
} from "@/lib/server/http";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!mutationAllowed(request))
    return Response.json(
      { error: "Request origin not allowed." },
      { status: 403 },
    );
  const { id } = await context.params;
  if (!episodeIdSchema.safeParse(id).success)
    return Response.json({ error: "Episode not found." }, { status: 404 });
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return Response.json({ error: "Send a valid episode." }, { status: 400 });
  }
  const input = episodeUpdateSchema.safeParse(body);
  if (!input.success)
    return Response.json(
      { error: input.error.issues[0].message },
      { status: 422 },
    );
  const { revision, ...changes } = input.data;
  try {
    const episode = await updateEpisode(id, changes, revision);
    if (!episode)
      return Response.json(
        {
          error:
            "This episode changed in another tab. Copy your changes, then reload before saving.",
        },
        { status: 409 },
      );
    return Response.json({ episode });
  } catch {
    return unavailableResponse();
  }
}
