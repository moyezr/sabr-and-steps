import { z } from "zod";
export const EMBEDDING_CONFIG = {
  model: "openai/text-embedding-3-small",
  dimensions: 1536,
  preprocessing: "translation-text-v1",
} as const;
export const generatedDraftSchema = z
  .object({
    title: z.string().min(1).max(140),
    supported: z.boolean(),
    reason: z.string().max(1000),
    blocks: z
      .array(
        z
          .object({
            kind: z.enum(["reflection", "quote"]),
            text: z.string().max(2200),
            sourceId: z.string(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const scriptBlockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("reflection"),
      text: z.string().min(1).max(2200),
    })
    .strict(),
  z
    .object({
      kind: z.literal("quote"),
      text: z.string().min(1),
      sourceId: z.string().uuid(),
      reference: z.string(),
      edition: z.string(),
      importId: z.string().uuid(),
    })
    .strict(),
]);
export const scriptEditSchema = z.object({
  parentId: z.string().uuid(),
  title: z.string().min(1).max(140),
  blocks: z.array(scriptBlockSchema).min(1).max(30),
});
export type ScriptBlock = z.infer<typeof scriptBlockSchema>;
export type CitationSource = {
  id: string;
  reference: string;
  text: string;
  edition: string;
  importId: string;
};
export function resolveDraft(
  draft: z.infer<typeof generatedDraftSchema>,
  sources: CitationSource[],
): ScriptBlock[] {
  if (!draft.supported) throw new Error("NO_SUPPORTING_SOURCE");
  if (!draft.blocks.some((b) => b.kind === "quote"))
    throw new Error("DRAFT_NEEDS_CANONICAL_QUOTATION");
  return draft.blocks.map((b) => {
    if (b.kind === "reflection") {
      if (b.sourceId || !b.text.trim()) throw new Error("INVALID_REFLECTION");
      return { kind: "reflection", text: b.text.trim() };
    }
    const source = sources.find((s) => s.id === b.sourceId);
    if (!source) throw new Error("FABRICATED_SOURCE_ID");
    // The model chooses an ID only. It cannot author canonical wording.
    if (b.text !== "") throw new Error("MODEL_QUOTE_TEXT_NOT_ALLOWED");
    return {
      kind: "quote",
      text: source.text,
      sourceId: source.id,
      reference: source.reference,
      edition: source.edition,
      importId: source.importId,
    };
  });
}
export function validateScriptQuotes(
  blocks: ScriptBlock[],
  sources: CitationSource[],
) {
  for (const b of blocks) {
    if (b.kind !== "quote") continue;
    const s = sources.find((s) => s.id === b.sourceId);
    if (
      !s ||
      b.text !== s.text ||
      b.reference !== s.reference ||
      b.importId !== s.importId ||
      b.edition !== s.edition
    )
      throw new Error("CANONICAL_QUOTATION_CHANGED");
  }
}
export function narrationText(blocks: ScriptBlock[]) {
  return blocks
    .map((b) =>
      b.kind === "quote"
        ? `In a translation of the Quran, chapter ${b.reference.split(":")[0]}, verse ${b.reference.split(":")[1]}: ${b.text}`
        : b.text,
    )
    .join("\n\n");
}
export function assertEmbeddingConfig(config: {
  model: string;
  dimensions: number;
  preprocessing: string;
}) {
  if (
    config.model !== EMBEDDING_CONFIG.model ||
    config.dimensions !== EMBEDDING_CONFIG.dimensions ||
    config.preprocessing !== EMBEDDING_CONFIG.preprocessing
  )
    throw new Error("INCOMPATIBLE_EMBEDDING_CONFIG");
}
