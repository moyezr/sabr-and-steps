import assert from "node:assert/strict";
import test from "node:test";
import {
  ideaDirectionSchema,
  parseIdeaDirectionsResult,
  supportedIdeaDirectionsSchema,
  unsupportedIdeaDirectionsSchema,
} from "../../lib/domain/ideas";
import {
  parseIdeaDirectionsResponse,
  ProviderError,
} from "../../lib/server/providers/openrouter";

const model = "openai/gpt-5.6-luna";
const directions = [
  {
    angle: "Waiting without reading silence as rejection",
    title: "When waiting feels heavy",
    hook: "You can be tired of waiting without giving up hope.",
    takeaway: "Name one small action that remains within your control today.",
  },
  {
    angle: "Making room for grief and trust at the same time",
    title: "Trust can hold a tired heart",
    hook: "Faith does not require you to pretend this is easy.",
    takeaway: "Write one honest sentence about the difficulty before reflecting.",
  },
  {
    angle: "Turning an uncertain season into a gentle next step",
    title: "A small step while the answer is unclear",
    hook: "You do not need the whole path to choose the next kind step.",
    takeaway: "Choose one useful task that takes less than ten minutes.",
  },
];

const supported = { supported: true as const, reason: "" as const, directions };

test("idea directions require exactly three distinct, bounded suggestions", () => {
  assert.deepEqual(parseIdeaDirectionsResult(supported), supported);
  assert.throws(
    () =>
      ideaDirectionSchema.parse({
        angle: directions[0].angle,
        title: directions[0].title,
        hook: directions[0].hook,
      }),
    /takeaway/,
  );
  assert.throws(
    () => ideaDirectionSchema.parse({ ...directions[0], nextStep: "Extra field" }),
    /Unrecognized key/,
  );
  assert.throws(
    () =>
      supportedIdeaDirectionsSchema.parse({
        ...supported,
        directions: directions.slice(0, 2),
      }),
    /Too small/,
  );
  assert.throws(
    () =>
      supportedIdeaDirectionsSchema.parse({
        ...supported,
        directions: [...directions, { ...directions[2], title: "Another" }],
      }),
    /Too big/,
  );
  assert.throws(
    () =>
      supportedIdeaDirectionsSchema.parse({
        ...supported,
        directions: [directions[0], directions[1], { ...directions[2], angle: `  ${directions[0].angle.toUpperCase()}  ` }],
      }),
    /distinct angle/,
  );
  assert.throws(
    () =>
      supportedIdeaDirectionsSchema.parse({
        ...supported,
        directions: [directions[0], directions[1], { ...directions[2], title: directions[0].title.toUpperCase() }],
      }),
    /distinct title/,
  );
  assert.throws(
    () => parseIdeaDirectionsResult({ ...supported, extra: true }),
    /Unrecognized key/,
  );
});

test("supported and unsupported result invariants cannot be mixed", () => {
  const unsupported = {
    supported: false as const,
    reason: "This request asks for a religious ruling.",
    directions: [],
  };
  assert.deepEqual(parseIdeaDirectionsResult(unsupported), unsupported);
  assert.throws(
    () => unsupportedIdeaDirectionsSchema.parse({ ...unsupported, reason: "" }),
    /Too small/,
  );
  assert.throws(
    () =>
      parseIdeaDirectionsResult({
        ...unsupported,
        directions: [directions[0]],
      }),
    /Too big/,
  );
  assert.throws(
    () => parseIdeaDirectionsResult({ ...supported, reason: "A reason" }),
    /Invalid input/,
  );
});

function envelope(content: unknown, overrides: Record<string, unknown> = {}) {
  return {
    model,
    choices: [
      {
        message: { content: JSON.stringify(content) },
        finish_reason: "stop",
      },
    ],
    ...overrides,
  };
}

function providerCode(action: () => unknown) {
  assert.throws(action, (error) => {
    assert(error instanceof ProviderError);
    return true;
  });
  try {
    action();
  } catch (error) {
    return (error as ProviderError).message;
  }
}

test("OpenRouter idea response parsing returns supported directions", () => {
  assert.deepEqual(parseIdeaDirectionsResponse(envelope(supported), model), supported);
});

test("OpenRouter idea response parsing rejects incomplete, mismatched, malformed, and unsupported results", () => {
  assert.equal(
    providerCode(() =>
      parseIdeaDirectionsResponse(envelope(supported, { model: "other" }), model),
    ),
    "MODEL_RESPONSE_MISMATCH",
  );
  const incomplete = envelope(supported);
  incomplete.choices[0].finish_reason = "length";
  assert.equal(
    providerCode(() => parseIdeaDirectionsResponse(incomplete, model)),
    "IDEA_DIRECTIONS_INCOMPLETE",
  );
  assert.equal(
    providerCode(() =>
      parseIdeaDirectionsResponse(
        {
          model,
          choices: [{ message: { content: "{" }, finish_reason: "stop" }],
        },
        model,
      ),
    ),
    "IDEA_DIRECTIONS_SCHEMA_INVALID",
  );
  assert.equal(
    providerCode(() =>
      parseIdeaDirectionsResponse(
        envelope({
          supported: false,
          reason: "This requires a religious ruling.",
          directions: [],
        }),
        model,
      ),
    ),
    "IDEA_DIRECTIONS_UNSUPPORTED",
  );
});
