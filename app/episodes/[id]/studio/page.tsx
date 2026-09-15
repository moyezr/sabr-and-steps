import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { mediaState } from "@/lib/server/media/state";
import { MediaStudio } from "@/components/media-studio";
export const dynamic = "force-dynamic";
export default async function Studio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  let initial;
  try {
    initial = await mediaState(id);
  } catch {
    return (
      <section className="empty-state panel">
        <h1>Studio is unavailable.</h1>
        <p>Check the database and reopen the episode.</p>
        <Link href={`/episodes/${id}`}>Back to brief</Link>
      </section>
    );
  }
  return <MediaStudio initial={initial} />;
}
