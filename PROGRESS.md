# Progress

Last updated: 2026-10-08.

## Current state

- Repository: `/Users/moyezrabbani/Development/Projects/sabr-and-steps`.
- Checkout: `main`. Verified editor completion commit `5b578b4` and the earlier F013 work are integrated by fast-forward and pushed to GitHub. `main` and `codex/editor-completion` were synchronized using the verified `moyezr` account; this final handoff update follows in a documentation commit.
- Passing: H001, F001–F003 and F008–F016. No implementation feature is active. F004/F005 require creator listening/aesthetic feedback; F006 requires exact-export pilot approval. F007 source support is implemented but real corpus acceptance is blocked. F017 full Qur’an access/reuse and F018 direct provider quota/dispatch remain blocked by documented external prerequisites. PLAN.md milestones 1–5 have technical editor delivery; this does not complete creator/publication acceptance.
- The connected editor exposes Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports for existing and incomplete episodes.
- Script models remain exactly `openai/gpt-5.6-luna` and `google/gemini-3.8-flash` through OpenRouter. Speech remains direct through configured providers with credit and rights checks.
- PostgreSQL 17/pgvector runs locally on loopback port 55432. Provider outputs and final assets remain in the ignored local data directory.
- The real production app is running at `http://127.0.0.1:3107` for creator review, with database migration 0011 applied. The existing “When waiting feels heavy” selection/media still opens saved and unchanged. Worker is stopped, no real queued/running/uncertain jobs remain, and temporary fixture servers/databases have been removed.

## Latest completed work

### Parallel editor completion — 2026-10-08

- Committed verified implementation as `5b578b4`, fast-forwarded `main` including the previously pending F013 work, and atomically pushed `main` and `codex/editor-completion`. The first attempt used another cached account and was rejected without changing the remote; explicit `moyezr` credentials then passed identity verification and synchronized both refs. Credentials and all generated media/evidence remain ignored.

- The creator explicitly requested all remaining implementation with subagents. F014 rewrites, F015 scenes/media controls, F016 format-specific exports/exact-export review, and F007 source paths were integrated with one reviewed additive migration. D024/D025 record scope and architecture.
- Targeted alternatives retain either permitted model and immutable input. Explicit acceptance preserves later text, uses autosave/undo, and leaves canonical quotations intact. Scene/caption/media controls save versioned data shared by live preview and render. Model/orientation preferences preserve valid narration through separate content validity.
- Each exported orientation/revision has its own review and draft feedback. New outputs do not inherit approval. Rights remain independent, and all current renders remain private watermarked drafts. Lost or expired workers cannot register an export.
- Hadith import/search/full context, immutable dedup, review gating, canonical insertion and description attribution are implemented. No real hadith corpus or API access is claimed. Provider access diagnostics expose unknown/denied quotas without generating speech or changing permissions.
- Final integrated checks pass 64 unit tests, ten DB suites, production build and diff checks. Production desktop/mobile journeys cover generation during editing, partial acceptance, structural/source checkpoints, caption save races, scene/mix persistence, old exports, independent format review, downloads and actual decoding. Only the bounded live Luna idea/rewrite checks dispatched inference: reported total $0.0006812. No new speech was generated.
- Evidence: [editor completion](docs/evidence/2026-10-08-editor-completion.md), [rewrites](docs/evidence/2026-10-08-targeted-rewrites.md), [hadith](docs/evidence/2026-10-08-hadith-support.md), [export/review](docs/evidence/2026-10-08-format-export-review.md). Raw outputs/screenshots/receipts remain ignored under `.data/evidence/2026-10-08/` and `.data/evidence/format-exports/`.

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

- `pnpm check`: harness, lint, TypeScript, and 64 unit tests pass.
- `pnpm test:db`: all ten disposable database suites pass.
- `pnpm build` and `git diff --check` pass.
- The real database is migrated through 0011 with existing content/media preserved. The migration upgrade/repeat and content validity backfill are verified. Provider inference remains absent for F008–F013 except the separately labeled live F012 Luna check on 2026-10-08; F014 also has one bounded live Luna check. No live Gemini inference or new speech is claimed.

## Next bounded action

Use the Exports review controls to watch/listen to the actual 90–120-second pilot, record pronunciation/music/visual feedback and approve that exact export when appropriate. F004–F006 are not completed by technical fixtures.

Supply approved Qur’an production access and translation-reuse evidence for F017, and a real reviewed hadith corpus or Sunnah API key for F007. Current Qur’an access remains chapters 1–2 (293 verses); neither source’s publication rights are cleared. For F018, provide verified eligible grant/pricing/rights and required balance-read access before implementing/dispatching direct Cartesia/Deepgram speech/STT. The current Deepgram key can list a project but cannot read its balance; Cartesia catalog access does not establish remaining credits.

Video-file backgrounds, mixed Qur’an editions and source footnote explanations remain deferred extensions. No recurring job, permission request, provider fallback, publication render or video upload was created.
