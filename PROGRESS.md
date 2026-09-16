# Progress

Last updated: 2026-09-16.

## Current state

- Repository: `/Users/moyezrabbani/Development/Projects/sabr-and-steps`.
- H001 and F001–F003 are complete. A real narrated private pilot has been generated in both formats. F005 is active for the creator’s configurable media workflow. F004 is paused for listening feedback; F006 publication/review acceptance remains pending.
- Branded Next.js 16.2.6 / React 19.2.6 / HeroUI 3.2.5 studio: persisted episode ideas, responsive editor, Providers configuration, and Sources browser with search, references, context, Arabic, and provenance.
- Drizzle 0.45.2, PostgreSQL 17, pgvector 0.8.2 are installed and migrated. The project uses its own Docker volume and loopback port 55432.
- Script options are exactly `openai/gpt-5.6-luna` and `google/gemini-3.8-flash` through OpenRouter. Episode preferences, retrieval/draft generation, a usage ledger and ElevenLabs quota/rights guards are implemented. Live ElevenLabs narration and both private pilot exports are verified.
- Startup: `./init.sh`, `pnpm db:configure`, `pnpm db:up`, `pnpm db:migrate`, then `pnpm dev --hostname 127.0.0.1`.
- Checks: `pnpm check`, `pnpm test:db` (3 suites), `pnpm build`. See the active session for the latest results and remaining verification.

## Latest session — 2026-09-16: establish Git history

- Maintenance requested by the creator: configure `origin` as `https://github.com/moyezr/sabr-and-steps.git`, use the authenticated `moyezr` account, and push a week-spanning commit history. The destination was empty and public when inspected.
- No previous development commits existed. The initial import is organized into seven logical groups with arranged author dates September 10–16 and actual committer timestamps. Every import commit identifies the reconstruction; these are not recovered daily snapshots. See D017 in `DECISIONS.md`.
- Fresh verification: `pnpm check` passed (harness, lint, TypeScript, 20 unit tests); `pnpm test:db` passed all three disposable database suites; `pnpm build` passed. Credential-pattern and local-secret matching scans of the 146 initial candidate files found no matches. `.env`, `.data`, dependencies, and build output remain ignored.
- Published all seven import commits (`09a0944` through `9a7bd3d`) to `origin/main` using `moyezr`. Remote `main` matched local `main` at `9a7bd3db7922cdafb1757b6867c47a03aef77e06`, and the working tree was clean. This publication record follows in a documentation-only commit with actual timestamps.
- No application behavior or feature status changed; F005 remains the single active feature. Future verified work should be committed in focused changes with actual timestamps.
- Next product action remains creator feedback on reading pace and mix, followed by exact-revision editorial review controls.

## Prior session — 2026-09-16: bring-your-own studio media

Creator requested configurable backgrounds/BGM and no-voiceover videos, selected soft instrumental audio, then clarified that uploads and a complete create → preview → edit → export workflow matter more than supplied stock assets. Implemented JPEG/PNG/WebP/GIF and MP3/WAV/M4A uploads, source notes, reading-card mode without speech, image framing/dimming, music level/loop/fades, preserved narration mode, immutable preview saves, and earlier export downloads. Video backgrounds are deferred. See [configurable studio evidence](docs/evidence/2026-09-16-configurable-studio.md).

- Checks: 20 unit tests/harness/lint/types, three disposable database suites, production build, durable render fixtures for all three sound modes in both formats, deterministic GIF animation/loop checks, browser uploads and settings persistence, mobile layout, and origin/range checks pass.
- A full text-only pilot revision `e1ef91d0-4c5e-4fea-a05e-fb31a5fbcc04` (148.1 seconds) was saved through the browser with the lake image, 25% music, 40% darkness and 3-second looped music fades. Job `beffceb2-b910-484e-9ed7-e2942bfc59ae` succeeded; export `6e725466-b1af-4053-b944-0a58a58908de` contains both 148.16-second MP4s. Full decoding, actual quotation frames, selected-music loop/fade measurements (peak −17.24 dB), and byte-identical vertical download pass. QC: `.data/studio-qa/verification.json` and `audio-verification.json`. It uses the existing script, no voice take and no new speech/model credits.
- Optional assets made before clarification: lake image `0c835165-bf63-4978-a39f-4b649266dfdb`; original instrumental sketches `b2ae2e31-8429-4b80-b21b-1c45f7d86103` and `ff0c5b77-e668-40ee-9313-bbcfc0ee6601`. All media stays ignored. User uploads are the primary workflow.
- F005 remains the single active feature while creator listening/aesthetic acceptance is pending. F004 is blocked on creator listening feedback, with recovery action to resume after review; F006 exact-revision editorial approval and publication clearance remain outstanding. No public upload, recurring job, paid speech fallback, or Git commit was made.
- Next bounded action: use creator-supplied backgrounds/audio and gather feedback on reading pace and mix; then finish exact-revision editorial review controls. Do not expand into video backgrounds or a stock library unless requested.

