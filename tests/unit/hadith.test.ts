import assert from "node:assert/strict";
import test from "node:test";
import {
  hadithRecordSchema,
  hadithSearchSchema,
  manualHadithImportSchema,
} from "../../lib/domain/hadith";
import { SunnahClient, SunnahError } from "../../lib/server/providers/sunnah";

const record = {
  collectionCode: "fixture",
  collectionName: "Synthetic fixture (not scripture)",
  bookNumber: "1",
  bookName: null,
  chapterId: null,
  chapterTitle: null,
  hadithNumber: "12a",
  numberingScheme: "Fixture numbering",
  narrator: null,
  text: "Full synthetic report. Not religious source material.",
  grades: [],
  sourceUrl: "https://example.com/fixture/12a",
};
const dataset = {
  edition: "Synthetic fixture edition",
  translator: null,
  provenance: "Deterministic test only.",
  coverageNotes: "One fixture only; no religious corpus coverage.",
  rightsStatus: "not_cleared",
  rightsNotes: "No reuse permission asserted.",
  reviewedBy: "Fixture reviewer",
  reviewedAt: "2026-10-08T00:00:00Z",
  records: [record],
};
test("manual hadith records require full provenance and never infer grading", () => {
  const parsed = manualHadithImportSchema.parse(dataset);
  assert.deepEqual(parsed.records[0].grades, []);
  assert.equal(parsed.records[0].narrator, null);
  assert.equal(parsed.translator, null);
  for (const key of [
    "reviewedBy",
    "reviewedAt",
    "rightsNotes",
    "coverageNotes",
    "provenance",
  ] as const) {
    const missing = { ...dataset, [key]: undefined };
    assert.equal(
      manualHadithImportSchema.safeParse(missing).success,
      false,
      key,
    );
  }
  assert.equal(
    manualHadithImportSchema.safeParse({
      ...dataset,
      records: [record, record],
    }).success,
    false,
  );
  assert.equal(
    hadithRecordSchema.safeParse({
      ...record,
      grades: [{ grade: "Fixture only" }],
    }).success,
    false,
  );
  assert.equal(
    hadithRecordSchema.safeParse({
      ...record,
      sourceUrl: "javascript:alert(1)",
    }).success,
    false,
  );
});
test("hadith searches are bounded and reject malformed identities", () => {
  assert.equal(hadithSearchSchema.parse({ q: "  words  " }).q, "words");
  for (const input of [
    { q: "a".repeat(201) },
    { page: 401 },
    { page: -1 },
    { page: 1.5 },
    { importId: "fake" },
    { sourceId: "fake" },
  ])
    assert.equal(hadithSearchSchema.safeParse(input).success, false);
});
test("Sunnah adapter preserves numbering, complete body and unknown grade authorities", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const client = new SunnahClient(
    { SUNNAH_API_KEY: "fixture-key" },
    async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      const body = url.includes("/hadiths/")
        ? {
            collection: "fixture",
            bookNumber: "1",
            chapterId: "1.2",
            hadithNumber: "12a",
            hadith: [
              {
                lang: "en",
                body: "<p>Complete synthetic report. Not scripture.</p>",
                chapterTitle: "Fixture context",
                grades: [{ grade: "Fixture grade", graded_by: null }],
              },
            ],
          }
        : {
            name: "fixture",
            totalHadith: 100,
            totalAvailableHadith: 20,
            collection: [{ lang: "en", title: "Synthetic fixture" }],
          };
      return new Response(JSON.stringify(body), { status: 200 });
    },
  );
  const { record: result, coverage } = await client.report("fixture", "12a");
  assert.equal(result.hadithNumber, "12a");
  assert.equal(result.text, "Complete synthetic report. Not scripture.");
  assert.deepEqual(result.grades, [
    { grade: "Fixture grade", authority: null },
  ]);
  assert.equal(result.narrator, null);
  assert.match(coverage, /20 available of 100/);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].init?.redirect, "error");
  assert.equal(
    (requests[0].init?.headers as Record<string, string>)["X-API-Key"],
    "fixture-key",
  );
});
test("Sunnah adapter fails visibly for missing credentials, auth and mismatched references", async () => {
  assert.throws(
    () => new SunnahClient({}),
    (error: unknown) =>
      error instanceof SunnahError &&
      error.code === "SUNNAH_CREDENTIALS_MISSING",
  );
  const denied = new SunnahClient(
    { SUNNAH_API_KEY: "fixture-key" },
    async () => new Response("private error", { status: 403 }),
  );
  await assert.rejects(denied.report("fixture", "12a"), /SUNNAH_AUTH_FAILED/);
  const mismatch = new SunnahClient(
    { SUNNAH_API_KEY: "fixture-key" },
    async () =>
      Response.json({
        collection: "fixture",
        bookNumber: "1",
        hadithNumber: "13",
        hadith: [{ lang: "en", body: "Wrong synthetic report" }],
      }),
  );
  await assert.rejects(
    mismatch.report("fixture", "12a"),
    /SUNNAH_REFERENCE_MISMATCH/,
  );
  await assert.rejects(denied.report("../bad", "1"), /SUNNAH_QUERY_INVALID/);
});
