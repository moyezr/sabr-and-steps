import { notFound } from "next/navigation";
import Link from "next/link";
import { EpisodeEditor } from "@/components/episode-editor";
import { episodeIdSchema } from "@/lib/domain/episode";
import { findEpisode } from "@/lib/server/db/episodes";

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
  return <EpisodeEditor key={id} episode={episode} />;
}
