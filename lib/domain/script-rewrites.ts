import { z } from "zod";
import { LLM_MODELS } from "./episode";
import type { ScriptBlock } from "./script";

export const reflectionSelectionSchema = z
  .object({
    blockIndex: z.number().int().min(0).max(29),
    blockText: z.string().min(1).max(2200),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    text: z.string().min(1).max(2200),
  })
  .strict()
  .refine(
    (value) =>
      value.end <= value.blockText.length &&
      value.end > value.start &&
      value.text.trim().length > 0 &&
      value.blockText.slice(value.start, value.end) === value.text,
    { message: "Select an exact nonblank reflection range" },
  );
export type ReflectionSelection = z.infer<typeof reflectionSelectionSchema>;

export const rewriteRequestSchema = z
  .object({
    baseScriptId: z.string().uuid(),
    draftRevision: z.number().int().nonnegative(),
    episodeRevision: z.number().int().positive(),
    model: z.enum(LLM_MODELS),
    instructions: z.string().trim().max(2000).default(""),
    selection: reflectionSelectionSchema,
  })
  .strict();

export const rewriteAlternativeSchema = z
  .object({
    text: z.string().trim().min(1).max(2200),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const rewriteResultSchema = z
  .object({
    supported: z.boolean(),
    reason: z.string().max(1000),
    alternatives: z.array(rewriteAlternativeSchema).max(3),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.supported &&
      (result.reason !== "" || result.alternatives.length !== 3)
    )
      context.addIssue({
        code: "custom",
        message: "Return exactly three supported alternatives",
      });
    if (
      !result.supported &&
      (!result.reason.trim() || result.alternatives.length)
    )
      context.addIssue({
        code: "custom",
        message: "Unsupported results need a reason and no alternatives",
      });
    if (
      new Set(
        result.alternatives.map((alternative) =>
          alternative.text.toLowerCase(),
        ),
      ).size !== result.alternatives.length
    )
      context.addIssue({ code: "custom", message: "Alternatives must differ" });
  });

/** Rebase one contiguous edit outside the target; refuse overlapping changes. */
export function applyReflectionRewrite(
  blocks: ScriptBlock[],
  rawSelection: ReflectionSelection,
  replacement: string,
): ScriptBlock[] {
  const selection = reflectionSelectionSchema.parse(rawSelection);
  const current = blocks[selection.blockIndex];
  if (!current || current.kind !== "reflection")
    throw new Error("REWRITE_TARGET_CHANGED");
  const original = selection.blockText;
  let start = selection.start;
  if (current.text !== original) {
    let prefix = 0;
    while (
      prefix < original.length &&
      prefix < current.text.length &&
      original[prefix] === current.text[prefix]
    )
      prefix++;
    let suffix = 0;
    while (
      suffix < original.length - prefix &&
      suffix < current.text.length - prefix &&
      original[original.length - 1 - suffix] ===
        current.text[current.text.length - 1 - suffix]
    )
      suffix++;
    const oldEnd = original.length - suffix;
    if (oldEnd <= selection.start)
      start += current.text.length - original.length;
    else if (prefix < selection.end) throw new Error("REWRITE_TARGET_CHANGED");
  }
  if (
    current.text.slice(start, start + selection.text.length) !== selection.text
  )
    throw new Error("REWRITE_TARGET_CHANGED");
  const accepted = z.string().trim().min(1).max(2200).parse(replacement);
  const leading = selection.text.match(/^\s*/)?.[0] ?? "";
  const trailing = selection.text.match(/\s*$/)?.[0] ?? "";
  const text =
    current.text.slice(0, start) +
    leading +
    accepted +
    trailing +
    current.text.slice(start + selection.text.length);
  if (!text.trim() || text.length > 2200)
    throw new Error("REWRITE_BLOCK_TOO_LONG");
  return blocks.map((block, index) =>
    index === selection.blockIndex
      ? { kind: "reflection", text }
      : { ...block },
  );
}
