import assert from "node:assert/strict";
import test from "node:test";
import type { ScriptBlock } from "../../lib/domain/script";
import {
  compareScriptBlocks,
  createScriptEditHistory,
  recordScriptEdit,
  redoScriptEdit,
  syncScriptEditHistory,
  undoScriptEdit,
} from "../../lib/domain/script-editing";

const quote: ScriptBlock = {
  kind: "quote",
  text: "Synthetic canonical fixture.",
  sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reference: "1:1",
  edition: "Test edition",
  importId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

function reflection(text: string): ScriptBlock {
  return { kind: "reflection", text };
}

function snapshot(title: string) {
  return { title, blocks: [reflection(`${title} reflection.`), quote] };
}

test("script edit history preserves quotation data through undo and redo", () => {
  const initial = createScriptEditHistory("script-a", 3, snapshot("First"));
  const edited = recordScriptEdit(initial, snapshot("Second"));
  const undone = undoScriptEdit(edited);
  assert.deepEqual(undone.present, snapshot("First"));
  assert.equal(undone.revision, 3);
  assert.deepEqual(undone.present.blocks[1], quote);

  const redone = redoScriptEdit(undone);
  assert.deepEqual(redone.present, snapshot("Second"));
  assert.equal(redone.revision, 3);
});

test("history is capped at 100 entries and a new edit clears redo", () => {
  let history = createScriptEditHistory("script-a", 1, snapshot("Edit 0"));
  for (let index = 1; index <= 105; index += 1)
    history = recordScriptEdit(history, snapshot(`Edit ${index}`));
  assert.equal(history.past.length, 100);

  for (let index = 0; index < 100; index += 1)
    history = undoScriptEdit(history);
  assert.equal(history.present.title, "Edit 5");
  assert.equal(history.past.length, 0);
  assert.equal(history.future.length, 100);

  history = recordScriptEdit(history, snapshot("A new direction"));
  assert.equal(history.future.length, 0);
  assert.equal(redoScriptEdit(history), history);
});

test("server revision sync keeps history for one base and resets for another", () => {
  const edited = recordScriptEdit(
    createScriptEditHistory("script-a", 2, snapshot("First")),
    snapshot("Second"),
  );
  const synced = syncScriptEditHistory(
    edited,
    "script-a",
    7,
    snapshot("Server copy"),
  );
  assert.equal(synced.revision, 7);
  assert.equal(synced.present.title, "Second");
  assert.equal(undoScriptEdit(synced).revision, 7);

  const reset = syncScriptEditHistory(
    synced,
    "script-b",
    1,
    snapshot("Other version"),
  );
  assert.equal(reset.baseScriptId, "script-b");
  assert.equal(reset.present.title, "Other version");
  assert.deepEqual(reset.past, []);
  assert.deepEqual(reset.future, []);
});

test("comparison aligns unchanged anchors and labels changed, removed, and added rows", () => {
  const left = [
    reflection("Opening"),
    reflection("Old detail"),
    reflection("Remove me"),
    quote,
  ];
  const right = [
    reflection("Opening"),
    reflection("New detail"),
    quote,
    reflection("Added ending"),
  ];
  const rows = compareScriptBlocks(left, right);
  assert.deepEqual(
    rows.map((row) => row.status),
    ["unchanged", "changed", "removed", "unchanged", "added"],
  );
  assert.deepEqual(
    rows.map(({ leftIndex, rightIndex }) => [leftIndex, rightIndex]),
    [
      [0, 0],
      [1, 1],
      [2, null],
      [3, 2],
      [null, 3],
    ],
  );
  assert.deepEqual(rows[3].left, quote);
  assert.deepEqual(rows[3].right, quote);
});

test("comparison uses a stable left-first tie break for duplicate alignments", () => {
  const first = reflection("First");
  const second = reflection("Second");
  const rows = compareScriptBlocks([first, second], [second, first]);
  assert.deepEqual(
    rows.map((row) => [row.status, row.leftIndex, row.rightIndex]),
    [
      ["removed", 0, null],
      ["unchanged", 1, 0],
      ["added", null, 1],
    ],
  );
  assert.deepEqual(compareScriptBlocks([first, second], [second, first]), rows);
});
