import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_EPISODE, episodeInputSchema } from "../../lib/domain/episode";

test("episode boundary rejects empty titles, invalid durations, and unapproved models", () => {
  const valid = { ...EMPTY_EPISODE, title: "A small beginning" };
  assert.equal(episodeInputSchema.safeParse(valid).success, true);
  for (const patch of [
    { title: "   " },
    { title: "a".repeat(141) },
    { targetSeconds: 59 },
    { targetSeconds: 301 },
    { targetSeconds: 120.5 },
    { targetSeconds: "120" },
    { llmModel: "openai/gpt-6-astra" },
    { narrationProvider: "openrouter" },
    { format: "square" },
    { purpose: "unknown" },
    { brief: "a".repeat(5001) },
  ]) {
    assert.equal(
      episodeInputSchema.safeParse({ ...valid, ...patch }).success,
      false,
      JSON.stringify(patch).slice(0, 100),
    );
  }
});

test("normalizes input and accepts both requested LLMs", () => {
  const input = episodeInputSchema.parse({
    ...EMPTY_EPISODE,
    title: "  A small beginning  ",
    llmModel: "google/gemini-3.8-flash",
    unexpected: "discarded",
  });
  assert.equal(input.title, "A small beginning");
  assert.equal("unexpected" in input, false);
});
