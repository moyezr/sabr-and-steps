import "server-only";

import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { hadithImports, hadithPassages } from "../db/schema";
import { digest } from "../hash";
import {
  hadithRecordSchema,
  hadithReference,
  manualHadithImportSchema,
  type HadithEdition,
  type HadithPassage,
  type ManualHadithImport,
} from "../../domain/hadith";
import type { ScriptBlock } from "../../domain/script";

type SourceReader = Pick<ReturnType<typeof getDb>, "select">;
const publicEdition = (
  row: typeof hadithImports.$inferSelect,
): HadithEdition => ({
  id: row.id,
  provider: row.provider,
  edition: row.edition,
  translator: row.translator,
  provenance: row.provenance,
  coverageNotes: row.coverageNotes,
  recordCount: row.recordCount,
  rightsStatus: row.rightsStatus,
  rightsNotes: row.rightsNotes,
  createdAt: row.createdAt.toISOString(),
});
const publicPassage = (
  row: typeof hadithPassages.$inferSelect,
): HadithPassage => ({
  ...hadithRecordSchema.parse({
    collectionCode: row.collectionCode,
    collectionName: row.collectionName,
    bookNumber: row.bookNumber,
    bookName: row.bookName,
    chapterId: row.chapterId,
    chapterTitle: row.chapterTitle,
    hadithNumber: row.hadithNumber,
    numberingScheme: row.numberingScheme,
    otherReferences: row.otherReferences,
    narrator: row.narrator,
    text: row.text,
    arabic: row.arabic,
    context: row.context,
    grades: row.grades,
    sourceUrl: row.sourceUrl,
  }),
  id: row.id,
  importId: row.importId,
  reference: row.reference,
  reviewState: row.reviewState,
  reviewedBy: row.reviewedBy,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  reviewNotes: row.reviewNotes,
});

/** A bounded, atomic import. Changed wording or provenance creates a new snapshot. */
export async function importHadithDataset(
  raw: unknown,
  options: {
    provider?: "manual" | "sunnah";
    reviewed?: boolean;
    rawRecords?: unknown[];
  } = {},
) {
  const dataset = manualHadithImportSchema.parse(raw);
  const provider = options.provider ?? "manual";
  const reviewed = options.reviewed ?? provider === "manual";
  const checksum = digest({
    provider,
    dataset: {
      ...dataset,
      reviewedBy: reviewed ? dataset.reviewedBy : null,
      reviewedAt: reviewed ? dataset.reviewedAt : null,
    },
    reviewed,
  });
  const db = getDb();
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(hadithImports)
      .values({
        provider,
        edition: dataset.edition,
        translator: dataset.translator,
        provenance: dataset.provenance,
        coverageNotes: dataset.coverageNotes,
        rightsStatus: dataset.rightsStatus,
        rightsNotes: dataset.rightsNotes,
        recordCount: dataset.records.length,
        checksum,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [existing] = await tx
        .select()
        .from(hadithImports)
        .where(eq(hadithImports.checksum, checksum));
      return {
        id: existing.id,
        cached: true,
        recordCount: existing.recordCount,
      };
    }
    await tx.insert(hadithPassages).values(
      dataset.records.map((record, index) => ({
        ...record,
        importId: created.id,
        reference: hadithReference(record),
        raw: options.rawRecords?.[index] ?? record,
        checksum: digest(record),
        reviewState: reviewed ? "reviewed" : "unreviewed",
        reviewedBy: reviewed ? dataset.reviewedBy : null,
        reviewedAt: reviewed ? new Date(dataset.reviewedAt) : null,
        reviewNotes: reviewed
          ? "Reviewed manual source record supplied with this import."
          : "Provider wording imported; creator context review is pending.",
      })),
    );
    return { id: created.id, cached: false, recordCount: created.recordCount };
  });
}

