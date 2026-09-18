# Verification and evidence

## Current checks

- `./init.sh`: frozen install followed by `pnpm check`.
- `pnpm check:harness`: document links and feature-record consistency, including one active feature and evidence for `passing`.
- `pnpm lint`: non-mutating ESLint; warnings fail.
- `pnpm typecheck`: TypeScript.
- `pnpm test`: Node/tsx unit tests for episode validation, model restrictions, provider credit/rights selection, and local request origins.
- `pnpm test:db`: creates a uniquely named disposable database, applies migrations twice, checks pgvector, persistence through a second connection, concurrent revision updates, and SQL constraints, then drops only that test database. Requires `DATABASE_URL` and database-creation privileges.
- `pnpm build`: production compilation; `next/font/google` may need network access.

`pnpm check` includes harness, lint, typecheck, and unit tests. Browser acceptance has been exercised manually through browser automation tools; there is no checked-in browser runner yet. Quran Foundation and OpenRouter retrieval/draft live checks are available. Credit/alignment and rendering fixture checks are implemented; actual speech/pilot acceptance remains pending. A harness check validates record structure, not the truth or sufficiency of evidence.

## Episode workspace acceptance

1. Run the database setup from [the environment guide](environment.md), then start the app on loopback.
2. Create an idea with a title, brief, theme, duration, format, model, and narration preference. Confirm a permanent episode URL and its appearance in the library.
3. Edit, save, reload, and restart the app. Confirm saved values persist. Check library search and its clear/empty state.
4. Keep an editor open, stop only this project's database with `pnpm db:stop`, edit the brief, and save. Confirm the failure message and intact input. Run `pnpm db:up`, retry, and confirm persistence. Never reload unsaved input as a recovery shortcut.
5. Check duration boundaries in unit/SQL tests and HTTP 422 for a 301-second request. Verify a stale revision receives HTTP 409 and a foreign origin receives HTTP 403 without modifying a record.
6. Inspect desktop and phone layouts, both composition sketches, keyboard-accessible controls, and the Providers page. Key presence must not be presented as a verified balance or connection.

Latest evidence: [episode studio acceptance](evidence/2026-09-14-episode-studio.md).

## Connected episode editor acceptance (F008)

Keep this checklist for regressions. The completed milestone used existing local artifacts and deterministic disposable fixtures; no model or speech calls were needed.

Latest evidence: [connected episode editor](evidence/2026-09-18-connected-editor.md).

1. Open the existing “When waiting feels heavy” episode from the library and its direct URL. Confirm an existing composition opens Video and retains the existing preview, settings, and prior export downloads. Open a script-only fixture and an idea-only fixture to check Script and Idea entry routing respectively.
2. Visit Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports through their links and direct URLs. Confirm the episode title stays consistent, exactly one section is current, and refresh preserves the addressed section. Existing script/source context, uploads, caption timing, and saved preview controls remain reachable.
3. On an idea-only episode, open every section. Confirm helpful empty states and that only actions missing prerequisites are disabled. Test malformed and valid-but-missing episode IDs; both must produce a not-found response without a server crash or database mutation.
4. Use deterministic job/revision fixtures for queued, running, failed, and stale states. Confirm a stale script/take/caption/composition does not receive a misleading ready state; text-only mode does not require a voice take. Stage status reads must not enqueue jobs or mutate artifacts.
5. Edit Idea, Script, and Studio forms without saving. Switch between Studio section queries and confirm local media edits survive. Exercise in-app links to another editor route and the library: cancel a discard warning and verify input survives, then accept and verify navigation completes. Check browser reload/close protection (`beforeunload`). Save and reload to confirm values persist and successful saves clear the warning. Dirty intra-episode Back/Forward recovery is verified for the mounted layout; persisted recovery after reload or restart remains a milestone 2 requirement. These guards do not imply autosave or history.
6. Open Exports and retrieve a prior MP4, captions, and source description. Verify current export availability respects unsaved/stale states and existing review/rights restrictions. Do not claim version-selection or new format controls; these are later milestones.
7. Exercise keyboard traversal and activation of section links, the active-location announcement, narrow-screen navigation, controls, and Player layout. Check both landscape and vertical preview selection where an existing composition is available.
8. Run `pnpm check`, applicable disposable database checks for summary queries, and `pnpm build`. Record observed browser paths, failures, and remaining gaps in a dated evidence file and `PROGRESS.md` before changing F008 to `passing`.

## Match checks to changes

