# Episode studio acceptance — 2026-09-14

Scope: F001, persisted episode ideas, and the creator's speech-provider/model preferences. This is not evidence for source, LLM, speech, or video generation.

## Commands and results

- `pnpm install --frozen-lockfile`: passed after explicitly configuring esbuild alongside the starter's native build dependencies.
- `pnpm db:configure`: appended missing local database settings, preserving existing provider credentials and printing no secret values.
- `pnpm db:up`: pulled `pgvector/pgvector:0.8.2-pg17`; project container became healthy on loopback port 55432.
- `pnpm db:generate`: generated the initial episode migration. Reviewed the SQL, added the pgvector extension, and named it `0000_episode_studio`. `pnpm db:migrate` passed against the new project database.
- `pnpm test:db`: passed against a uniquely named disposable database. Applied migrations twice without duplicates, verified the vector extension, created/read an episode, read revision 2 through a separate pool, allowed exactly one of two simultaneous revision-1 updates, and rejected SQL duration/model violations. Test database was removed.
- Final `pnpm check`: passed harness validation, zero-warning ESLint, TypeScript, and all nine unit tests. Unit coverage includes duration/model boundaries, normalization, speech credits, unknown balances/rights, provider pinning, transcription priority, explicit paid selection, and request-origin regression cases.
- Final `pnpm build`: passed production compilation and route generation. Started the production server on loopback port 3107 for the restart check and creator preview.

## Browser and HTTP observations

1. Opened the workspace before database setup: a clear unavailable/setup state appeared. After migration, the empty library and starter ideas appeared.
2. Created **When waiting feels heavy**, a proposed 120-second pilot brief. The form navigated to a permanent episode URL. Reload retained the title, brief, duration, both-format preference, Luna model, and automatic speech preference.
3. Changed the theme to patience, saved, and reloaded. The selection persisted. The library showed the saved idea and its actual metadata.
4. Stopped only `sabr-and-steps-db-1` while keeping the editor open. Added a practical-step sentence and saved. HTTP 503 produced “The local database is unavailable. Your text is still here…” and retained the entire edited brief. Restarted the database; retry saved successfully.
5. Sent non-writing negative HTTP probes: 301-second POST returned 422 with the five-minute limit; foreign-origin POST returned 403; stale revision-1 PATCH returned 409 with conflict recovery guidance. No probe created or overwrote a record.
6. Library search with an unmatched phrase showed a clear empty state. Clear search restored the saved episode.
7. Providers displayed five of six configured services, Sunnah awaiting access, and balances/connections explicitly unchecked. No API calls or quota verification occurred.
8. Inspected desktop library/editor and a temporary 390×844 mobile viewport for editor and Providers. Text, controls, navigation, and form columns fit their layouts. Reset the viewport afterward. Both landscape and vertical composition sketches displayed the centered working title; these are not Remotion previews.
9. Stopped the development server, built, and started production. A fresh browser tab reopened the same episode with the updated brief and patience theme, confirming persistence across app and database restarts. The old dev tab had entered the browser's connection-refused page during restart and was replaced for this check.

## Fix found by acceptance testing

Initial browser saves returned 403 because Next.js normalized `request.url` to `localhost` while the browser used `127.0.0.1`. The origin check now compares the request's Origin with its Host authority, permits only loopback hostnames, and rejects cross-site/mismatched requests. A regression test covers the normalized URL case. The full browser create/edit flow passed after this fix.

## Limits and cleanup

The saved pilot is an editable suggestion, not approved content. No scripture is imported or quoted, no real account quota is known, and no inference credits were consumed. Public model IDs and plan terms were checked separately and documented in [provider policy](../providers.md); they do not establish this account's entitlements.

The disposable test database and development server were removed/stopped. The project database and production preview are intentionally running for review; see [PROGRESS.md](../../PROGRESS.md). No commits or remote changes were made. A fresh checkout must create its own database and does not contain this local pilot record.
