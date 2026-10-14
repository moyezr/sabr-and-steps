import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  assertAutomationBudget,
  automationProfileSchema,
  automationRequestSchema,
} from "../../lib/domain/automation";

test("automation profiles restrict models, duration, assets and cumulative reservation limits", () => {
  const profile = {
    name: "Calm reminders",
    importId: randomUUID(),
    model: "openai/gpt-5.6-luna",
    theme: "hope",
    targetSeconds: 120,
  };
  assert.equal(automationProfileSchema.parse(profile).maxEstimatedUsd, 0.05);
  for (const patch of [
    { model: "arbitrary-model" },
    { targetSeconds: 301 },
    { readingWpm: 10 },
    { imageId: "https://remote.example/image" },
    { maxEstimatedUsd: 1 },
    { maxEstimatedUsd: NaN },
    { name: " " },
  ])
    assert.equal(
      automationProfileSchema.safeParse({ ...profile, ...patch }).success,
      false,
    );
  assert.equal(
    automationRequestSchema.safeParse({
      profileId: randomUUID(),
      requestId: randomUUID(),
      title: "Hope",
      brief: " ",
    }).success,
    false,
  );
});
test("automation budget includes held and settled usage and rejects invalid totals", () => {
  assertAutomationBudget(0.02, 0.03, 0.05);
  for (const [spent, estimate, limit] of [
    [0.04, 0.02, 0.05],
    [NaN, 0.01, 0.05],
    [0, -0.01, 0.05],
    [0, 0.01, 1],
    [0, Infinity, 0.05],
  ])
    assert.throws(
      () => assertAutomationBudget(spent, estimate, limit),
      /AUTOMATION_BUDGET_EXCEEDED/,
    );
});