## Prior session — 2026-09-15: real private pilot generated

The creator replied **“Use ElevenLabs”**. The requested first real video is now generated in both formats. See [private pilot evidence](docs/evidence/2026-09-15-private-pilot.md). This is a private draft for consolidated review, not a publication-cleared or creator-approved episode.

- Pilot `f012f0d8-7236-4b39-a23b-e0a6c55bc37d`, **When waiting feels heavy**, revision 4. Script `136187f0-9a58-4941-b71a-828f1498a557` remains unreviewed; it contains the verified canonical translation of Qur’an 2:153 with its source context.
- ElevenLabs Brian / multilingual v2 generated a 95.1-second take (`b51d0011-2efc-44ec-9ee7-5a2f0b6c001b`). Native alignment and 51 caption phrases exactly match the script. Usage: 1,501 included characters; no paid fallback. Account reporting lag/stale reset handling was fixed so local settled usage remains part of the credit guard.
- Composition `ff08e322-4d4c-4846-baa5-bd3fdbc92e84`; render job `32855b1c-1857-4897-8ec3-11179ffdffe5` succeeded in 211.703 seconds. Export `975f1d55-f51a-4b20-9d7f-9860593a04a9` contains 1920×1080 and 1080×1920 H.264/AAC MP4s, each 95.765 seconds, plus SRT and a source-referenced description. Both full files decode, and downloaded bytes match local checksums. Actual frames and live Player playback were inspected.
- Local output directory: `.data/exports/ff08e322-4d4c-4846-baa5-bd3fdbc92e84/32855b1c-1857-4897-8ec3-11179ffdffe5/`. QC evidence: `.data/pilot-qa/verification.json`. All media and provider output remain ignored.
- Source/drafting history: remote 1536-dimensional index `c4291bd3-d181-4576-adbe-7c489fd23fdb` covers 293 pre-live passages. The labeled evaluation passed 5/5. Draft used allowed Luna. OpenRouter usage $0.00214733. [Writing evidence](docs/evidence/2026-09-15-writing.md), [media fixture evidence](docs/evidence/2026-09-15-media-foundation.md).
- Verification: final `pnpm check` (19 unit tests), three database suites, and production compilation pass. The earlier React server/Remotion boundary and empty editor crashes are fixed. Renders use an awaited child and versioned shared composition; edits make dependent assets stale.
- Next bounded action: creator review of the two draft videos, especially pronunciation, pacing and the quotation; then complete exact-revision consolidated review controls and any requested changes. F004 remains the single active feature because listening acceptance is pending. Do not mark F004/F005/F006 fully passing from these technical checks. Publication reuse for the translation and commercial speech rights remain uncleared; ambience is currently none.

## Source inspection session — 2026-09-14

Scope: F002. Implemented a server-only Quran Foundation adapter, reviewed source schema/migration, checkpointed foreground import worker, immutable completed source versions, and a Sources browser. The UI supports chapter/keyword browsing, 20-result pagination, direct verse context, Arabic, canonical links, source hashes, edition attribution, import recovery status, and explicit coverage/rights limitations.

Live findings: configured **pre-live** authentication works. The resource catalog exposes Abdel Haleem **85** and transliteration **57**; transliteration is excluded. Only chapters **1–2**, totaling **293 verses**, are available. Chapter 94 returns 404. All available verses are imported as `3b2564d8-6d5a-48e9-8ab8-93467f65d864`. This is not the full Qur’an. `pnpm sources:import 85 --refresh` re-fetched the corpus and reused the same version without duplicate database passages. `pnpm sources:verify` matched fresh API text, Arabic, references, and payloads at 1:1, 1:7, 2:153, 2:155, and 2:286.

Edition decision: resource 85 is selected for local inspection; **publication reuse is not cleared**. API edition info is empty. Quran.com directs translation rights to the rights holder; OUP publisher/permissions information was reviewed. No third-party message, permission application, paid inference, or narration was made. See [source workflow and rights record](docs/sources.md).

Verification: final harness/lint/TypeScript/13 unit tests, two disposable-database integration suites, and production build passed. Tests proved checkpoint recovery after a failed chapter, concurrent import exclusion, refresh deduplication, preservation of older versions, source validation, bounded authentication retry, and sanitized errors. Production browser checks covered search, chapter pagination, 2:153 context, chapter boundary, Arabic/provenance, keyboard submission, mobile layout, invalid/missing references, empty library, and offline database messaging. Final preview restart retained the imported corpus and working context view. See [dated evidence](docs/evidence/2026-09-14-source-inspection.md).

