# Progress

Last updated: 2026-09-20.

## Current state

- Repository: `/Users/moyezrabbani/Development/Projects/sabr-and-steps`.
- Passing: H001 and F001–F003, F008–F010. F004 and F005 wait for creator listening/aesthetic feedback; F006 still needs exact-revision review and creator approval.
- The connected episode editor exposes Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports for existing and incomplete episodes.
- Script models remain exactly `openai/gpt-5.6-luna` and `google/gemini-3.8-flash` through OpenRouter. Speech remains direct through configured providers with credit and rights checks.
- PostgreSQL 17/pgvector runs locally on loopback port 55432. Provider outputs and final assets remain in the ignored local data directory.
- A production build is intentionally running at `http://127.0.0.1:3107` for creator review.

## Latest completed work

### F010 — explicit media selection

- Migration 0008 adds selected voice, caption, and composition pointers plus an optimistic selection revision. Backfill uses deterministic compatible `(created_at, id)` ordering and preserves existing artifacts and exports.
- Voice, caption, and preview history expose persisted selections. Same-episode and dependency checks reject invalid choices; incompatible downstream work stays visible as stale.
- The first completed narration selects itself only when no choice exists. Later alternatives keep the current selection, while explicit timing and preview saves create and select new immutable revisions.
- Workspace readiness, preview, render validation, and export currentness follow the selected composition and its dependencies. Text-only selections keep nullable voice/caption dependencies.
- Browser acceptance selected the pilot's older narrated Preview 1, verified it after reload, then restored text-only Preview 4 and verified the restoration after reload. The 390 × 844 layout had no horizontal overflow.
- No model, speech, transcription, or render provider was called. Multiple voice/caption selection cases used disposable deterministic fixtures because the pilot has one take and timing revision.
- Evidence: [explicit media selection](docs/evidence/2026-09-20-media-selection.md).

### Earlier editor milestones

- F008 connected the episode workspace, navigation, stage states, unsaved-edit protection, empty states, and existing exports. Evidence: [connected editor](docs/evidence/2026-09-18-connected-editor.md).
- F009 added revision-checked autosaved script drafts, immutable named checkpoints, explicit script selection, restore-as-new, and non-selecting alternatives. Evidence: [script versioning](docs/evidence/2026-09-19-script-versioning.md).

## Verification

- `pnpm check`: harness, lint, TypeScript, and 29 unit tests pass.
- `pnpm test:db`: all four disposable database suites pass.
- `pnpm build` and `git diff --check` pass.
- The real local database is migrated through 0008.

## Next bounded action

Add client undo/redo and side-by-side immutable script comparison for the remaining PLAN.md milestone-2 work. Keep the server draft revision as the persistence boundary, cap transient undo history, clear redo after new edits, and verify keyboard, reload, conflict, and mobile behavior before marking it complete.
