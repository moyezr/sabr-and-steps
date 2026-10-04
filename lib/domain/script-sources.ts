import { z } from "zod";
import { parseReference } from "./source";

export const scriptSourceQuerySchema = z.object({
  importId: z.string().uuid(),
  q: z.string().trim().max(200).optional(),
  chapter: z.coerce.number().int().min(1).max(114).optional(),
  reference: z
    .string()
    .trim()
    .max(7)
    .refine((value) => Boolean(parseReference(value)))
    .transform((value) => {
      const reference = parseReference(value)!;
      return `${reference.chapter}:${reference.verse}`;
    })
    .optional(),
  page: z.coerce.number().int().min(1).max(400).default(1),
});

export type ScriptSourceRow = {
  id: string;
  reference: string;
  text: string;
  chapter: number;
  verse: number;
  chapterName: string;
};

export type ScriptSourceResponse = {
  rows: ScriptSourceRow[];
  total: number;
  chapters: { chapter: number; name: string }[];
  referenceFound: boolean;
  edition: {
    id: string;
    name: string;
    author: string;
    coverage: number;
    environment: string;
    rightsStatus: string;
  };
};
