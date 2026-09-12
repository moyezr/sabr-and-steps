import "server-only";
import { digest } from "../hash";
export { digest } from "../hash";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "../db/client";
import { sourceImports, sourcePassages } from "../db/schema";
import {
  QuranClient,
  QuranError,
  type chapterSchema,
  type resourceSchema,
  pageSchema,
} from "../providers/quran";
import { canonicalText } from "../../domain/source";
import type { z } from "zod";

export const RIGHTS_NOTES =
  "Publication reuse not cleared. Quran.com does not grant translation reproduction permission. For resource 85, publisher: Oxford University Press; translator: M.A.S. Abdel Haleem (API author_name: Abdul Haleem). Review rights with the rights holder before production use. https://quran.zendesk.com/hc/en-us/articles/115003652132-Using-content-from-Quran-com | https://academic.oup.com/pages/purchasing/rights-and-permissions";
type SourceClient = Pick<
  QuranClient,
  "environment" | "resources" | "chapters" | "page" | "get"
>;

export function validateChapter(
  pages: z.infer<typeof pageSchema>[],
  chapter: z.infer<typeof chapterSchema>,
  resource: number,
) {
  const verses = pages.flatMap((p) => p.verses);
  if (verses.length !== chapter.verses_count)
    throw new QuranError("QF_INCOMPLETE_CHAPTER");
  return verses.map((v, index) => {
    if (
      v.verse_number !== index + 1 ||
      v.verse_key !== `${chapter.id}:${index + 1}`
    )
      throw new QuranError("QF_REFERENCE_MISMATCH");
    const translations = v.translations.filter(
      (t) => t.resource_id === resource,
    );
    if (translations.length !== 1)
      throw new QuranError("QF_TRANSLATION_MISSING");
    return {
      chapter: chapter.id,
      verse: v.verse_number,
      reference: v.verse_key,
      chapterName: chapter.name_simple,
      text: canonicalText(translations[0].text),
      arabic: v.text_uthmani,
      raw: v,
      checksum: digest(v),
    };
  });
}

