import type { ScriptBlock } from "./script";

export const SCRIPT_EDIT_HISTORY_LIMIT = 100;

export type ScriptEditSnapshot = {
  title: string;
  blocks: ScriptBlock[];
};

export type ScriptEditHistory = {
  baseScriptId: string;
  revision: number;
  past: ScriptEditSnapshot[];
  present: ScriptEditSnapshot;
  future: ScriptEditSnapshot[];
};

export type ScriptBlockComparisonStatus =
  | "unchanged"
  | "added"
  | "removed"
  | "changed";

export type ScriptBlockComparisonRow = {
  status: ScriptBlockComparisonStatus;
  left: ScriptBlock | null;
  right: ScriptBlock | null;
  leftIndex: number | null;
  rightIndex: number | null;
};

function cloneBlock(block: ScriptBlock): ScriptBlock {
  return { ...block };
}

function cloneSnapshot(snapshot: ScriptEditSnapshot): ScriptEditSnapshot {
  return {
    title: snapshot.title,
    blocks: snapshot.blocks.map(cloneBlock),
  };
}

function blocksEqual(left: ScriptBlock, right: ScriptBlock) {
  if (left.kind !== right.kind || left.text !== right.text) return false;
  if (left.kind === "reflection" || right.kind === "reflection") return true;
  return (
    left.sourceId === right.sourceId &&
    left.reference === right.reference &&
    left.edition === right.edition &&
    left.importId === right.importId
  );
}

function snapshotsEqual(left: ScriptEditSnapshot, right: ScriptEditSnapshot) {
  return (
    left.title === right.title &&
    left.blocks.length === right.blocks.length &&
    left.blocks.every((block, index) =>
      blocksEqual(block, right.blocks[index]),
    )
  );
}

export function createScriptEditHistory(
  baseScriptId: string,
  revision: number,
  snapshot: ScriptEditSnapshot,
): ScriptEditHistory {
  return {
    baseScriptId,
    revision,
    past: [],
    present: cloneSnapshot(snapshot),
    future: [],
  };
}

export function recordScriptEdit(
  history: ScriptEditHistory,
  snapshot: ScriptEditSnapshot,
  limit = SCRIPT_EDIT_HISTORY_LIMIT,
): ScriptEditHistory {
  if (snapshotsEqual(history.present, snapshot)) return history;
  const boundedLimit = Math.max(0, Math.floor(limit));
  const past = [...history.past, cloneSnapshot(history.present)];
  return {
    ...history,
    past: boundedLimit === 0 ? [] : past.slice(-boundedLimit),
    present: cloneSnapshot(snapshot),
    future: [],
  };
}

export function undoScriptEdit(history: ScriptEditHistory): ScriptEditHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: cloneSnapshot(previous),
    future: [cloneSnapshot(history.present), ...history.future],
  };
}

export function redoScriptEdit(history: ScriptEditHistory): ScriptEditHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    ...history,
    past: [...history.past, cloneSnapshot(history.present)],
    present: cloneSnapshot(next),
    future: history.future.slice(1),
  };
}

export function syncScriptEditHistory(
  history: ScriptEditHistory,
  baseScriptId: string,
  revision: number,
  snapshot: ScriptEditSnapshot,
): ScriptEditHistory {
  if (history.baseScriptId !== baseScriptId)
    return createScriptEditHistory(baseScriptId, revision, snapshot);
  if (revision <= history.revision) return history;
  return { ...history, revision };
}

type Anchor = { leftIndex: number; rightIndex: number };

function comparisonAnchors(left: ScriptBlock[], right: ScriptBlock[]) {
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (
      let rightIndex = right.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      lengths[leftIndex][rightIndex] = blocksEqual(
        left[leftIndex],
        right[rightIndex],
      )
        ? lengths[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(
            lengths[leftIndex + 1][rightIndex],
            lengths[leftIndex][rightIndex + 1],
          );
    }
  }

  const anchors: Anchor[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (blocksEqual(left[leftIndex], right[rightIndex])) {
      anchors.push({ leftIndex, rightIndex });
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      lengths[leftIndex + 1][rightIndex] >=
      lengths[leftIndex][rightIndex + 1]
    ) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return anchors;
}

function appendGap(
  rows: ScriptBlockComparisonRow[],
  left: ScriptBlock[],
  right: ScriptBlock[],
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  const paired = Math.min(leftEnd - leftStart, rightEnd - rightStart);
  for (let offset = 0; offset < paired; offset += 1) {
    rows.push({
      status: "changed",
      left: cloneBlock(left[leftStart + offset]),
      right: cloneBlock(right[rightStart + offset]),
      leftIndex: leftStart + offset,
      rightIndex: rightStart + offset,
    });
  }
  for (let leftIndex = leftStart + paired; leftIndex < leftEnd; leftIndex += 1) {
    rows.push({
      status: "removed",
      left: cloneBlock(left[leftIndex]),
      right: null,
      leftIndex,
      rightIndex: null,
    });
  }
  for (
    let rightIndex = rightStart + paired;
    rightIndex < rightEnd;
    rightIndex += 1
  ) {
    rows.push({
      status: "added",
      left: null,
      right: cloneBlock(right[rightIndex]),
      leftIndex: null,
      rightIndex,
    });
  }
}

export function compareScriptBlocks(
  left: ScriptBlock[],
  right: ScriptBlock[],
): ScriptBlockComparisonRow[] {
  const anchors = comparisonAnchors(left, right);
  const rows: ScriptBlockComparisonRow[] = [];
  let leftStart = 0;
  let rightStart = 0;

  for (const anchor of anchors) {
    appendGap(
      rows,
      left,
      right,
      leftStart,
      anchor.leftIndex,
      rightStart,
      anchor.rightIndex,
    );
    rows.push({
      status: "unchanged",
      left: cloneBlock(left[anchor.leftIndex]),
      right: cloneBlock(right[anchor.rightIndex]),
      leftIndex: anchor.leftIndex,
      rightIndex: anchor.rightIndex,
    });
    leftStart = anchor.leftIndex + 1;
    rightStart = anchor.rightIndex + 1;
  }
  appendGap(
    rows,
    left,
    right,
    leftStart,
    left.length,
    rightStart,
    right.length,
  );
  return rows;
}
