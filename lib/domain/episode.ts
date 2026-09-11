import { z } from "zod";

export const LLM_MODELS = [
  "openai/gpt-5.6-luna",
  "google/gemini-3.8-flash",
] as const;
export const NARRATION_PROVIDERS = [
  "auto",
  "cartesia",
  "elevenlabs",
  "deepgram",
] as const;
export const THEMES = [
  "hope",
  "patience",
  "gratitude",
  "forgiveness",
  "trust",
] as const;

export const episodeInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this episode a title.")
    .max(140, "Use 140 characters or fewer."),
  brief: z.string().trim().max(5000, "Keep the brief under 5,000 characters."),
  theme: z.enum(THEMES),
  targetSeconds: z
    .number()
    .int()
    .min(60, "Choose at least 60 seconds.")
    .max(300, "Episodes can be at most 5 minutes."),
  llmModel: z.enum(LLM_MODELS),
  narrationProvider: z.enum(NARRATION_PROVIDERS),
  format: z.enum(["both", "landscape", "vertical"]),
  purpose: z.enum(["audition", "publish"]),
});

export const episodeUpdateSchema = episodeInputSchema.extend({
  revision: z.number().int().positive(),
});
export const episodeIdSchema = z.uuid();
export type EpisodeInput = z.infer<typeof episodeInputSchema>;
export type Episode = EpisodeInput & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_EPISODE: EpisodeInput = {
  title: "",
  brief: "",
  theme: "hope",
  targetSeconds: 120,
  llmModel: LLM_MODELS[0],
  narrationProvider: "auto",
  format: "both",
  purpose: "publish",
};

export function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