export async function browseHadith(query: {
  importId?: string;
  q?: string;
  collection?: string;
  sourceId?: string;
  page: number;
}) {
  const db = getDb();
  const imports = await db
    .select()
    .from(hadithImports)
    .where(eq(hadithImports.status, "completed"))
    .orderBy(desc(hadithImports.createdAt), desc(hadithImports.id));
  const edition = query.importId
    ? imports.find((item) => item.id === query.importId)
    : imports[0];
  if (query.importId && !edition) throw new Error("HADITH_IMPORT_NOT_FOUND");
  if (!edition)
    return { imports: [], selected: null, rows: [], total: 0, collections: [] };
  const filter = and(
    eq(hadithPassages.importId, edition.id),
    query.sourceId ? eq(hadithPassages.id, query.sourceId) : undefined,
    query.collection
      ? eq(hadithPassages.collectionCode, query.collection)
      : undefined,
    query.q
      ? ilike(hadithPassages.text, `%${query.q.replace(/[\\%_]/g, "\\$&")}%`)
      : undefined,
  );
  const [rows, total, collections] = await Promise.all([
    db
      .select()
      .from(hadithPassages)
      .where(filter)
      .orderBy(
        asc(hadithPassages.collectionCode),
        asc(hadithPassages.bookNumber),
        asc(hadithPassages.hadithNumber),
      )
      .limit(20)
      .offset((query.page - 1) * 20),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hadithPassages)
      .where(filter),
    db
      .selectDistinct({
        code: hadithPassages.collectionCode,
        name: hadithPassages.collectionName,
      })
      .from(hadithPassages)
      .where(eq(hadithPassages.importId, edition.id))
      .orderBy(asc(hadithPassages.collectionCode)),
  ]);
  return {
    imports: imports.map(publicEdition),
    selected: publicEdition(edition),
    rows: rows.map(publicPassage),
    total: total[0].count,
    collections,
  };
}

export async function reviewHadith(raw: unknown) {
  const input = z
    .object({
      sourceId: z.string().uuid(),
      importId: z.string().uuid(),
      reviewedBy: z.string().trim().min(1).max(200),
      notes: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(raw);
  const [passage] = await getDb()
    .update(hadithPassages)
    .set({
      reviewState: "reviewed",
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: input.notes,
    })
    .where(
      and(
        eq(hadithPassages.id, input.sourceId),
        eq(hadithPassages.importId, input.importId),
      ),
    )
    .returning();
  if (!passage) throw new Error("HADITH_NOT_FOUND");
  return publicPassage(passage);
}

/** Canonical identity checks never accept client-authored report wording or grades. */
export async function resolveHadithQuotes(
  db: SourceReader,
  blocks: ScriptBlock[],
) {
  const quotes = blocks.filter((block) => block.kind === "quote");
  if (!quotes.length) return [];
  const ids = Array.from(new Set(quotes.map((quote) => quote.sourceId)));
  const imports = Array.from(new Set(quotes.map((quote) => quote.importId)));
  const [passages, editions] = await Promise.all([
    db.select().from(hadithPassages).where(inArray(hadithPassages.id, ids)),
    db.select().from(hadithImports).where(inArray(hadithImports.id, imports)),
  ]);
  for (const quote of quotes) {
    const passage = passages.find((item) => item.id === quote.sourceId);
    const edition = editions.find((item) => item.id === quote.importId);
    if (
      !passage ||
      !edition ||
      edition.status !== "completed" ||
      passage.importId !== quote.importId ||
      quote.text !== passage.text ||
      quote.reference !== passage.reference ||
      quote.edition !== edition.edition
    )
      throw new Error("CANONICAL_QUOTATION_CHANGED");
    if (passage.reviewState !== "reviewed")
      throw new Error("HADITH_REVIEW_REQUIRED");
  }
  return ids.map((id) => {
    const record = publicPassage(passages.find((item) => item.id === id)!);
    const edition = editions.find((item) => item.id === record.importId)!;
    return {
      id: record.id,
      reference: record.reference,
      text: record.text,
      edition: edition.edition,
      importId: edition.id,
      sourceKind: "hadith" as const,
      context: [
        { reference: record.reference, text: record.text },
        ...record.context,
      ],
      sourceUrl: record.sourceUrl,
      collection: record.collectionName,
      book: record.bookName || record.bookNumber,
      hadithNumber: record.hadithNumber,
      numberingScheme: record.numberingScheme,
      otherReferences: record.otherReferences,
      narrator: record.narrator,
      grades: record.grades,
      translator: edition.translator,
      rightsStatus: edition.rightsStatus,
      rightsNotes: edition.rightsNotes,
    };
  });
}

export type { ManualHadithImport };
