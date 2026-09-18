import { episodeIdSchema } from "@/lib/domain/episode";
import { getEpisodeWorkspace } from "@/lib/server/workspace/state";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!episodeIdSchema.safeParse(id).success)
    return Response.json({ error: "Episode not found." }, { status: 404 });
  try {
    return Response.json(await getEpisodeWorkspace(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EPISODE_NOT_FOUND")
      return Response.json({ error: "Episode not found." }, { status: 404 });
    return Response.json(
      { error: "The episode workspace is unavailable. Try again shortly." },
      { status: 503 },
    );
  }
}
