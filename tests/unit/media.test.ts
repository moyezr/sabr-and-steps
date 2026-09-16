import assert from "node:assert/strict";
import test from "node:test";
import {
  cuesFromAlignment,
  spokenSegments,
  validateCues,
  toSrt,
} from "../../lib/domain/media";
import type { ScriptBlock } from "../../lib/domain/script";
test("native alignment preserves every spoken word and rejects missing, mismatched or nonmonotonic timing", () => {
  const blocks: ScriptBlock[] = [
    { kind: "reflection", text: "A small step. Then another. 🌿" },
  ];
  const text = spokenSegments(blocks)
    .map((s) => s.text)
    .join("\n\n");
  const characters = Array.from(text);
  const alignment = {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * 0.08),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.08),
  };
  const cues = cuesFromAlignment(blocks, alignment);
  validateCues(cues, 4);
  assert.equal(cues.map((c) => c.text).join(" "), text);
  assert.match(toSrt(cues), /00:00:00,000 -->/);
  assert.throws(
    () => cuesFromAlignment(blocks, { ...alignment, characters: ["changed"] }),
    /MISMATCH/,
  );
  assert.throws(
    () =>
      cuesFromAlignment(blocks, {
        ...alignment,
        character_end_times_seconds: [],
      }),
    /MISSING/,
  );
  assert.throws(
    () =>
      cuesFromAlignment(blocks, {
        ...alignment,
        character_start_times_seconds: characters.map((_, i) =>
          i === 5 ? 0 : i * 0.08,
        ),
      }),
    /INVALID/,
  );
  assert.throws(
    () => validateCues([{ ...cues[0], start: 1, end: 0.5 }], 4),
    /INVALID/,
  );
  assert.throws(() => validateCues([{ ...cues[0], end: 8 }], 4), /INVALID/);
});

test("reading cards preserve quotation text and attribution without spoken prefixes or a voice take", async () => {
  const { readingCues, mixGains, musicEnvelope } = await import(
    "../../lib/domain/media"
  );
  const blocks: ScriptBlock[] = [
    {
      kind: "quote",
      text: "Synthetic quotation with enough words to span more than one reading card without changing any words.",
      reference: "1:1",
      edition: "Fixture",
      sourceId: "fixture",
      importId: "fixture",
    },
  ];
  const slow = readingCues(blocks, 70),
    fast = readingCues(blocks, 180);
  assert.equal(slow.map((c) => c.text).join(" "), blocks[0].text);
  assert(slow.every((c) => c.reference === "1:1" && c.edition === "Fixture"));
  assert(slow.at(-1)!.end > fast.at(-1)!.end);
  validateCues(slow, slow.at(-1)!.end + 0.6);
  assert.throws(
    () => readingCues([{ kind: "reflection", text: "word ".repeat(1000) }], 70),
    /TEXT_DURATION_TOO_LONG/,
  );
  const gains = mixGains(1, 1);
  assert(gains.narration + gains.music <= 0.950000001);
  assert.equal(musicEnvelope(0, 30, 10, 2), 0);
  assert.equal(musicEnvelope(150, 30, 10, 2), 1);
  assert.equal(musicEnvelope(285, 30, 10, 2), 0.25);
  assert.equal(musicEnvelope(300, 30, 10, 0), 0);
});
