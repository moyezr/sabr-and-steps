import { z } from "zod";
import { scriptSourceQuerySchema } from "@/lib/domain/script-sources";
import { findEpisode } from "@/lib/server/db/episodes";
import { browseSources, listSourceImports } from "@/lib/server/db/sources";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Episode not found." }, { status: 404 });

  const search = new URL(request.url).searchParams;
  const query = scriptSourceQuerySchema.safeParse({
    importId: search.get("importId"),
    q: search.get("q") || undefined,
    chapter: search.get("chapter") || undefined,
    reference: search.get("reference") || undefined,
    page: search.get("page") || undefined,
  });
  if (!query.success)
    return Response.json(
      { error: "Use a completed edition and valid source search filters." },
      { status: 422 },
    );

  try {
    const [episode, imports] = await Promise.all([
      findEpisode(id),
      listSourceImports(),
    ]);
    if (!episode)
      return Response.json({ error: "Episode not found." }, { status: 404 });
    const edition = imports.find((item) => item.id === query.data.importId);
    if (!edition)
      return Response.json({ error: "Edition not found." }, { status: 404 });
    if (edition.status !== "completed")
      return Response.json(
        { error: "This source import is not complete." },
        { status: 409 },
      );
    const sources = await browseSources(edition.id, query.data);
    return Response.json(
      {
        rows: sources.rows.map((row) => ({
          id: row.id,
          reference: row.reference,
          text: row.text,
          chapter: row.chapter,
          verse: row.verse,
          chapterName: row.chapterName,
        })),
        total: sources.total,
        chapters: sources.chapters,
        referenceFound: sources.referenceFound,
        edition: {
          id: edition.id,
          name: edition.name,
          author: edition.author,
          coverage: edition.expectedChapters,
          environment: edition.environment,
          rightsStatus: edition.rightsStatus,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Saved sources are unavailable. Try again." },
      { status: 503 },
    );
  }
}
