import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { compositionSchema } from "../../domain/media";
import { scriptBlockSchema } from "../../domain/script";
import {
  consolidatedReviewInputSchema,
  missingReviewChecks,
  publicationBlockers,
  reviewChecklistSchema,
  type ReviewRightsSnapshot,
} from "../../domain/export-review";
import { getDb } from "../db/client";
import {
  compositionReviews,
  compositions,
  hadithImports,
  scriptRevisions,
  sourceImports,
  videoExports,
  voiceTakes,
} from "../db/schema";

type Composition = typeof compositions.$inferSelect;
const declarationSchema = z.object({
  media: z.object({ confirmed: z.boolean(), notes: z.string() }),
});

export function compositionMediaIds(raw: unknown) {
  const data = z
    .object({
      image: z.object({ id: z.string() }).nullable().optional(),
      music: z.object({ id: z.string() }).nullable().optional(),
      sceneImages: z
        .array(z.object({ image: z.object({ id: z.string() }).nullable() }))
        .optional(),
    })
    .parse(raw);
  return Array.from(
    new Set(
      [
        data.image?.id,
        data.music?.id,
        ...(data.sceneImages || []).map((scene) => scene.image?.id),
      ].filter((id): id is string => Boolean(id)),
    ),
  );
}

async function currentRights(
  c: Composition,
  declaration?: { confirmed: boolean; notes: string },
): Promise<ReviewRightsSnapshot> {
  const db = getDb();
  const script = (
    await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.id, c.scriptId))
  )[0];
  if (!script) throw new Error("SCRIPT_NOT_FOUND");
  const quotes = z
    .array(scriptBlockSchema)
    .parse(script.blocks)
    .filter((block) => block.kind === "quote");
  const quranIds = Array.from(
    new Set(
      quotes
        .filter((quote) => quote.sourceKind !== "hadith")
        .map((quote) => quote.importId),
    ),
  );
  const hadithIds = Array.from(
    new Set(
      quotes
        .filter((quote) => quote.sourceKind === "hadith")
        .map((quote) => quote.importId),
    ),
  );
  const [quran, hadith, takes] = await Promise.all([
    quranIds.length
      ? db
          .select()
          .from(sourceImports)
          .where(inArray(sourceImports.id, quranIds))
      : [],
    hadithIds.length
      ? db
          .select()
          .from(hadithImports)
          .where(inArray(hadithImports.id, hadithIds))
      : [],
    c.voiceTakeId
      ? db.select().from(voiceTakes).where(eq(voiceTakes.id, c.voiceTakeId))
      : [],
  ]);
  const take = takes[0];
  const speechRights = take
    ? z
        .object({
          commercial: z.boolean().optional(),
          rightsSource: z.string().optional(),
        })
        .passthrough()
        .safeParse(take.rights)
    : null;
  return {
    sources: [
      ...quranIds.map((id) => {
        const edition = quran.find((source) => source.id === id);
        return {
          importId: id,
          edition: edition?.name || "Unavailable Qur’an edition",
          sourceKind: "quran" as const,
          rightsStatus: edition?.rightsStatus || "unknown",
        };
      }),
      ...hadithIds.map((id) => {
        const edition = hadith.find((source) => source.id === id);
        return {
          importId: id,
          edition: edition?.edition || "Unavailable hadith edition",
          sourceKind: "hadith" as const,
          rightsStatus: edition?.rightsStatus || "unknown",
        };
      }),
    ],
    narration: {
      required: Boolean(c.voiceTakeId),
      cleared: Boolean(
        take &&
          speechRights?.success &&
          speechRights.data.commercial === true &&
          speechRights.data.rightsSource,
      ),
      provider: take?.provider || null,
    },
    media: {
      ids: compositionMediaIds(c.data),
      confirmed: declaration?.confirmed || false,
      notes: declaration?.notes || "",
    },
  };
}

