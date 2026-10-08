# Format exports and consolidated review

## Implemented boundary

The Exports section requests landscape, vertical, or both from the exact saved composition checksum. The durable job retains that snapshot when another preview is selected while rendering. Legacy jobs without an orientation keep their original both-format behavior. Existing exports and download URLs remain available; an unrendered orientation returns 404 instead of offering a missing file.

The renderer checks global and scene background/media checksums, renders only requested formats, probes dimensions and duration, and retains script, voice, caption, composition, and format identifiers in metadata. MP4s, captions, and source descriptions remain private drafts. Hadith descriptions preserve the supplied collection, numbering scheme, grade and authority (including unknown values), translator, canonical source URL, and import identity alongside Qur’an attribution.

Consolidated review records a specific completed export and composition checksum, explicit creator checklist, feedback, decision, and uploaded-media rights declaration. It does not clear source licenses, change saved speech rights, or automatically approve any creator listening or aesthetic feedback. Publication eligibility checks each actually quoted Qur’an/hadith import, the persisted speech rights snapshot, and exact media declaration. A different composition needs a different review. Publication rendering/upload remains a separate, unimplemented action; current downloads retain the private-draft mark.

## Deterministic verification

- Three domain checks cover format compatibility, independent rights blockers, and narrated versus text-only checklist requirements.
- The disposable database test covers mismatched checksum/export rejection, incomplete approval rejection, retained feedback/history, unchanged source and stage rights, a new composition requiring new review, and legacy export preservation. It also accepts schema-valid escaped feedback above the generic 24 kB request limit while rejecting malformed/over-4 MB media bodies with a sanitized 422. The generic body limit remains unchanged.
- Actual 1.2-second synthetic v3 renders produced landscape-only, vertical-only, and both: four MP4 files at 1920 × 1080 / 1080 × 1920, within the duration tolerance, fully decoded by FFmpeg. The tests verified absent unrequested files, silent audio streams, checksum-checked scene image serving, cached completed-job reuse, and queued old-snapshot rendering after another preview was selected.
- Synthetic review records remained publication-blocked by the uncleared fixture edition and undeclared uploaded-media rights. No provider inference or actual creator approval was used.

Actual render reports and assets are ignored local evidence under `.data/evidence/format-exports/716505c1-7440-4bc2-bec5-b12e4cd87666/` and `.data/evidence/format-exports/8b984989-e941-4d33-a1b0-e2fe21c45ca7/`. Each directory contains `verification.json`, export metadata, source descriptions, and the generated test pattern. These short technical fixtures do not establish full-episode aesthetics, narration pronunciation, or creator acceptance.

## Reusable fixture

Run `pnpm exec tsx --conditions=react-server scripts/verify-format-exports.ts`. It creates and migrates a disposable database, executes the actual short renders/review assertions, leaves ignored evidence, and drops only that database.

After `pnpm build`, add `--serve` for a production browser fixture on port 3109. It supplies a text-only episode with editable reflection/quote/reflection blocks and retained exports/reviews, plus a second narrated fixture using a generated sine tone, editable caption phrases, image and audio uploads. The tone is explicitly synthetic and is not speech or listening evidence. Server inference keys are empty.

Stdin commands are `report`, `render`, `complete-rewrite`, `complete-ideas`, and `stop`. The completion commands use injected deterministic responses only. `report` exposes fixture selections, working drafts, jobs, export/review history, rights blockers, and the zero provider-usage count. `stop` kills the fixture server and drops its disposable database while preserving ignored evidence. Browser acceptance is recorded separately by the coordinating session.

Parent-session production browser acceptance is now recorded in [editor completion](2026-10-08-editor-completion.md), including explicit fixture/live limits. Earlier pending-browser notes describe the subagent handoff, not the final session state.
