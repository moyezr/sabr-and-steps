import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_REVIEW_CHECKLIST,
  missingReviewChecks,
  publicationBlockers,
  renderInputSchema,
  renderedFormats,
  type ReviewRightsSnapshot,
} from "../../lib/domain/export-review";

test("export format requests retain both-format compatibility and reject unsupported output", () => {
  const compositionId = "00000000-0000-4000-8000-000000000001";
  assert.equal(renderInputSchema.parse({ compositionId }).format, "both");
  assert.deepEqual(renderedFormats("both"), ["landscape", "vertical"]);
  assert.deepEqual(renderedFormats("vertical"), ["vertical"]);
  assert.deepEqual(renderedFormats("landscape"), ["landscape"]);
  assert.throws(() =>
    renderInputSchema.parse({ compositionId, format: "square" }),
  );
});

test("publication eligibility requires exact creator review and every independent rights boundary", () => {
  const checklist = { ...EMPTY_REVIEW_CHECKLIST };
  for (const key of Object.keys(checklist) as (keyof typeof checklist)[])
    checklist[key] = true;
  const rights: ReviewRightsSnapshot = {
    sources: [
      {
        importId: "quran",
        edition: "Qur’an fixture",
        sourceKind: "quran",
        rightsStatus: "cleared",
      },
      {
        importId: "hadith",
        edition: "Hadith fixture",
        sourceKind: "hadith",
        rightsStatus: "not_cleared",
      },
    ],
    narration: { required: true, cleared: false, provider: "elevenlabs" },
    media: { ids: ["image"], confirmed: false, notes: "" },
  };
  const blockers = publicationBlockers({
    exactReview: true,
    decision: "approved",
    checklist,
    rights,
  });
  assert.equal(blockers.length, 3);
  assert(blockers.some((blocker) => blocker.includes("Hadith fixture")));
  assert(blockers.some((blocker) => blocker.includes("narration")));
  assert(blockers.some((blocker) => blocker.includes("uploaded media")));
  const cleared = {
    ...rights,
    sources: rights.sources.map((source) => ({
      ...source,
      rightsStatus: "cleared",
    })),
    narration: { ...rights.narration, cleared: true },
    media: {
      ...rights.media,
      confirmed: true,
      notes: "Synthetic owner declaration",
    },
  };
  assert.deepEqual(
    publicationBlockers({
      exactReview: true,
      decision: "approved",
      checklist,
      rights: cleared,
    }),
    [],
  );
  assert(
    publicationBlockers({ exactReview: false, rights: cleared }).some(
      (blocker) => blocker.includes("exact rendered revision"),
    ),
  );
  assert(
    publicationBlockers({
      exactReview: true,
      decision: "needs_changes",
      checklist,
      rights: cleared,
    }).some((blocker) => blocker.includes("requested changes")),
  );
});

test("text-only review leaves pronunciation inapplicable while retaining all visual, source and playback checks", () => {
  assert.equal(missingReviewChecks(EMPTY_REVIEW_CHECKLIST, false).length, 7);
  assert.equal(missingReviewChecks(EMPTY_REVIEW_CHECKLIST, true).length, 8);
  const textChecklist = {
    ...EMPTY_REVIEW_CHECKLIST,
    sourceContext: true,
    wording: true,
    captions: true,
    visuals: true,
    audio: true,
    completePlayback: true,
    attribution: true,
  };
  assert.deepEqual(missingReviewChecks(textChecklist, false), []);
  assert.deepEqual(missingReviewChecks(textChecklist, true), ["pronunciation"]);
});