export async function saveConsolidatedReview(episodeId: string, raw: unknown) {
  const input = consolidatedReviewInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const c = (
      await tx
        .select()
        .from(compositions)
        .where(
          and(
            eq(compositions.id, input.compositionId),
            eq(compositions.episodeId, episodeId),
          ),
        )
        .for("update")
    )[0];
    if (!c) throw new Error("COMPOSITION_NOT_FOUND");
    if (c.checksum !== input.compositionChecksum)
      throw new Error("COMPOSITION_REVIEW_CONFLICT");
    const output = (
      await tx
        .select()
        .from(videoExports)
        .where(
          and(
            eq(videoExports.id, input.exportId),
            eq(videoExports.compositionId, c.id),
          ),
        )
    )[0];
    if (!output) throw new Error("REVIEW_EXPORT_REQUIRED");
    const metadata = z
      .object({ compositionChecksum: z.string() })
      .passthrough()
      .parse(output.metadata);
    if (metadata.compositionChecksum !== c.checksum)
      throw new Error("EXPORT_REVISION_CHANGED");
    const data = compositionSchema.parse(c.data);
    if (
      input.decision === "approved" &&
      missingReviewChecks(input.checklist, Boolean(c.voiceTakeId)).length
    )
      throw new Error("REVIEW_CHECKLIST_INCOMPLETE");
    if (
      input.mediaRightsConfirmed &&
      compositionMediaIds(data).length &&
      !input.mediaRightsNotes
    )
      throw new Error("MEDIA_RIGHTS_NOTES_REQUIRED");
    const rights = await currentRights(c, {
      confirmed: input.mediaRightsConfirmed,
      notes: input.mediaRightsNotes,
    });
    return (
      await tx
        .insert(compositionReviews)
        .values({
          episodeId,
          compositionId: c.id,
          exportId: output.id,
          compositionChecksum: c.checksum,
          scriptChecksum: data.scriptChecksum,
          voiceChecksum: data.voiceChecksum,
          captionChecksum: data.captionChecksum,
          decision: input.decision,
          checklist: input.checklist,
          feedback: input.feedback,
          rightsSnapshot: rights,
        })
        .returning()
    )[0];
  });
}

export async function consolidatedReviewState(
  episodeId: string,
  saved: Composition[],
  rendered?: { id: string; compositionId: string }[],
) {
  const db = getDb();
  const reviews = await db
    .select()
    .from(compositionReviews)
    .where(eq(compositionReviews.episodeId, episodeId))
    .orderBy(desc(compositionReviews.createdAt), desc(compositionReviews.id));
  const outputs =
    rendered ??
    (saved.length
      ? await db
          .select({
            id: videoExports.id,
            compositionId: videoExports.compositionId,
          })
          .from(videoExports)
          .where(
            inArray(
              videoExports.compositionId,
              saved.map((c) => c.id),
            ),
          )
          .orderBy(desc(videoExports.createdAt), desc(videoExports.id))
      : []);
  const targets = saved.flatMap((c) => {
    const matching = outputs.filter((output) => output.compositionId === c.id);
    return matching.length
      ? matching.map((output) => ({ c, exportId: output.id as string | null }))
      : [{ c, exportId: null }];
  });
  const eligibility = await Promise.all(
    targets.map(async ({ c, exportId }) => {
      const review = reviews.find(
        (entry) =>
          entry.compositionId === c.id &&
          entry.compositionChecksum === c.checksum &&
          entry.exportId === exportId,
      );
      const declaration = review
        ? declarationSchema.safeParse(review.rightsSnapshot)
        : null;
      const rights = await currentRights(
        c,
        declaration?.success ? declaration.data.media : undefined,
      );
      const checklist = review
        ? reviewChecklistSchema.parse(review.checklist)
        : undefined;
      const blockers = publicationBlockers({
        exactReview: Boolean(review),
        decision: review?.decision as "approved" | "needs_changes" | undefined,
        checklist,
        rights,
      });
      return {
        compositionId: c.id,
        exportId,
        compositionChecksum: c.checksum,
        reviewId: review?.id || null,
        publicationReady: blockers.length === 0,
        blockers,
        rights,
      };
    }),
  );
  return {
    reviews: reviews.map((review) => ({
      id: review.id,
      compositionId: review.compositionId,
      compositionChecksum: review.compositionChecksum,
      exportId: review.exportId,
      decision: review.decision as "approved" | "needs_changes",
      checklist: reviewChecklistSchema.parse(review.checklist),
      feedback: review.feedback,
      mediaRightsConfirmed: declarationSchema.parse(review.rightsSnapshot).media
        .confirmed,
      mediaRightsNotes: declarationSchema.parse(review.rightsSnapshot).media
        .notes,
      createdAt: review.createdAt.toISOString(),
    })),
    eligibility,
  };
}
