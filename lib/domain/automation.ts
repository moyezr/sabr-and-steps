import { z } from "zod";
import { LLM_MODELS, THEMES } from "./episode";

export const automationProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  importId: z.string().uuid(),
  model: z.enum(LLM_MODELS),
  theme: z.enum(THEMES),
  targetSeconds: z.number().int().min(60).max(300),
  instructions: z.string().trim().max(2000).default(""),
  readingWpm: z.number().int().min(70).max(180).default(110),
  background: z.enum(["forest", "dusk", "sand"]).default("forest"),
  imageId: z.string().uuid().nullable().default(null),
  musicId: z.string().uuid().nullable().default(null),
  musicVolume: z.number().min(0).max(0.5).default(0.15),
  maxEstimatedUsd: z.number().finite().min(0.001).max(0.1).default(0.05),
});
export const automationRequestSchema = z.object({
  profileId: z.string().uuid(),
  requestId: z.string().uuid(),
  title: z.string().trim().min(1).max(140),
  brief: z.string().trim().min(1).max(5000),
});
export type AutomationProfileInput = z.infer<typeof automationProfileSchema>;
export type AutomationRequest = z.infer<typeof automationRequestSchema>;

export function assertAutomationBudget(
  spentOrHeld: number,
  estimate: number,
  limit: number,
) {
  if (
    !Number.isFinite(spentOrHeld) ||
    spentOrHeld < 0 ||
    !Number.isFinite(estimate) ||
    estimate < 0 ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    limit > 0.1 ||
    spentOrHeld + estimate > limit
  )
    throw new Error("AUTOMATION_BUDGET_EXCEEDED");
}
