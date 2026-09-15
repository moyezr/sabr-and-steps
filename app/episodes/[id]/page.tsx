import Link from "next/link";
import { notFound } from "next/navigation";
import { EpisodeEditor } from "@/components/episode-editor";
import { episodeIdSchema } from "@/lib/domain/episode";
import { findEpisode } from "@/lib/server/db/episodes";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
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
      <section className="panel empty-panel">
        <h1>The workspace is offline.</h1>
        <p>
          Start the local database, then reopen your episode. Your saved work is
          still in its database volume.
        </p>
        <Link href="/" className="text-link">
          Back to episodes
        </Link>
      </section>
    );
  }
  if (!episode) notFound();
  return (
    <>
      <nav className="episode-tabs">
        <Link className="active" href={`/episodes/${episode.id}`}>
          The brief
        </Link>
        <Link href={`/episodes/${episode.id}/script`}>Script & sources</Link>
      </nav>
      <EpisodeEditor key={episode.id} episode={episode} />
    </>
  );
}
