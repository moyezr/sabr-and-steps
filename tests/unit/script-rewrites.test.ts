import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReflectionRewrite,
  reflectionSelectionSchema,
  rewriteRequestSchema,
  rewriteResultSchema,
} from "../../lib/domain/script-rewrites";
import type { ScriptBlock } from "../../lib/domain/script";
import { parseReflectionRewritesResponse } from "../../lib/server/providers/openrouter";
import {
  createScriptEditHistory,
  recordScriptEdit,
  undoScriptEdit,
} from "../../lib/domain/script-editing";

const original = "Before. A tired heart can rest. After.";
const start = original.indexOf("A tired");
const selected = {
  blockIndex: 0,
  blockText: original,
  start,
  end: original.indexOf(" After."),
  text: "A tired heart can rest.",
};
const alternatives = [
  { text: "Let your heart pause.", reason: "Simpler invitation" },
  { text: "Rest can be a small step.", reason: "Practical encouragement" },
  { text: "Make room for a quiet moment.", reason: "Gentler tone" },
];
test("partial rewrites preserve later edits and canonical blocks, and enter undo history", () => {
  const quote: ScriptBlock = {
    kind: "quote",
    text: "Canonical words.",
    sourceId: "00000000-0000-4000-8000-000000000001",
    importId: "00000000-0000-4000-8000-000000000002",
    reference: "1:1",
    edition: "Fixture",
  };
  const blocks: ScriptBlock[] = [
    { kind: "reflection", text: original },
    quote,
    { kind: "reflection", text: "A later unrelated edit." },
  ];
  const result = applyReflectionRewrite(blocks, selected, alternatives[0].text);
  assert.equal(result[0].text, "Before. Let your heart pause. After.");
  assert.deepEqual(result[1], quote);
  assert.equal(result[2].text, blocks[2].text);
  const history = recordScriptEdit(
    createScriptEditHistory("fixture", 7, { title: "Title", blocks }),
    { title: "Title", blocks: result },
  );
  assert.deepEqual(undoScriptEdit(history).present.blocks, blocks);
  assert.equal(history.revision, 7);
  const withPrefix: ScriptBlock[] = [
    { kind: "reflection", text: `Later prefix. ${original}` },
  ];
  assert.equal(
    applyReflectionRewrite(withPrefix, selected, alternatives[0].text)[0].text,
    "Later prefix. Before. Let your heart pause. After.",
  );
  const withSuffix: ScriptBlock[] = [
    { kind: "reflection", text: `${original} Later suffix.` },
  ];
  assert.equal(
    applyReflectionRewrite(withSuffix, selected, alternatives[0].text)[0].text,
    "Before. Let your heart pause. After. Later suffix.",
  );
  const whitespaceSelection = {
    blockIndex: 0,
    blockText: "One. Two. Three.",
    start: 4,
    end: 10,
    text: " Two. ",
  };
  assert.equal(
    applyReflectionRewrite(
      [{ kind: "reflection", text: whitespaceSelection.blockText }],
      whitespaceSelection,
      "New words.",
    )[0].text,
    "One. New words. Three.",
  );
  assert.throws(
    () =>
      applyReflectionRewrite(
        [{ kind: "reflection", text: original.replace("tired", "hopeful") }],
        selected,
        alternatives[0].text,
      ),
    /REWRITE_TARGET_CHANGED/,
  );
  assert.throws(
    () => applyReflectionRewrite([quote], selected, alternatives[0].text),
    /REWRITE_TARGET_CHANGED/,
  );
  assert.throws(
    () => applyReflectionRewrite(blocks, selected, "x".repeat(2200)),
    /REWRITE_BLOCK_TOO_LONG/,
  );
});

test("rewrite schemas reject fabricated ranges, unsupported models, duplicate and incomplete alternatives", () => {
  assert.equal(
    reflectionSelectionSchema.safeParse({ ...selected, text: "fabricated" })
      .success,
    false,
  );
  assert.equal(
    reflectionSelectionSchema.safeParse({ ...selected, start: 100 }).success,
    false,
  );
  assert.equal(
    rewriteRequestSchema.safeParse({
      baseScriptId: "00000000-0000-4000-8000-000000000001",
      draftRevision: 0,
      episodeRevision: 1,
      model: "unapproved/model",
      selection: selected,
    }).success,
    false,
  );
  assert(
    rewriteResultSchema.safeParse({ supported: true, reason: "", alternatives })
      .success,
  );
  assert.equal(
    rewriteResultSchema.safeParse({
      supported: true,
      reason: "",
      alternatives: alternatives.slice(0, 2),
    }).success,
    false,
  );
  assert.equal(
    rewriteResultSchema.safeParse({
      supported: true,
      reason: "",
      alternatives: [alternatives[0], alternatives[0], alternatives[2]],
    }).success,
    false,
  );
  assert.equal(
    rewriteResultSchema.safeParse({
      supported: false,
      reason: "Unsafe request",
      alternatives,
    }).success,
    false,
  );
});

test("OpenRouter rewrite parsing rejects mismatched model, incomplete JSON and unsupported results", async () => {
  const model = "openai/gpt-5.6-luna";
  const response = {
    model,
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            supported: true,
            reason: "",
            alternatives,
          }),
        },
      },
    ],
  };
  assert.equal(
    (await parseReflectionRewritesResponse(response, model)).alternatives
      .length,
    3,
  );
  await assert.rejects(
    parseReflectionRewritesResponse(response, "google/gemini-3.8-flash"),
    /MODEL_RESPONSE_MISMATCH/,
  );
  await assert.rejects(
    parseReflectionRewritesResponse(
      {
        ...response,
        choices: [{ ...response.choices[0], finish_reason: "length" }],
      },
      model,
    ),
    /REWRITE_INCOMPLETE/,
  );
  await assert.rejects(
    parseReflectionRewritesResponse(
      {
        ...response,
        choices: [{ finish_reason: "stop", message: { content: "broken" } }],
      },
      model,
    ),
    /REWRITE_SCHEMA_INVALID/,
  );
  await assert.rejects(
    parseReflectionRewritesResponse(
      {
        ...response,
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                supported: false,
                reason: "Unsupported",
                alternatives: [],
              }),
            },
          },
        ],
      },
      model,
    ),
    /REWRITE_UNSUPPORTED/,
  );
});