Next bounded action: **F003 — source-grounded editable drafts.** Begin with a small labeled retrieval evaluation (including unsupported queries), choose/version a remote embedding configuration, resolve quotations through immutable passage IDs, and persist script revisions and source-review state. Use only the two allowed OpenRouter script models. Carry the edition’s `not_cleared` publication status forward; obtain full production access and appropriate reuse evidence before treating imported material as production-ready. Sunnah access can remain pending.

## Episode workspace session — 2026-09-14

Scope: F001, plus the creator's direct speech credentials and model restrictions. Implemented the episode schema and migration, server-side validation and local-origin checks, revision-aware saves, graceful database failure states, library/search, editor/layout sketches, and configuration-only provider cards. Updated the harness and provider decisions. No paid or inference requests were made.

Verification: nine unit tests, zero-warning lint, TypeScript, production build, disposable-database migration/repeat migration, pgvector, persistence and concurrent-update tests passed. Browser create/edit/reload, database stop/recovery with preserved input, library search, mobile layouts, and reopening the persisted episode after switching from the development to production server passed. HTTP checks confirmed 422 for invalid duration, 409 for stale revision, and 403 for foreign origin. See [dated evidence](docs/evidence/2026-09-14-episode-studio.md).

A proposed 120-second pilot idea, **When waiting feels heavy**, is saved with the patience theme and both output formats. It is only a brief; sources and script still need research and review.

The next action from this episode session, F002, is now complete as recorded above.

## Running local services

- Docker container `sabr-and-steps-db-1` is intentionally left healthy for the creator's workspace. `pnpm db:stop` stops it without deleting data.
- The production preview is refreshed with the writing/studio build at `http://127.0.0.1:3107` (session 60794). Pilot studio: `/episodes/f012f0d8-7236-4b39-a23b-e0a6c55bc37d/studio`. The durable worker is intentionally running (session 90119), with no queued jobs at startup. Temporary previews on 3108/3109 are stopped. All disposable media databases were confirmed removed. The project database remains running.
- Disposable integration/UI databases were removed; temporary servers on 3108, 3110, and 3111 were stopped. Browser viewport override was reset. No personal records or database volumes were deleted.

## Setup session — 2026-09-14

Goal: inspect the creator's starter, settle stack choices, establish the harness, and document credentials.

Findings: no Git metadata existed; the starter ignored the pnpm lockfile but did not ignore `.env`. pnpm checks stopped on unresolved native build settings. Direct ESLint failed because a Next.js flat configuration was being passed through legacy FlatCompat. Direct TypeScript checking passed.

Changes: local Git initialized on `main`; project/env ignores corrected; pnpm pinned; explicit build settings for the three existing native dependencies; ESLint moved to Next.js native flat presets; starter theme hydration and obsolete lint suppression repaired; documentation, feature tracker, and executable harness checks added. No commits, remote, paid API calls, or product features created.

Verification: `./init.sh` and `pnpm build` passed. Development and production servers served the starter. Browser theme toggle and reload persistence passed. Ignore rules and four negative harness cases passed. See [dated evidence](docs/evidence/2026-09-14-initialization.md). Temporary servers and test tab were stopped/closed.

The next action from that setup session, F001, is now complete as recorded above.

## Remaining decisions and limitations

- The creator's OpenRouter, Cartesia, ElevenLabs, Deepgram, and Quran Foundation keys are present. Sunnah API access was requested by the creator and remains pending. Existing `.env` values were preserved; random local database settings were appended without printing secrets.
- Abdel Haleem resource 85 is selected for inspection with publication reuse `not_cleared`; obtain appropriate rights evidence or select a suitable edition, and arrange production API access for full coverage.
- Audition direct speech providers and verify actual balances and publication rights. Free credits do not automatically grant commercial rights. Speech account balances/authentication remain unverified; Quran Foundation authentication was verified separately. See [provider policy](docs/providers.md).
- Qur’an import and a foreground checkpointed source worker are implemented. Hadith ingestion remains unimplemented. Retrieval, AI drafts and the durable media queue are implemented; narration and rendering are under active verification as described above. Footnote explanations are not fetched; markers and raw attributes are retained. The video layout sketches remain explicitly labeled as sketches.
- Unit and database tests exist; browser acceptance was run through automation tools with documented steps, not a checked-in browser test suite.
- Git was initialized locally; all files remain uncommitted and no remote is configured.
