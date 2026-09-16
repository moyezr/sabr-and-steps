import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEmbeddingConfig,
  EMBEDDING_CONFIG,
  resolveDraft,
  validateScriptQuotes,
} from "../../lib/domain/script";
const source = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  importId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  reference: "1:1",
  text: "Synthetic canonical fixture.",
  edition: "Test edition",
};
test("draft quotes resolve only from canonical IDs; fabricated IDs and generated quote wording are rejected", () => {
  const draft = {
    title: "Fixture",
    supported: true,
    reason: "Fixture",
    blocks: [{ kind: "quote" as const, text: "", sourceId: source.id }],
  };
  const blocks = resolveDraft(draft, [source]);
  assert.equal(blocks[0].text, source.text);
  validateScriptQuotes(blocks, [source]);
  assert.throws(
    () =>
      resolveDraft(
        {
          ...draft,
          blocks: [{ kind: "quote", text: "changed", sourceId: source.id }],
        },
        [source],
      ),
    /MODEL_QUOTE_TEXT_NOT_ALLOWED/,
  );
  assert.throws(
    () =>
      resolveDraft(
        {
          ...draft,
          blocks: [{ kind: "quote", text: "", sourceId: "fabricated" }],
        },
        [source],
      ),
    /FABRICATED_SOURCE_ID/,
  );
  assert.throws(
    () => validateScriptQuotes([{ ...blocks[0], text: "changed" }], [source]),
    /CANONICAL_QUOTATION_CHANGED/,
  );
  assert.throws(
    () => resolveDraft({ ...draft, supported: false }, [source]),
    /NO_SUPPORTING_SOURCE/,
  );
});
test("embedding configurations reject model, dimension and preprocessing drift", () => {
  assertEmbeddingConfig(EMBEDDING_CONFIG);
  for (const config of [
    { ...EMBEDDING_CONFIG, model: "other" },
    { ...EMBEDDING_CONFIG, dimensions: 768 },
    { ...EMBEDDING_CONFIG, preprocessing: "other" },
  ])
    assert.throws(
      () => assertEmbeddingConfig(config),
      /INCOMPATIBLE_EMBEDDING_CONFIG/,
    );
});
