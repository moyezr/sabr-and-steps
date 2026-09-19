# Script versioning acceptance — 2026-09-19

Scope: F009, the script-first slice of `PLAN.md` milestone 2. No model or speech provider was called.

## Result

- Migration `0007_overjoyed_the_hand.sql` preserves every existing script revision, deterministically selects the same newest revision used before migration, labels history chronologically, and creates no working draft during backfill.
- Each episode now stores an explicit selected script and a separate revision-checked working draft. Script title and reflection edits autosave; canonical quotation blocks remain read-only and are rejected by the server if altered.
- A working draft can become a named immutable checkpoint or be discarded explicitly. History shows label, origin, model, generation instructions, and creation time. Selecting an older checkpoint drives writing, narration readiness, composition staleness, and workspace status.
- Restoring history creates a new revision whose parent is the restored source. Generating an alternative records fresh request input and appends history without changing an existing selection or working draft.
- Conflicting autosaves fail with a recoverable conflict response. The browser keeps local text and offers a refresh-and-retry path instead of replacing it silently.

## Automated checks

- `pnpm check`: harness, lint, TypeScript, and 28 unit tests passed.
- `pnpm test:db`: 4 PostgreSQL suites passed. Coverage includes fresh and legacy migration, deterministic backfill, concurrent autosave conflicts, named checkpointing, explicit selection, downstream invalidation, restore-as-new metadata, alternative generation, canonical quotation protection, and explicit draft discard.
- `pnpm build`: the production Next.js build passed.
- `git diff --check`: passed before the implementation commits.

## Browser journey

The rebuilt production app ran at `http://127.0.0.1:3107` against the existing “When waiting feels heavy” episode.

1. The Script & sources section loaded two immutable checkpoints and showed Version 2 as the persisted selection.
2. Editing Reflection 2 produced “Working draft saved.” Reloading recovered the exact added sentence. While the draft existed, selecting or restoring history was disabled and the named-version action was enabled.
3. The temporary draft was discarded through the revision-checked API and reload restored the original 265-word selected checkpoint. No QA draft or extra immutable version remains.
4. Selecting Version 1 immediately marked voice, video, and exports as needing an update. Selecting Version 2 again restored their saved/current states, proving the shared workspace follows the persisted selection.
5. At a 390 × 844 CSS-pixel viewport, the editor used the narrow layout and reported `scrollWidth: 375` for `innerWidth: 390`; the section navigation, generation controls, script blocks, and history remained reachable without horizontal overflow.

The creator's separate unsaved Music form state in the original browser tab was left untouched. Generation, restore-as-new, conflict, and immutable checkpoint behavior were exercised with deterministic database integration tests to avoid provider cost and permanent pilot-history clutter.

## Remaining milestone-2 work

F009 deliberately covers script state. Explicit selection for voice takes, caption tracks, and compositions; undo/redo; side-by-side comparison; and targeted AI rewrites remain later bounded slices.
