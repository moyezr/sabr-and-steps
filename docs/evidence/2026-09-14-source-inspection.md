# F002 — Qur’an source inspection, 2026-09-14

## Scope

Server-only Quran Foundation adapter, resumable foreground import worker, source/version schema and migration, and `/sources` with filters, context, Arabic, references, provenance, coverage, and reuse status. F003 drafting is not implemented.

## Live source evidence

- Authenticated against the configured **pre-live** OAuth/API origins; no production endpoint or inference provider was called.
- Resource catalog returned 85 (`M.A.S. Abdel Haleem`, author field `Abdul Haleem`) and 57 (transliteration). Resource 57 is rejected for translation ingestion.
- Chapter catalog returned chapters 1 and 2 with 7 and 286 verses. Chapter 94 returned HTTP 404. The UI explicitly identifies 2/114 chapter coverage.
- `pnpm db:migrate` applied reviewed migration `0001_breezy_lord_tyger.sql` without modifying episode records.
- `pnpm sources:import 85` imported 293 verses. Import ID: `3b2564d8-6d5a-48e9-8ab8-93467f65d864`.
- `pnpm sources:import 85 --refresh` fetched all seven pages again, reused that same import ID, and left one completed edition/version containing 293 unique passages. During implementation, the new snapshot's checksums were finalized to use stable JSON ordering; its text was unchanged.
- `pnpm sources:verify` compared **1:1, 1:7, 2:153, 2:155, and 2:286** with fresh authenticated responses. Translation text, Arabic, reference, and provider verse payload matched for all five. This verifies identity against the API, not theological interpretation or publisher authorization.
- Edition info was empty. Reuse review is recorded as **not cleared** in the database/UI and [source workflow](../sources.md). No permission request, paid inference, narration, or publication occurred.

## Automated checks

- `pnpm check`: harness, zero-warning lint, TypeScript, and **13 unit tests** passed.
- `pnpm test:db`: **2 integration suites** passed against fresh disposable databases, each with repeat migrations. Existing episode checks remained passing.
- Source fixtures are synthetic, explicitly not scripture. They cover missing/wrong references and editions, unsupported HTML, entity/footnote normalization, auth retry limits, sanitized network/auth errors, and stable hashing.
- Database fixture failure after chapter 1 persisted three test passages and a failed run; a new invocation fetched only chapter 2 and completed. Concurrent advisory lock blocked a second importer. Unchanged refresh reused the original version without duplicate passages; changed fixture text created a new version while the old text/IDs stayed available. Context recovery, missing references, literal wildcard search, and SQL reference consistency were checked.
- `pnpm build` passed and included the dynamic `/sources` route.

## Browser acceptance

Production build tested on loopback port 3108 through the browser:

- Sources navigation opens the imported edition, translator/resource, 293 expected verses, completed available catalog, partial full-Qur’an coverage, and unresolved publication status.
- Word search `patience` returned the matching 2:250 passage. Chapter 2 filtering returned 286 verses; Next opened page 2 starting with 2:21.
- Reference `2:153` displayed context 2:151–2:155 and highlighted the requested verse. Arabic/provenance disclosure exposed Arabic, the stable record ID, and checksum.
- Reference `1:7` displayed only 1:5–1:7, without crossing chapter boundaries. Tab from the reference input focused Find sources; Enter submitted successfully.
- Reference `94:5` showed missing source coverage; malformed reference showed an explicit validation message. Source containers disable automatic browser translation.
- Desktop layout inspected; at **390×844**, verse cards and links wrapped without horizontal overflow (document scroll width 375 within a 390 viewport). Viewport override was reset.
- A separate freshly migrated disposable database served on 3110 showed the empty-library state. That database/server were removed afterward.
- A separate server on 3111 with an intentionally unavailable connection showed “Sources are unavailable” and retry guidance. The creator's actual database was not stopped or altered for this failure check.

## Limits and next action

Only the authenticated pre-live catalog is verified. Production/full-corpus access, reuse permission, footnote explanations, source interpretation review, and all model generation remain outstanding. The source worker has durable chapter checkpoints and exclusive process ownership, but the general media job queue is not implemented. No screenshot or bulk corpus is committed; payloads are private under `.data/sources`.

Next bounded feature: F003, source retrieval and versioned editable drafts with exact quotation resolution, no-support behavior, and explicit publication-rights state. See `PROGRESS.md` for final service state and handoff.
