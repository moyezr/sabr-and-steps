import test from "node:test";
import assert from "node:assert/strict";
import { availableSpeechCharacters } from "../../lib/domain/speech-credits";
const account = {
  character_count: 0,
  character_limit: 10000,
  next_character_count_reset_unix: 100,
};
const take = (count: number, actual: number, created: number, reset = 100) => ({
  state: "settled",
  estimated: actual,
  actual,
  details: {
    account: { character_count: count, next_character_count_reset_unix: reset },
  },
  createdAt: new Date(created),
});
test("settled speech is deducted during quota lag, without double counting after provider reconciliation", () => {
  const usage = [take(0, 1501, 1)];
  assert.equal(availableSpeechCharacters(account, usage), 8499);
  assert.equal(
    availableSpeechCharacters({ ...account, character_count: 1501 }, usage),
    8499,
  );
  assert.equal(
    availableSpeechCharacters(
      { ...account, next_character_count_reset_unix: 200 },
      usage,
    ),
    10000,
  );
});
test("later snapshots include external consumption and outstanding concurrent reservations", () => {
  const usage = [
    take(0, 1501, 1),
    take(3501, 1000, 2),
    { ...take(0, 500, 3), state: "reserved" },
  ];
  assert.equal(
    availableSpeechCharacters({ ...account, character_count: 3501 }, usage),
    4999,
  );
  assert.equal(
    availableSpeechCharacters({ ...account, character_count: 4501 }, usage),
    4999,
  );
});
test("a stale past reset in the dispatch snapshot does not erase a recent local charge", () => {
  assert.equal(
    availableSpeechCharacters(
      { ...account, next_character_count_reset_unix: 200 },
      [take(0, 1501, 150000, 100)],
    ),
    8499,
  );
});
