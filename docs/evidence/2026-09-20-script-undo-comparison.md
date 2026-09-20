# Script undo and comparison acceptance

Date: 2026-09-20  
Feature: F011

## Result

F011 passes and completes PLAN.md milestone 2. Script title and reflection edits have bounded undo/redo controls and platform keyboard shortcuts. Two immutable versions can be compared independently without changing the selected version or autosaved working draft.

## Automated evidence

- Pure history tests cover undo/redo, a 100-snapshot bound, redo clearing after a new edit, cloned quotation metadata, newest server revision preservation, and reset on base-script changes.
- LCS-based comparison tests cover stable unchanged anchors plus changed, removed, and added rows without cascading false differences after an insertion.
- `pnpm check` passed harness checks, lint, TypeScript, and 34 unit tests. `pnpm test:db` passed all four disposable database suites. `pnpm build` and `git diff --check` passed.

## Browser evidence

The production build at `http://127.0.0.1:3107` exercised the real “When waiting feels heavy” editor.

1. Title edits completed an Undo/Redo round trip with buttons, Ctrl+Z, and Ctrl+Shift+Z. A new edit after undo cleared redo.
2. Moving to Voice & captions and back retained the local title and undo history. After autosave, reload recovered the exact title while correctly resetting transient undo history.
3. A reflection edit was undone to the exact original text. The canonical quotation rendered without an editable textarea.
4. Version A and Version B selectors swapped the two checkpoints and showed the changed reflection while the editor title, selected-version badge, and working draft remained unchanged.
5. Two concurrent editor tabs produced a real optimistic draft conflict. Undo retained the local content, exposed redo, and kept the Save conflict state until explicit recovery.
6. At 390 × 844, undo controls, comparison selectors, titles, aligned block cards, and history remained readable. The document reported `innerWidth=390` and `scrollWidth=375`.

Temporary QA drafts were discarded, Version 2 remained selected, and no checkpoint was added. No LLM, speech, transcription, or rendering provider was called.

## Remaining plan work

Milestone 3 begins with idea assistance, then targeted script rewrites and source selection. Timeline/media controls and format-specific export remain milestones 4 and 5.
