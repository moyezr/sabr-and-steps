import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  embeddingIndexes,
  passageEmbeddings,
  queryEmbeddings,
  sourceImports,
  sourcePassages,
} from "../db/schema";
import { EMBEDDING_CONFIG, assertEmbeddingConfig } from "../../domain/script";
import { digest } from "../hash";
import { embed } from "../providers/openrouter";
import { type Job, progress } from "../jobs/store";
export const configHash = digest(EMBEDDING_CONFIG);
export async function buildIndex(job: Job, importId: string) {
  const db = getDb();
  const edition = (
    await db.select().from(sourceImports).where(eq(sourceImports.id, importId))
  )[0];
  if (!edition || edition.status !== "completed")
    throw new Error("SOURCE_IMPORT_NOT_COMPLETE");
  await db
    .insert(embeddingIndexes)
    .values({ importId, configHash, ...EMBEDDING_CONFIG })
    .onConflictDoNothing();
  const index = (
    await db
      .select()
      .from(embeddingIndexes)
      .where(
        and(
          eq(embeddingIndexes.importId, importId),
          eq(embeddingIndexes.configHash, configHash),
        ),
      )
  )[0];
  assertEmbeddingConfig(index);
  const passages = await db
    .select()
    .from(sourcePassages)
    .where(eq(sourcePassages.importId, importId))
    .orderBy(asc(sourcePassages.chapter), asc(sourcePassages.verse));
  const existing = await db
    .select()
    .from(passageEmbeddings)
    .where(eq(passageEmbeddings.indexId, index.id));
  const missing = passages.filter(
    (p) =>
      !existing.some((e) => e.passageId === p.id && e.checksum === p.checksum),
  );
  for (let start = 0; start < missing.length; start += 48) {
    const batch = missing.slice(start, start + 48);
    await progress(
      job,
      `Indexing ${Math.min(start + 48, missing.length)} of ${missing.length} remaining verses`,
    );
    const vectors = await embed(
      job,
      `index-${digest(batch.map((p) => p.id))}`,
      batch.map((p) => p.text),
    );
    await db
      .insert(passageEmbeddings)
      .values(
        batch.map((p, i) => ({
          indexId: index.id,
          passageId: p.id,
          checksum: p.checksum,
          embedding: vectors[i],
        })),
      )
      .onConflictDoNothing();
  }
  const count = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(passageEmbeddings)
    .where(eq(passageEmbeddings.indexId, index.id));
  if (count[0].n !== passages.length)
    throw new Error("EMBEDDING_INDEX_INCOMPLETE");
  await db
    .update(embeddingIndexes)
    .set({ state: "ready" })
    .where(eq(embeddingIndexes.id, index.id));
  return index.id;
}
export type RetrievedSource = {
  id: string;
  reference: string;
  text: string;
  edition: string;
  importId: string;
  similarity: number;
  keywordRank: number;
  context: { reference: string; text: string }[];
};
export async function retrieve(
  job: Job,
  indexId: string,
  query: string,
): Promise<RetrievedSource[]> {
  const db = getDb();
  const index = (
    await db
      .select()
      .from(embeddingIndexes)
      .where(eq(embeddingIndexes.id, indexId))
  )[0];
  if (!index || index.state !== "ready" || index.configHash !== configHash)
    throw new Error("INCOMPATIBLE_EMBEDDING_CONFIG");
  assertEmbeddingConfig(index);
  const key = digest({ query, configHash });
  let embedding = (
    await db.select().from(queryEmbeddings).where(eq(queryEmbeddings.key, key))
  )[0]?.embedding;
  if (!embedding) {
    [embedding] = await embed(job, `query-${key}`, [query]);
    await db
      .insert(queryEmbeddings)
      .values({ key, configHash, embedding })
      .onConflictDoNothing();
  }
  const vector = `[${embedding.join(",")}]`;
  const similarity = sql<number>`1-(${passageEmbeddings.embedding} <=> ${vector}::vector)`;
  const keyword = sql<number>`ts_rank_cd(to_tsvector('english',${sourcePassages.text}),websearch_to_tsquery('english',${query}))`;
  const rows = await db
    .select({
      id: sourcePassages.id,
      reference: sourcePassages.reference,
      text: sourcePassages.text,
      chapter: sourcePassages.chapter,
      verse: sourcePassages.verse,
      edition: sourceImports.name,
      importId: sourceImports.id,
      similarity,
      keywordRank: keyword,
    })
    .from(passageEmbeddings)
    .innerJoin(
      sourcePassages,
      eq(sourcePassages.id, passageEmbeddings.passageId),
    )
    .innerJoin(sourceImports, eq(sourceImports.id, sourcePassages.importId))
    .where(
      and(
        eq(passageEmbeddings.indexId, indexId),
        eq(sourcePassages.importId, index.importId),
        eq(sourcePassages.checksum, passageEmbeddings.checksum),
      ),
    )
    .orderBy(sql`${similarity} + least(${keyword},0.25) DESC`)
    .limit(8);
  const supported = rows.filter((r) => r.similarity >= 0.3);
  return Promise.all(
    supported.map(async (row) => ({
      ...row,
      context: await db
        .select({
          reference: sourcePassages.reference,
          text: sourcePassages.text,
        })
        .from(sourcePassages)
        .where(
          and(
            eq(sourcePassages.importId, index.importId),
            eq(sourcePassages.chapter, row.chapter),
            sql`${sourcePassages.verse} BETWEEN ${Math.max(1, row.verse - 2)} AND ${row.verse + 2}`,
          ),
        )
        .orderBy(asc(sourcePassages.verse)),
    })),
  );
}
