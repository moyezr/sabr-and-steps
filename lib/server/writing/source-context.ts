import "server-only";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { scriptBlockSchema, validateScriptQuotes } from "../../domain/script";
import { type getDb } from "../db/client";
import { sourceImports, sourcePassages } from "../db/schema";
import { resolveHadithQuotes } from "../sources/hadith";

type SourceReader = Pick<ReturnType<typeof getDb>, "select">;
export type ScriptSource = {
  sourceKind?: "hadith";
  id: string;
  reference: string;
  text: string;
  edition: string;
  importId: string;
  context: { reference: string; text: string }[];
  sourceUrl?: string;
  collection?: string;
  book?: string;
  hadithNumber?: string;
  numberingScheme?: string;
  narrator?: string | null;
  grades?: { grade: string; authority: string | null }[];
  translator?: string | null;
  rightsStatus?: string;
};

/** Resolve only the quoted passages, always from the script's canonical edition. */
export async function scriptSourceContext(
  db: SourceReader,
  importId: string,
  rawBlocks: unknown,
): Promise<ScriptSource[]> {
  const blocks = z.array(scriptBlockSchema).min(1).max(30).parse(rawBlocks);
  const edition = (
    await db.select().from(sourceImports).where(eq(sourceImports.id, importId))
  )[0];
  if (!edition || edition.status !== "completed")
    throw new Error("SOURCE_IMPORT_NOT_COMPLETE");
  const ids = Array.from(
    new Set(
      blocks.flatMap((block) =>
        block.kind === "quote" && block.sourceKind !== "hadith"
          ? [block.sourceId]
          : [],
      ),
    ),
  );
  const hadithSources = await resolveHadithQuotes(
    db,
    blocks.filter(
      (block) => block.kind === "quote" && block.sourceKind === "hadith",
    ),
  );
  if (!ids.length) return hadithSources;
  const passages = await db
    .select()
    .from(sourcePassages)
    .where(
      and(
        eq(sourcePassages.importId, importId),
        inArray(sourcePassages.id, ids),
      ),
    );
  validateScriptQuotes(
    blocks.filter(
      (block) => block.kind === "quote" && block.sourceKind !== "hadith",
    ),
    passages.map((passage) => ({ ...passage, edition: edition.name })),
  );
  const neighbors = await db
    .select({
      chapter: sourcePassages.chapter,
      verse: sourcePassages.verse,
      reference: sourcePassages.reference,
      text: sourcePassages.text,
    })
    .from(sourcePassages)
    .where(
      and(
        eq(sourcePassages.importId, importId),
        or(
          ...passages.map((passage) =>
            and(
              eq(sourcePassages.chapter, passage.chapter),
              sql`${sourcePassages.verse} BETWEEN ${Math.max(1, passage.verse - 2)} AND ${passage.verse + 2}`,
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(sourcePassages.chapter), asc(sourcePassages.verse));
  const quranSources = ids.map((id) => {
    const passage = passages.find((candidate) => candidate.id === id)!;
    return {
      id: passage.id,
      reference: passage.reference,
      text: passage.text,
      edition: edition.name,
      importId,
      context: neighbors
        .filter(
          (neighbor) =>
            neighbor.chapter === passage.chapter &&
            Math.abs(neighbor.verse - passage.verse) <= 2,
        )
        .map(({ reference, text }) => ({ reference, text })),
    };
  });
  const sources: ScriptSource[] = [...quranSources, ...hadithSources];
  const quoteIds = Array.from(
    new Set(
      blocks
        .filter((block) => block.kind === "quote")
        .map((block) => block.sourceId),
    ),
  );
  return quoteIds.map((id) => sources.find((source) => source.id === id)!);
}

/** Keep generation provenance while replacing its review context with actual quotes. */
export function withScriptSources(retrieval: unknown, sources: ScriptSource[]) {
  const provenance = z.record(z.string(), z.unknown()).parse(retrieval);
  return { ...provenance, sources };
}
