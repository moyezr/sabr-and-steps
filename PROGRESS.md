# Progress

Last updated: 2026-10-05.

## Current state

- Repository: `/Users/moyezrabbani/Development/Projects/sabr-and-steps`.
- Working branch: `codex/script-block-editing`, based on the reconciled `main`, with an upstream at `origin/codex/script-block-editing`. Implementation commits are pushed to GitHub using the `moyezr` account.
- Passing: H001 and F001–F003, F008–F013. No feature is currently active. PLAN.md milestones 1 and 2 are complete. F004 and F005 wait for creator listening/aesthetic feedback; F006 still needs exact-revision review and creator approval.
- The connected editor exposes Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports for existing and incomplete episodes.
- Script models remain exactly `openai/gpt-5.6-luna` and `google/gemini-3.8-flash` through OpenRouter. Speech remains direct through configured providers with credit and rights checks.
- PostgreSQL 17/pgvector runs locally on loopback port 55432. Provider outputs and final assets remain in the ignored local data directory.
- The updated production app at `http://127.0.0.1:3107` and local database are intentionally running for creator review. The worker is stopped; there are no queued/running/uncertain jobs. Temporary browser fixtures were removed.

## Latest completed work

### GitHub synchronization — 2026-10-05

- The creator authorized pushing all local work. Fetched the remote and confirmed that only `5f83467` (retry clock fix) and `005bccf` (F013) were unpushed; both are now on `origin/codex/script-block-editing`.
- Existing `main` and `codex/episode-editor` were already synchronized. No credentials, local media, provider outputs, or ignored acceptance assets were included.
- The implementation retains its recorded passing acceptance evidence. This maintenance session changes only the handoff; harness and diff checks verify the documentation update.

### F013 — manual scripts, block editing, and source insertion — 2026-10-04

- Start a manual script without inference. Add/remove/reorder blocks, insert full canonical passages, and replace quotations after inspecting neighboring context in the episode source drawer. Existing autosave, undo/redo, named versions, and explicit selection apply to structural edits.
- Quote wording/attribution remains protected; server checks reject fabricated, altered, and mismatched canonical records. Working and saved context follows the actual quotation blocks. Empty reflections pause autosave visibly until completed or removed.
- Migration 0010 makes only script revision retrieval indexes nullable for honest manual provenance. Episode serialization uses locks compatible with checkpoint foreign keys. Existing pilot history/media and the restricted inference/provider policy are preserved.
- Desktop, 390 × 844, and an additional narrow layout passed; navigation/reload, context adoption/replacement, structural undo, and explicit conflict recovery passed on disposable fixtures. No inference or rendering was dispatched.
- Acceptance found and fixed the writing body-limit mismatch and an overflowing edition selector. An existing retry clock mismatch is fixed separately in commit `5f83467`, with a deterministic clock-skew regression.
- Evidence: [script block editing](docs/evidence/2026-10-04-script-block-editing.md). Final checks pass 42 unit tests, all five DB suites, production build, and diff/migration metadata checks.

### Main reconciliation — 2026-09-30

- Integrated all 22 editor commits from `codex/episode-editor` into `main` by fast-forward, preserving commit history. There was no divergence or merge conflict, and no other local/remote branch contained omitted work.
- Verified the contiguous migrations 0007–0009 and agreement among the roadmap, feature tracker, and handoff. Feature acceptance and outstanding creator feedback/rights limitations remain unchanged.
- `pnpm check` passed all 38 unit tests plus harness/lint/types; all five `pnpm test:db` suites, `pnpm build`, and `git diff --check` passed. The integrated code tree is identical to the previously verified editor branch; no live inference was used.
- Recorded this reconciliation in a focused documentation commit and synchronized both branch heads using the `moyezr` GitHub account. The checkout remains on `main`; ignored local media and credentials were preserved.

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

- `pnpm check`: harness, lint, TypeScript, and 42 unit tests pass.
- `pnpm test:db`: all five disposable database suites pass.
- `pnpm build` and `git diff --check` pass.
- The real local database is migrated through 0010. No provider inference was made for F008–F013. Temporary fixture servers and databases were removed; latest logs and verification images remain ignored under `.data/evidence/2026-10-04/`.

## Next bounded action

Continue PLAN.md milestone 3 with targeted partial AI rewrites: snapshot selected reflection text and instructions in durable jobs, retain alternatives from either permitted model, compare them with the original, and explicitly accept into the working draft without changing canonical quotes or later edits. Add its feature record and acceptance criteria before implementation.

F004/F005 still need creator listening and visual feedback, and F006 needs exact-revision consolidated review and creator approval. Hadith support, timeline/media controls, and format-specific export remain planned. Full Qur’an coverage and publication rights remain unresolved. F012 has deterministic acceptance only; no fresh live idea-model response or cost is claimed.
