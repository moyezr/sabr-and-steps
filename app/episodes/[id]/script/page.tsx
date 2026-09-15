import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { writingState } from "@/lib/server/writing/state";
import { ScriptWorkspace } from "@/components/script-workspace";
export const dynamic = "force-dynamic";
export default async function ScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  let initial;
  try {
    initial = await writingState(id);
  } catch {
    return (
      <section className="empty-state panel">
        <h1>Writing is unavailable.</h1>
        <p>Check the database and reopen the episode.</p>
        <Link href={`/episodes/${id}`}>Back to brief</Link>
      </section>
    );
  }
  return <ScriptWorkspace initial={initial} />;
}
