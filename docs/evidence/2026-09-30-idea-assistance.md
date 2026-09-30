# Retained idea assistance acceptance — 2026-09-30

F012 completes milestone 3A. Three Luna subagents implemented the backend, editor UI, and schema/tests in parallel; the primary agent reviewed the integration and exercised the production browser. Existing unfinished F012 work was preserved and completed.

## Automated boundaries

- `pnpm check`: harness, zero-warning lint, TypeScript, and all 38 unit tests passed. The initial checkout failed two UI lint rules and an ES5-incompatible test loop; those were corrected without changing lint rules or compiler settings.
- `pnpm test:db`: all five disposable suites passed. Fresh and repeat migrations, additive retention of prior artifacts, exact three-result constraints, snapshot provenance, distinct new jobs, same-request idempotence/collision rejection, retry identity, episode scoping, selected-script/working-draft preservation, invalid/unsupported responses, cached result reuse, and lost-lease publication rejection were covered.
- `pnpm exec drizzle-kit check`: migration metadata passed. Migration 0009 was reviewed and applied to the real local database with `pnpm db:migrate`; no existing artifact was deleted.
- `pnpm build` and `git diff --check` passed. After browser-discovered fixes, targeted ESLint/TypeScript and a fresh production build passed again.

## Production browser acceptance

Used `pnpm exec tsx --conditions=react-server scripts/verify-ideas-workflow.ts --serve` with a unique disposable database and production server on port 3109. Fixture generators passed structured synthetic responses through the real parser and worker. No model/speech inference or provider credit was used. This is deterministic integration evidence, not a live-provider response.

1. Both permitted model labels appeared in retained history with creation time, original revision, and instructions. Changing the next-request model preserved the earlier sets.
2. Requested a fresh set, then edited the open brief while its job was queued. The worker completed separately; the manual edit remained exact and a third set appeared.
3. Explicitly adopted a title using Enter and a direction with its button. The editor reported unsaved work. Save and reload retained the exact title/angle/hook/takeaway brief and all saved sets.
4. Stopped a fixture job, used its keyboard-accessible retry action, and completed it. The same job ID changed from failed to succeeded, producing one retained set.
5. An uncertain fixture result showed its reconciliation message and no retry button. The API rejected retry with 409.
6. Rejected a foreign origin (403), unapproved model (422), stale episode revision (409), and missing/malformed IDs (404). Job and suggestion counts were unchanged.
7. Navigation exposed an existing empty-script null dereference: absent edit and selected IDs compared equal before reading blocks/title. Both guards were fixed. The final production run opened Script's useful empty state with an idea job queued, kept script generation scoped to draft jobs, and preserved the dirty idea across navigation.
8. Returning to Idea after generation while elsewhere refreshed the latest stored set, including when Next's cached route props were older. The dirty brief remained exact.
9. Desktop 1280 × 900 and mobile 390 × 844 CSS viewports passed without horizontal overflow. The browser had existing zoom, so physical overrides were adjusted to obtain those measured CSS dimensions; its zoom was preserved and viewport override reset afterward.

Ignored screenshots are under `.data/evidence/2026-09-30/idea-assistance-desktop.jpg` and `idea-assistance-mobile.jpg`. They show synthetic fixture data and are not tracked. All fixture servers were stopped, their child shutdown awaited, and their disposable databases removed; a query confirmed zero remaining `sabr_ideas_browser_*` databases.

## Handoff and limitations

The real app on port 3107 and durable worker are intentionally running for creator review. There were no queued/running/uncertain real jobs before starting the worker. The existing pilot, personal media, database volume, provider keys, and old exports were retained.

Live F012 model quality/cost has not been checked. Script block/source insertion, partial rewrites, timeline/media controls, final consolidated review, and hadith support remain planned. Creator audio/visual acceptance and production source/speech rights remain unresolved.