export async function importQuran(
  resourceId: number,
  options: {
    client?: SourceClient;
    refresh?: boolean;
    onProgress?: (message: string) => void;
    dataDir?: string;
  } = {},
) {
  if (!Number.isInteger(resourceId) || resourceId < 1 || resourceId === 57)
    throw new QuranError("QF_TRANSLATION_ID_INVALID");
  const client = options.client || new QuranClient();
  const connection = await getPool().connect();
  const db = drizzle(connection);
  let runId: string | undefined;
  let locked = false;
  try {
    const lock = await connection.query(
      "SELECT pg_try_advisory_lock(85002, $1) AS locked",
      [resourceId],
    );
    locked = lock.rows[0].locked;
    if (!locked) throw new QuranError("SOURCE_IMPORT_ALREADY_RUNNING");
    const history = await db
      .select()
      .from(sourceImports)
      .where(
        and(
          eq(sourceImports.environment, client.environment),
          eq(sourceImports.resourceId, resourceId),
        ),
      )
      .orderBy(desc(sourceImports.createdAt));
    const pending = history.find((r) => r.status !== "completed");
    const completed = history.find((r) => r.status === "completed");
    if (!pending && completed && !options.refresh)
      return { id: completed.id, cached: true };
    const resources = await client.resources();
    const edition = resources.find((r) => r.id === resourceId);
    if (!edition || /transliteration/i.test(edition.name))
      throw new QuranError("QF_EDITION_UNAVAILABLE");
    const chapters = await client.chapters();
    if (new Set(chapters.map((c) => c.id)).size !== chapters.length)
      throw new QuranError("QF_DUPLICATE_CHAPTER");
    chapters.sort((a, b) => a.id - b.id);
    const info = await client.get(`resources/translations/${resourceId}/info`);
    const metadata = { edition, chapters, info, normalizationVersion: 1 };
    if (pending && digest(pending.metadata) !== digest(metadata))
      throw new QuranError("QF_CATALOG_CHANGED_DURING_IMPORT");
    const run =
      pending ||
      (
        await db
          .insert(sourceImports)
          .values({
            environment: client.environment,
            resourceId,
            name: edition.name,
            author: edition.author_name || edition.name,
            expectedChapters: chapters.length,
            expectedVerses: chapters.reduce((n, c) => n + c.verses_count, 0),
            metadata,
            rightsNotes:
              resourceId === 85
                ? RIGHTS_NOTES
                : "Publication reuse not cleared; record edition-specific permission before production use.",
          })
          .returning()
      )[0];
    runId = run.id;
    await db
      .update(sourceImports)
      .set({ status: "running", errorCode: null, updatedAt: new Date() })
      .where(eq(sourceImports.id, run.id));
    const directory = path.resolve(
      options.dataDir || process.env.APP_DATA_DIR || ".data",
      "sources",
      run.id,
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const saveRaw = async (name: string, value: unknown) => {
      const target = path.join(directory, name);
      await writeFile(`${target}.tmp`, JSON.stringify(value), { mode: 0o600 });
      await rename(`${target}.tmp`, target);
    };
    await saveRaw("metadata.json", metadata);
    const done = [...run.completedChapters];
    for (const chapter of chapters) {
      if (done.includes(chapter.id)) continue;
      const pages: z.infer<typeof pageSchema>[] = [];
      for (let page = 1; page <= Math.ceil(chapter.verses_count / 50); page++) {
        const payload = await client.page(resourceId, chapter.id, page);
        const parsed = pageSchema.parse(payload);
        const total = Math.ceil(chapter.verses_count / 50);
        if (
          parsed.pagination.current_page !== page ||
          parsed.pagination.total_records !== chapter.verses_count ||
          parsed.pagination.total_pages !== total ||
          parsed.pagination.next_page !== (page < total ? page + 1 : null)
        )
          throw new QuranError("QF_PAGINATION_MISMATCH");
        await saveRaw(`chapter-${chapter.id}-page-${page}.json`, payload);
        pages.push(parsed);
      }
      const passages = validateChapter(pages, chapter, resourceId);
      done.push(chapter.id);
      await db.transaction(async (tx) => {
        await tx
          .insert(sourcePassages)
          .values(passages.map((p) => ({ ...p, importId: run.id })));
        await tx
          .update(sourceImports)
          .set({ completedChapters: [...done], updatedAt: new Date() })
          .where(eq(sourceImports.id, run.id));
      });
      options.onProgress?.(
        `Imported chapter ${chapter.id} (${done.length}/${chapters.length} available chapters).`,
      );
    }
    const rows = await db
      .select({
        reference: sourcePassages.reference,
        checksum: sourcePassages.checksum,
      })
      .from(sourcePassages)
      .where(eq(sourcePassages.importId, run.id))
      .orderBy(asc(sourcePassages.chapter), asc(sourcePassages.verse));
    if (rows.length !== run.expectedVerses)
      throw new QuranError("QF_INCOMPLETE_IMPORT");
    const checksum = digest({ metadata, rows });
    const duplicate = history.find(
      (r) => r.status === "completed" && r.checksum === checksum,
    );
    if (duplicate) {
      await saveRaw("result.json", { reusedImportId: duplicate.id, checksum });
      await db.transaction(async (tx) => {
        await tx
          .delete(sourcePassages)
          .where(eq(sourcePassages.importId, run.id));
        await tx.delete(sourceImports).where(eq(sourceImports.id, run.id));
      });
      return { id: duplicate.id, cached: true };
    }
    await db
      .update(sourceImports)
      .set({
        status: "completed",
        checksum,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(sourceImports.id, run.id));
    return { id: run.id, cached: false };
  } catch (error) {
    const code =
      error instanceof QuranError
        ? error.code
        : error instanceof Error && error.message.startsWith("SOURCE_")
          ? error.message
          : "SOURCE_IMPORT_FAILED";
    if (runId)
      await db
        .update(sourceImports)
        .set({ status: "failed", errorCode: code, updatedAt: new Date() })
        .where(
          and(
            eq(sourceImports.id, runId),
            inArray(sourceImports.status, ["running", "failed"]),
          ),
        )
        .catch(() => undefined);
    throw new QuranError(code);
  } finally {
    if (locked)
      await connection
        .query("SELECT pg_advisory_unlock(85002, $1)", [resourceId])
        .catch(() => undefined);
    connection.release();
  }
}
export type SourceResource = z.infer<typeof resourceSchema>;
