import { notFound, redirect } from "next/navigation";
import { episodeIdSchema } from "@/lib/domain/episode";
import { workspaceHref } from "@/lib/domain/workspace";
import { getEpisodeWorkspace } from "@/lib/server/workspace/state";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!episodeIdSchema.safeParse(id).success) notFound();
  let workspace;
  try {
    workspace = await getEpisodeWorkspace(id);
  } catch (error) {
    if (error instanceof Error && error.message === "EPISODE_NOT_FOUND")
      notFound();
    // The parent layout displays the database recovery state.
    return null;
  }
  redirect(workspaceHref(id, workspace.defaultSection));
}
