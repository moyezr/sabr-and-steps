import { z } from "zod";

const requiredText = (max: number) => z.string().trim().min(1).max(max);
export const hadithGradeSchema = z
  .object({
    grade: requiredText(200),
    authority: requiredText(200).nullable(),
  })
  .strict();
export const hadithRecordSchema = z
  .object({
    collectionCode: requiredText(80).regex(/^[a-z0-9_-]+$/),
    collectionName: requiredText(200),
    bookNumber: requiredText(80),
    bookName: requiredText(300).nullable(),
    chapterId: requiredText(80).nullable(),
    chapterTitle: requiredText(500).nullable(),
    hadithNumber: requiredText(80),
    numberingScheme: requiredText(200),
    otherReferences: z
      .array(
        z
          .object({ scheme: requiredText(200), value: requiredText(300) })
          .strict(),
      )
      .max(20)
      .default([]),
    narrator: requiredText(1000).nullable(),
    text: requiredText(20000),
    arabic: z.string().max(30000).default(""),
    context: z
      .array(
        z
          .object({ reference: requiredText(300), text: requiredText(20000) })
          .strict(),
      )
      .max(20)
      .default([]),
    grades: z.array(hadithGradeSchema).max(20),
    sourceUrl: z
      .url()
      .max(1000)
      .refine((value) => new URL(value).protocol === "https:"),
  })
  .strict();

export const manualHadithImportSchema = z
  .object({
    edition: requiredText(300),
    translator: requiredText(300).nullable(),
    provenance: requiredText(2000),
    coverageNotes: requiredText(2000),
    rightsStatus: z.enum(["not_cleared", "cleared"]),
    rightsNotes: requiredText(2000),
    reviewedBy: requiredText(200),
    reviewedAt: z.iso.datetime(),
    records: z.array(hadithRecordSchema).min(1).max(100),
  })
  .strict()
  .superRefine((dataset, ctx) => {
    const identities = dataset.records.map(
      (record) =>
        `${record.collectionCode}:${record.numberingScheme}:${record.hadithNumber}`,
    );
    if (new Set(identities).size !== identities.length)
      ctx.addIssue({
        code: "custom",
        path: ["records"],
        message: "Duplicate hadith reference in this import.",
      });
  });

export const hadithSearchSchema = z.object({
  importId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  collection: requiredText(80).optional(),
  sourceId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(400).default(1),
});
export type HadithRecord = z.infer<typeof hadithRecordSchema>;
export type ManualHadithImport = z.infer<typeof manualHadithImportSchema>;
/** Deliberately blank: no source wording, review, grade, or rights evidence is invented. */
export function createManualHadithImportTemplate(): ManualHadithImport {
  return {
    edition: "",
    translator: null,
    provenance: "",
    coverageNotes: "",
    rightsStatus: "not_cleared",
    rightsNotes: "",
    reviewedBy: "",
    reviewedAt: "",
    records: [
      {
        collectionCode: "",
        collectionName: "",
        bookNumber: "",
        bookName: null,
        chapterId: null,
        chapterTitle: null,
        hadithNumber: "",
        numberingScheme: "",
        otherReferences: [],
        narrator: null,
        text: "",
        arabic: "",
        context: [],
        grades: [],
        sourceUrl: "",
      },
    ],
  };
}
export type HadithEdition = {
  id: string;
  edition: string;
  translator: string | null;
  provider: string;
  provenance: string;
  coverageNotes: string;
  recordCount: number;
  rightsStatus: string;
  rightsNotes: string;
  createdAt: string;
};
export type HadithPassage = HadithRecord & {
  id: string;
  importId: string;
  reference: string;
  reviewState: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string;
};
export type HadithBrowseResponse = {
  imports: HadithEdition[];
  selected: HadithEdition | null;
  rows: HadithPassage[];
  total: number;
  collections: { code: string; name: string }[];
  providerAvailable: boolean;
};
export const hadithReference = (
  record: Pick<HadithRecord, "collectionName" | "hadithNumber">,
) => `${record.collectionName} ${record.hadithNumber}`;
