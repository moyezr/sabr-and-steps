import { z } from "zod";

export const exportFormatSchema = z.enum(["landscape", "vertical", "both"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export const renderInputSchema = z.object({
  compositionId: z.string().uuid(),
  compositionChecksum: z.string().length(64).optional(),
  format: exportFormatSchema.default("both"),
});
export function renderedFormats(format: ExportFormat) {
  return format === "both" ? (["landscape", "vertical"] as const) : [format];
}

export const reviewChecklistSchema = z.object({
  sourceContext: z.boolean(),
  wording: z.boolean(),
  pronunciation: z.boolean(),
  captions: z.boolean(),
  visuals: z.boolean(),
  audio: z.boolean(),
  completePlayback: z.boolean(),
  attribution: z.boolean(),
});
export type ReviewChecklist = z.infer<typeof reviewChecklistSchema>;
export const EMPTY_REVIEW_CHECKLIST: ReviewChecklist = {
  sourceContext: false,
  wording: false,
  pronunciation: false,
  captions: false,
  visuals: false,
  audio: false,
  completePlayback: false,
  attribution: false,
};
export const consolidatedReviewInputSchema = z.object({
  compositionId: z.string().uuid(),
  compositionChecksum: z.string().length(64),
  exportId: z.string().uuid(),
  decision: z.enum(["approved", "needs_changes"]),
  checklist: reviewChecklistSchema,
  feedback: z.string().trim().max(6000),
  mediaRightsConfirmed: z.boolean(),
  mediaRightsNotes: z.string().trim().max(2000),
});
export type SourceRightsSnapshot = {
  importId: string;
  edition: string;
  sourceKind: "quran" | "hadith";
  rightsStatus: string;
};
export type ReviewRightsSnapshot = {
  sources: SourceRightsSnapshot[];
  narration: { required: boolean; cleared: boolean; provider: string | null };
  media: { ids: string[]; confirmed: boolean; notes: string };
};
export function missingReviewChecks(
  checklist: ReviewChecklist,
  narrated: boolean,
) {
  return Object.entries(checklist)
    .filter(([key, value]) => !value && (narrated || key !== "pronunciation"))
    .map(([key]) => key as keyof ReviewChecklist);
}
export function publicationBlockers(input: {
  exactReview: boolean;
  decision?: "approved" | "needs_changes";
  checklist?: ReviewChecklist;
  rights: ReviewRightsSnapshot;
}) {
  const blockers: string[] = [];
  if (!input.exactReview) blockers.push("Review this exact rendered revision.");
  else if (input.decision !== "approved")
    blockers.push("The creator requested changes to this revision.");
  if (input.exactReview && !input.checklist)
    blockers.push("The creator review checklist has not been recorded.");
  if (input.exactReview && input.checklist) {
    for (const check of missingReviewChecks(
      input.checklist,
      input.rights.narration.required,
    ))
      blockers.push(`Creator review is incomplete: ${check}.`);
  }
  for (const source of input.rights.sources) {
    if (source.rightsStatus !== "cleared")
      blockers.push(`Publication reuse is not cleared: ${source.edition}.`);
  }
  if (input.rights.narration.required && !input.rights.narration.cleared)
    blockers.push(
      "The saved narration does not have confirmed publication rights.",
    );
  if (input.rights.media.ids.length && !input.rights.media.confirmed)
    blockers.push(
      "Confirm the rights and source notes for this revision’s uploaded media.",
    );
  return blockers;
}
