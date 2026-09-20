# Progress

Last updated: 2026-09-20.

## Current state

- Repository: `/Users/moyezrabbani/Development/Projects/sabr-and-steps`.
- Passing: H001 and F001–F003, F008–F011. F012 is active. PLAN.md milestones 1 and 2 are complete. F004 and F005 wait for creator listening/aesthetic feedback; F006 still needs exact-revision review and creator approval.
- The connected editor exposes Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports for existing and incomplete episodes.
- Script models remain exactly `openai/gpt-5.6-luna` and `google/gemini-3.8-flash` through OpenRouter. Speech remains direct through configured providers with credit and rights checks.
- PostgreSQL 17/pgvector runs locally on loopback port 55432. Provider outputs and final assets remain in the ignored local data directory.
- A verified production build is intentionally running at `http://127.0.0.1:3107` for creator review.

## Latest completed work

### F011 — script undo and version comparison

- Title and reflection edits have a bounded 100-snapshot undo/redo history with buttons, Ctrl/Cmd+Z, Ctrl+Y, and Ctrl/Cmd+Shift+Z. New edits clear redo.
- History survives movement among mounted episode sections and resets on reload; the autosaved working draft remains durable. Undo never rolls back the newest optimistic server revision.
- A newer conflicting server draft retains local content/history and keeps the explicit recovery path instead of silently overwriting either copy.
- Any two immutable script versions can be compared independently. LCS anchors align unchanged blocks while changed, added, and removed gaps remain visible; the working draft and selected version are unaffected.
- Browser acceptance covered title/reflection edits, keyboard controls, navigation, reload, two-tab conflict, comparison, read-only quotations, and 390 × 844 layout. Temporary drafts were removed and Version 2 remains selected.
- Evidence: [script undo and comparison](docs/evidence/2026-09-20-script-undo-comparison.md).

### Earlier editor milestones

- F008 connected navigation, stage states, unsaved-edit protection, empty states, and existing exports. Evidence: [connected editor](docs/evidence/2026-09-18-connected-editor.md).
- F009 added autosaved script drafts, immutable checkpoints, selection, restore-as-new, and non-selecting alternatives. Evidence: [script versioning](docs/evidence/2026-09-19-script-versioning.md).
- F010 added explicit voice, caption, and composition selection with immutable media histories. Evidence: [media selection](docs/evidence/2026-09-20-media-selection.md).

## Verification

- `pnpm check`: harness, lint, TypeScript, and 34 unit tests pass.
- `pnpm test:db`: all four disposable database suites pass.
- `pnpm build` and `git diff --check` pass.
- The real local database is migrated through 0008. No provider call was made for F008–F011.

## Active bounded work

F012 starts PLAN.md milestone 3 with idea assistance: turn a vague feeling or scenario into retained angle, title, hook, and takeaway suggestions using either permitted model, without replacing the saved episode brief or current script.
