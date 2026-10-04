# Script block editing and source insertion — 2026-10-04

F013 completes PLAN.md milestone 3B. Targeted AI rewrites and the later timeline/media/export milestones remain planned. All provider-related checks below use deterministic fixtures; no model, embedding, speech, or rendering request was dispatched.

## Delivered behavior

- An empty episode starts from a manual title and opening reflection, with a completed source edition selected. Its initial immutable checkpoint records `manual` provenance and no embedding index. Unsaved manual words disable first generation until explicitly saved or cleared.
- Add reflections at the beginning, end, or after a selected block. Remove and move both reflection and quotation blocks with accessible buttons. Structural edits and source adoption share existing undo/redo, optimistic autosave, checkpointing, and conflict recovery.
- Empty new reflections stay local with an explicit autosave-paused explanation. Valid scripts contain one to thirty blocks. Working edits are identified as unreviewed; saved checkpoints retain their own review state.
- The source drawer searches the script's edition by words, chapter, or exact reference. It displays translator, corpus coverage, reuse status, and surrounding context before explicit full-verse insertion or quotation replacement. Quote wording and attribution are read-only.
- Server validation rejects fabricated IDs, wrong imports/editions/references, changed canonical text, and blank reflection content. Working/history context derives from actual canonical quote IDs; checkpoints persist updated context instead of inheriting stale retrieval candidates.
- Migration 0010 only makes `script_revisions.index_id` nullable. Its generated snapshot matches 0009 after accounting for that single change and snapshot IDs. Generated scripts retain real retrieval indexes.

## Automated evidence

- Baseline `pnpm check` passed 38 unit tests before implementation.
- Final `pnpm check` passed harness, zero-warning lint, TypeScript, and all 42 unit tests. New coverage includes structural undo with canonical provenance/latest revisions, and source query bounds/normalization.
- Final `pnpm test:db` passed all five integration suites. The expanded writing suite checks simultaneous manual starts, null-index/manual provenance, no jobs/provider usage, late generated alternatives, canonical tampering/fabrication/wrong-edition rejection, structural autosave/reload, stale revisions, fresh checkpoint/working context, and source removal.
- Actual writing POST tests accept thirty full 2,200-character reflections even with expanded JSON escapes (~396,000 serialized characters). Other routes retain the 24,000-character default. Oversized (>512,000) and malformed writing bodies return sanitized HTTP 422 without changing the saved revision.
- Deterministic lock regression holds a workspace lock, starts the actual manual/first-selection operation, observes its lock wait in PostgreSQL, and inserts a checkpoint under a 1.5-second statement timeout. The new episode `FOR NO KEY UPDATE` locks serialize starts while permitting foreign-key `KEY SHARE`; selection remains explicit.
- Final `pnpm build` and `git diff --check` passed. The real local database was migrated through 0010. Existing saved script and source context endpoints returned HTTP 200 after production startup, without mutation; source responses omit raw payloads, Arabic, and checksums.

## Browser evidence

Used `scripts/verify-script-editing.ts --serve` with a disposable migrated database and synthetic passages clearly labeled as fixture text. The temporary server disables provider keys and runs no worker.

- Added a blank reflection and observed the paused-autosave explanation and unsaved state. Entered text, moved the block, and exercised undo/redo buttons.
- Searched `patience`, inspected 1:2 with neighboring passages, and inserted its full canonical block. Replaced the existing 1:3 quotation with 1:4, removed a reflection, and checked that both new references retained canonical text/edition attribution.
- Navigated to Music and back: words, structure, and undo history remained. Reload recovered the autosaved blocks and reset transient history. Saved `Browser edited blocks` as a new unreviewed checkpoint; original reviewed history remained unchanged.
- Simulated another writer with the fixture's `conflict` command. The next save displayed `Save conflict` while preserving local words. Explicit replacement recovered, and Cmd+Z/Cmd+Shift+Z continued to work.
- Checked missing reference 94:5, malformed reference `bad`, and chapter 2 search. Messages accurately describe unavailable coverage or invalid syntax; no fabricated passage is offered.
- Started/reloaded the empty episode manually. First generation was disabled while its opening was unsaved. Inserted a reflection at the beginning and a canonical passage into that manual script; persisted structure and source context remained correct.
- Verified a two-column desktop layout at a measured 1231-pixel viewport and a 390 × 844 phone viewport. Source search/context, block controls, and attribution remained usable with no horizontal overflow. An additional 300-pixel check also passed after correcting an overflowing edition selector and wrapping navigation.
- Fixture `report` confirmed zero jobs and provider usage. Both temporary servers/databases were removed; the database catalog contained zero `sabr_script_browser_*` databases at cleanup.

Ignored local evidence is under `.data/evidence/2026-10-04/`: `check.log`, `database.log`, `build.log`, `script-editor-desktop.jpg`, and `script-editor-mobile.jpg`.

## Failures found and fixed

- Valid multi-block requests exceeded the original generic request limit. A writing-specific bounded limit and actual POST regression now cover the existing schema's full capacity.
- Narrow-screen source edition text overflowed its field. Explicit minimum widths and wrapping navigation removed the overflow.
- The first full database run failed an existing idea retry's immediate worker claim. Retry eligibility used the application clock while claims used PostgreSQL time. Commit `5f83467` switches immediate retries to database `now()`. A client clock one minute ahead reproduces the old failure and passes after the fix; the final full database run passes without weakening success/identity assertions or adding test polling.

## Limits and next action

One completed source edition remains the boundary per script. Full Qur'an coverage, publication reuse, hadith support, creator listening/aesthetic acceptance, and exact-export review are unchanged. No new live model evidence is claimed. History context currently adds database reads per immutable revision; batch it if large histories make that measurable.

The updated production app and local database remain running for creator review at `http://127.0.0.1:3107`. No worker is running and no queued/running/uncertain jobs remain. Next bounded action: targeted partial AI rewrites, retained as suggestions until explicit acceptance into the working draft.