| Change | Evidence |
| --- | --- |
| Docs/config | Harness checks and relevant startup commands |
| UI | Type/lint checks and exercise the changed browser path; include relevant keyboard, empty, and error states |
| Database | Disposable PostgreSQL/pgvector integration: constraints, migration from empty, repeat-run behavior |
| Sources/retrieval | Canonical fixtures, invalid references, context recovery, duplicate-free repeat import |
| Provider | Deterministic response/error fixtures plus a separately identified small live check when configured |
| Worker | Retry, cancellation, duplicate claim, restart/expired-lease recovery |
| Rendering | Short fixture; inspect both formats, probe duration/dimensions, listen for timing and clipping |
| Pilot | Idea → reviewed sources/script → narration/timing → preview → both files and reference description |

Use offline fixtures for routine checks. Live results must identify model/provider and authentication, cost, quality, or timing limitations. Never place credentials or bulk copyrighted datasets in fixtures.

## Status and handoff

`feature_list.json` uses `not_started`, `in_progress`, `blocked`, and `passing`, with at most one active feature. `blocked` needs a reason and recovery action; `passing` needs dated commands/manual steps and observed results. Preserve criteria/history when a feature regresses and explain its status change.

Update `PROGRESS.md` at session end with verified state, scope, results, unverified integrations, and the next bounded action. Link small evidence records under `docs/evidence/`. Large logs/media/screenshots belong in ignored `artifacts/` or `.data/`; explain reproduction instead of implying a fresh checkout contains them.

Do not repeat broad checks after relevant checks pass without another edit or unresolved concern. Stop temporary processes you started and record any intentionally running service. Preserve user changes.

## Source browser acceptance

Run `pnpm check`, `pnpm test:db`, and `pnpm build`. Source unit fixtures cover formatting, invalid references/editions, auth renewal, and sanitized failures. Disposable database checks cover failed-chapter recovery, atomic checkpoints, concurrent import exclusion, refreshed-content deduplication, preserved prior versions, search/context, and migration constraints. Fixtures are synthetic and are not live-provider evidence.

For a configured Quran Foundation account, run `pnpm sources:import 85`, repeat with `--refresh`, and run `pnpm sources:verify`. Confirm unchanged refresh reuses the same import ID and five representative passages match fresh authenticated responses. See [source workflow](sources.md) for the selected edition, scope, and rights status.

In `/sources`, test word search, chapter filter/pagination, reference `2:153` (context `2:151`–`2:155`), chapter-boundary context `1:7`, unavailable `94:5`, malformed reference, and Arabic/provenance disclosure. Check keyboard submit, mobile wrapping, empty library on a disposable migrated database, and database-offline messaging with an isolated unavailable connection.

Latest evidence: [source inspection acceptance](evidence/2026-09-14-source-inspection.md).

## Writing and media checks

See [writing evidence](evidence/2026-09-15-writing.md) and [media foundation evidence](evidence/2026-09-15-media-foundation.md) for live-versus-fixture boundaries. `pnpm writing evaluate` is an explicit live OpenRouter request and uses eligible credit. Routine tests mock provider responses.

`pnpm exec tsx scripts/render-fixture.ts` renders and probes two five-second tone fixtures and checks deterministic frame output. Then `pnpm exec tsx --conditions=react-server scripts/verify-media-workflow.ts` exercises the real durable render handler on a disposable database. Add `--serve` for a temporary production browser fixture on 3109; stop it to clean up that database. Neither fixture invokes speech or any model. Inspect both layouts, play the Player, save timing, verify stale previews, and retrieve MP4/SRT/description endpoints. Actual pronunciation, narration alignment and complete creator review must still be evaluated on the real pilot.

## Bring-your-own studio media

Run `pnpm check`, `pnpm test:db`, and `pnpm build`. `pnpm exec tsx --conditions=react-server scripts/verify-media-workflow.ts --variants` adds a synthetic GIF and tone, then renders narrated, text/music, and silent variants in both formats through the durable worker on a disposable database. It verifies codecs/streams, complete decoding and source descriptions. Run the existing render fixture first if its tone file is absent. `pnpm exec tsx scripts/verify-gif-frames.ts` checks the same GIF frame after a full loop is byte-identical and that a different GIF time changes the output in both layouts.

Browser checks: upload a GIF and an MP3 through the file chooser, verify optional source credit handling and selection, change sliders with the keyboard, save/reload, verify unsaved edits disable export, inspect mobile and both Player layouts, render and download. Do not substitute synthetic tones for creator listening acceptance. `pnpm media:seed` optionally creates two deterministic original instrumental sketches locally; no provider is called and no stock library is required.
