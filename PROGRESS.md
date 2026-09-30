# Progress

Last updated: 2026-09-30.

## Current state

- Repository: `/Users/moyezrabbani/Development/Projects/sabr-and-steps`.
- Passing: H001 and F001–F003, F008–F012. No feature is currently active. PLAN.md milestones 1 and 2 are complete. F004 and F005 wait for creator listening/aesthetic feedback; F006 still needs exact-revision review and creator approval.
- The connected editor exposes Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports for existing and incomplete episodes.
- Script models remain exactly `openai/gpt-5.6-luna` and `google/gemini-3.8-flash` through OpenRouter. Speech remains direct through configured providers with credit and rights checks.
- PostgreSQL 17/pgvector runs locally on loopback port 55432. Provider outputs and final assets remain in the ignored local data directory.
- The verified production app at `http://127.0.0.1:3107` and durable worker are intentionally running for creator review. The local database had no queued/running/uncertain jobs before the worker was started.

## Latest completed work

### F012 — retained idea assistance

- The Idea section can develop the open form into three angle/title/hook/takeaway directions with either permitted model. Each set retains model, instructions, input snapshot, original saved revision, and creation time.
- Fresh requests append separate durable jobs; retries keep their original identity. Invalid/unsupported responses are rejected before persistence, and uncertain provider results require reconciliation. Result persistence checks the current worker owner and lease in a transaction.
- Completed suggestions never replace the saved brief, selected script, or working draft. Explicit title/brief adoption creates local unsaved work and uses the existing revision-checked save.
- Browser acceptance passed edits during generation, both-model history, adoption/save/reload, stopped-job retry, uncertain-result handling, section navigation, and 390 × 844 layout. Returning to Idea refreshes history even when cached route props predate a completed result.
- Acceptance also found and fixed an empty-script null dereference in the title/blocks memos. Script generation now ignores active jobs belonging to other stages. The final idea-only browser path opens Script safely and retains the dirty brief.
- Evidence: [retained idea assistance](docs/evidence/2026-09-30-idea-assistance.md). Checks used deterministic injected responses; no live inference was made.

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

- `pnpm check`: harness, lint, TypeScript, and 38 unit tests pass.
- `pnpm test:db`: all five disposable database suites pass.
- `pnpm build` and `git diff --check` pass.
- The real local database is migrated through 0009. No provider inference was made for F008–F012. Temporary fixture servers and databases were removed; verification images remain ignored under `.data/evidence/2026-09-30/`.

## Next bounded action

Continue PLAN.md milestone 3 with script block editing and source insertion: add/remove/reorder original reflection blocks and explicitly insert canonical passages with preserved attribution/context. Add its feature record and acceptance criteria before implementation; targeted partial AI rewrites follow as a separate slice.

F004/F005 still need creator listening and visual feedback, and F006 needs exact-revision consolidated review and creator approval. Hadith support, timeline/media controls, and format-specific export remain planned. Full Qur’an coverage and publication rights remain unresolved. F012 has deterministic acceptance only; no fresh live idea-model response or cost is claimed.
