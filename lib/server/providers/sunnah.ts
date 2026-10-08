import "server-only";
import { z } from "zod";
import { canonicalText } from "../../domain/source";
import { hadithRecordSchema, type HadithRecord } from "../../domain/hadith";

export class SunnahError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const languageSchema = z
  .object({
    lang: z.string(),
    body: z.string().min(1),
    chapterTitle: z.string().optional(),
    grades: z
      .array(
        z.object({ grade: z.string().min(1), graded_by: z.string().nullish() }),
      )
      .default([]),
  })
  .passthrough();
const reportSchema = z
  .object({
    collection: z.string(),
    bookNumber: z.union([z.string(), z.number()]).transform(String),
    chapterId: z.union([z.string(), z.number()]).transform(String).nullish(),
    hadithNumber: z.union([z.string(), z.number()]).transform(String),
    hadith: z.array(languageSchema).min(1),
  })
  .passthrough();
const collectionSchema = z
  .object({
    name: z.string(),
    totalHadith: z.number().int().nonnegative(),
    totalAvailableHadith: z.number().int().nonnegative(),
    collection: z
      .array(z.object({ lang: z.string(), title: z.string() }))
      .default([]),
  })
  .passthrough();
export class SunnahClient {
  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!env.SUNNAH_API_KEY)
      throw new SunnahError("SUNNAH_CREDENTIALS_MISSING");
  }
  private async get(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(`https://api.sunnah.com/v1/${path}`, {
        headers: {
          "X-API-Key": this.env.SUNNAH_API_KEY!,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new SunnahError("SUNNAH_NETWORK_ERROR");
    }
    if (!response.ok)
      throw new SunnahError(
        response.status === 401 || response.status === 403
          ? "SUNNAH_AUTH_FAILED"
          : `SUNNAH_HTTP_${response.status}`,
      );
    try {
      const raw = await response.text();
      if (raw.length > 2000000) throw new Error("OVERSIZED");
      return JSON.parse(raw);
    } catch {
      throw new SunnahError("SUNNAH_RESPONSE_INVALID");
    }
  }
  async collections(page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 400)
      throw new SunnahError("SUNNAH_QUERY_INVALID");
    return z
      .object({
        data: z.array(collectionSchema),
        total: z.number().int().nonnegative(),
        next: z.number().int().positive().nullable(),
      })
      .parse(await this.get(`collections?limit=100&page=${page}`));
  }
  async report(
    collection: string,
    number: string,
  ): Promise<{ record: HadithRecord; raw: unknown; coverage: string }> {
    if (
      !/^[a-z0-9_-]{1,80}$/.test(collection) ||
      !/^[0-9]+[a-z]?$/i.test(number)
    )
      throw new SunnahError("SUNNAH_QUERY_INVALID");
    const raw = await this.get(`collections/${collection}/hadiths/${number}`);
    const report = reportSchema.parse(raw);
    if (report.collection !== collection || report.hadithNumber !== number)
      throw new SunnahError("SUNNAH_REFERENCE_MISMATCH");
    const english = report.hadith.find((item) => item.lang === "en");
    if (!english) throw new SunnahError("SUNNAH_ENGLISH_UNAVAILABLE");
    const catalog = collectionSchema.parse(
      await this.get(`collections/${collection}`),
    );
    const title =
      catalog.collection.find((item) => item.lang === "en")?.title ||
      collection;
    return {
      record: hadithRecordSchema.parse({
        collectionCode: collection,
        collectionName: title,
        bookNumber: report.bookNumber,
        bookName: null,
        chapterId: report.chapterId || null,
        chapterTitle: english.chapterTitle
          ? canonicalText(english.chapterTitle)
          : null,
        hadithNumber: number,
        numberingScheme: "Sunnah.com collection hadith number",
        otherReferences: [],
        narrator: null,
        text: canonicalText(english.body),
        arabic: report.hadith.find((item) => item.lang === "ar")?.body
          ? canonicalText(
              report.hadith.find((item) => item.lang === "ar")!.body,
            )
          : "",
        context: [],
        grades: english.grades.map((item) => ({
          grade: item.grade,
          authority: item.graded_by || null,
        })),
        sourceUrl: `https://sunnah.com/${collection}:${number}`,
      }),
      raw,
      coverage: `${title}: API advertises ${catalog.totalAvailableHadith} available of ${catalog.totalHadith} total reports. This import includes only explicitly requested reports.`,
    };
  }
}
