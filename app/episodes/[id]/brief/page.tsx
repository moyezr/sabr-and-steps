import { notFound } from "next/navigation";
import Link from "next/link";
import { EpisodeEditor } from "@/components/episode-editor";
import { episodeIdSchema } from "@/lib/domain/episode";
import { findEpisode } from "@/lib/server/db/episodes";
import { ideaAssistanceState } from "@/lib/server/ideas/suggestions";

export const dynamic = "force-dynamic";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!episodeIdSchema.safeParse(id).success) notFound();
  let episode;
  try {
    episode = await findEpisode(id);
  } catch {
    return (
      <section className="empty-state panel">
        <h2>The idea is temporarily unavailable.</h2>
        <p>Check the database connection and reopen this section. Your saved idea is still stored.</p>
        <Link href={`/episodes/${id}/brief`} className="text-link">Reopen idea</Link>
      </section>
    );
  }
  if (!episode) notFound();
  let ideaAssistance: Awaited<ReturnType<typeof ideaAssistanceState>> | null =
    null;
  try {
    ideaAssistance = await ideaAssistanceState(id);
  } catch {
    // Keep the saved episode open if idea-assistance history is unavailable.
  }
  return (
    <EpisodeEditor
      key={id}
      episode={episode}
      ideaAssistance={ideaAssistance ?? { suggestions: [], jobs: [] }}
      ideaAssistanceUnavailable={!ideaAssistance}
    />
  );
}
