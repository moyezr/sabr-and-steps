import Link from "next/link";
import { notFound } from "next/navigation";
import { EpisodeWorkspace } from "@/components/episode-workspace";
import { episodeIdSchema } from "@/lib/domain/episode";
import { getEpisodeWorkspace } from "@/lib/server/workspace/state";

export const dynamic = "force-dynamic";

export default async function EpisodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!episodeIdSchema.safeParse(id).success) notFound();
  let initial;
  try {
    initial = await getEpisodeWorkspace(id);
  } catch (error) {
    if (error instanceof Error && error.message === "EPISODE_NOT_FOUND")
      notFound();
    return (
      <section className="panel empty-panel">
        <h1>The episode workspace is unavailable.</h1>
        <p>
          Check the local database connection and reopen the episode. Saved work
          has not been removed.
        </p>
        <Link href="/" className="text-link">
          Back to episodes
        </Link>
      </section>
    );
  }
  return (
    <EpisodeWorkspace key={id} initial={initial}>
      {children}
    </EpisodeWorkspace>
  );
}
