import { z } from "zod";

export const ideaDirectionSchema = z
  .object({
    angle: z.string().trim().min(1).max(280),
    title: z.string().trim().min(1).max(140),
    hook: z.string().trim().min(1).max(280),
    takeaway: z.string().trim().min(1).max(500),
  })
  .strict();

const directionsSchema = z
  .array(ideaDirectionSchema)
  .length(3)
  .superRefine((directions, context) => {
    for (const field of ["angle", "title"] as const) {
      const seen = new Set<string>();
      directions.forEach((direction, index) => {
        const value = direction[field]
          .toLocaleLowerCase("en")
          .replace(/\s+/g, " ")
          .trim();
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            message: `Each direction needs a distinct ${field}.`,
            path: [index, field],
          });
        }
        seen.add(value);
      });
    }
  });

export const supportedIdeaDirectionsSchema = z
  .object({
    supported: z.literal(true),
    reason: z.literal(""),
    directions: directionsSchema,
  })
  .strict();

export const unsupportedIdeaDirectionsSchema = z
  .object({
    supported: z.literal(false),
    reason: z.string().trim().min(1).max(500),
    directions: z.array(ideaDirectionSchema).length(0),
  })
  .strict();

/** Provider-facing shape. Semantic supported/unsupported invariants are checked below. */
export const ideaDirectionsResponseSchema = z
  .object({
    supported: z.boolean(),
    reason: z.string().max(500),
    directions: z.array(ideaDirectionSchema).max(3),
  })
  .strict();

export type IdeaDirection = z.infer<typeof ideaDirectionSchema>;
export type IdeaDirectionsResult =
  | z.infer<typeof supportedIdeaDirectionsSchema>
  | z.infer<typeof unsupportedIdeaDirectionsSchema>;

export function parseIdeaDirectionsResult(raw: unknown): IdeaDirectionsResult {
  const result = ideaDirectionsResponseSchema.parse(raw);
  return result.supported
    ? supportedIdeaDirectionsSchema.parse(result)
    : unsupportedIdeaDirectionsSchema.parse(result);
}
