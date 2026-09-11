import "server-only";
import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { getDb } from "./client";
import { sourceImports, sourcePassages } from "./schema";
import { parseReference } from "../../domain/source";

export async function listSourceImports() {
  return getDb()
    .select()
    .from(sourceImports)
    .orderBy(desc(sourceImports.createdAt));
}
export async function browseSources(
  importId: string,
  query: { chapter?: number; reference?: string; q?: string; page: number },
) {
  const reference = query.reference ? parseReference(query.reference) : null;
  const filter = and(
    eq(sourcePassages.importId, importId),
    reference
      ? and(
          eq(sourcePassages.chapter, reference.chapter),
          gte(sourcePassages.verse, Math.max(1, reference.verse - 2)),
          lte(sourcePassages.verse, reference.verse + 2),
        )
      : query.chapter
        ? eq(sourcePassages.chapter, query.chapter)
        : undefined,
    !reference && query.q
      ? ilike(sourcePassages.text, `%${query.q.replace(/[\\%_]/g, "\\$&")}%`)
      : undefined,
  );
  const db = getDb();
  const [rows, total, chapters] = await Promise.all([
    db
      .select()
      .from(sourcePassages)
      .where(filter)
      .orderBy(asc(sourcePassages.chapter), asc(sourcePassages.verse))
      .limit(20)
      .offset(reference ? 0 : (query.page - 1) * 20),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourcePassages)
      .where(filter),
    db
      .selectDistinct({
        chapter: sourcePassages.chapter,
        name: sourcePassages.chapterName,
      })
      .from(sourcePassages)
      .where(eq(sourcePassages.importId, importId))
      .orderBy(asc(sourcePassages.chapter)),
  ]);
  return {
    rows,
    total: total[0].count,
    chapters,
    referenceFound:
      !reference || rows.some((r) => r.reference === query.reference),
  };
}
