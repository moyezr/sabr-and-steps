# Qur’an source inspection

F002 imports an explicitly selected English edition and exposes it at `/sources`. It does not generate a script or approve publication.

## Selected inspection edition and rights

On 2026-09-14, authenticated Quran Foundation **pre-live** returned only resource **85**, `M.A.S. Abdel Haleem` (API `author_name`: `Abdul Haleem`), plus resource 57, which is transliteration and is rejected as a translation. The chapter catalog contains Al-Fatihah (7 verses) and Al-Baqarah (286 verses). All 293 available verses were imported. A chapter 94 request returned HTTP 404. This is **2 of 114 chapters**, not a complete Qur’an corpus.

The [publisher’s edition listing](https://www.oup.com.au/books/general-interest/religious-education/9780199535958) identifies Abdel Haleem’s translation with Oxford University Press. The API's edition-information response is empty and provides no reuse license. [Quran.com’s reuse guidance](https://quran.zendesk.com/hc/en-us/articles/115003652132-Using-content-from-Quran-com) directs translation permissions to the author/rightsholder. [OUP’s permissions guidance](https://academic.oup.com/pages/purchasing/rights-and-permissions) provides a route for reviewing a proposed use. No permission request was sent.

**Recorded reuse status: `not_cleared`.** This edition is selected for local source inspection, not as cleared production content. No open reuse grant or video/narration permission has been established. Attribution shown in the studio is translator, resource ID, environment, verse reference, and Quran.com link. Required publication credit wording remains to be confirmed with the applicable permission. Before production drafting/export, obtain suitable rights evidence or select an edition whose terms support the intended use. API access alone does not establish reproduction rights.

## Commands

```sh
pnpm db:migrate
pnpm sources:list                 # authenticated English resource catalog
pnpm sources:list 85              # edition information and small available samples
pnpm sources:import 85            # import, resume a failed run, or reuse completion
pnpm sources:import 85 --refresh  # re-fetch; deduplicate identical content
pnpm sources:verify              # live resource-85 comparisons for five references
```

`QURAN_TRANSLATION_ID` supplies the ID when the import command has no positional ID. No default is inferred if it is blank. `QF_ENV` defaults to `prelive`; credentials and fixed OAuth/API endpoints must move together when production access is approved. Resource 85 is the documented inspection choice, not an implicit fallback for another resource.

The client follows [Quran Foundation’s authentication flow](https://api-docs.quran.com/docs/quickstart/): server-only client credentials, cached content token, required headers, one token renewal/retry after an authentication rejection, 20-second request timeout, and no redirect forwarding of credentials. Non-authentication failures stop the run for explicit retry. Errors contain codes, never response bodies or credentials.

## Import and version behavior

The foreground CLI is a narrow durable source-import worker: it owns a PostgreSQL advisory lock, persists run state, and atomically commits each validated chapter with its checkpoint. It never runs inside a web request. A stopped process releases its database lock; rerunning resumes after the last committed chapter. A partial chapter is fetched again. A run still marked `running` after abrupt termination is displayed as running or interrupted; the next invocation can recover it. Concurrent import commands for the same resource are rejected.

Each page must agree with the chapter catalog's count and pagination. A chapter needs one selected translation and the exact ordered references for every verse. Unexpected HTML, missing translations, duplicate/gapped references, and incomplete pagination fail visibly. Catalog changes during an unfinished run fail closed (`QF_CATALOG_CHANGED_DURING_IMPORT`); manual inspection is required before any recovery that changes its scope. General queue scheduling, lease-based media jobs, and automatic backoff remain planned for F004.

Completed source versions retain their passage IDs. Normal repeat invocation returns the existing completion; `--refresh` fetches again and reuses the old version if its canonical checksum matches. Changed provider text or metadata creates a separate completed snapshot; older passages are retained. Refresh candidates that match an existing version are removed from the database, while their private raw files remain. A `result.json` in those run directories identifies the reused import. Checksums use stable JSON key ordering and SHA-256.

`source_imports` stores edition metadata, rights notes, environment, expected coverage, checkpoint state, error codes, and the snapshot checksum. `source_passages` stores exact references, normalized readable text, Arabic, provider verse payload, and its checksum. Full validated page payloads and metadata live privately under `APP_DATA_DIR/sources/<run-id>` (default `.data/sources`). Nothing from this corpus is checked into Git.

The text normalizer decodes HTML entities, removes known formatting, preserves visible footnote markers as `[footnote n]`, and rejects unexpected markup. The untouched provider verse payload remains the reference for exact original formatting and footnote attributes. The browser escapes text through React and disables automatic translation for source containers. Footnote explanations are not fetched yet; markers and raw attributes remain available for later editorial review.

## Browser behavior

The Sources navigation entry opens chapter and keyword browsing, edition/version selection, 20-result pagination, direct verse lookup with up to two verses on either side, Arabic, canonical links, and provenance. Context stays inside its chapter. A reference overrides word/chapter filters. Missing coverage and failed/incomplete imports are explicit; an empty library and database failure have separate messages.

Source text identity is not an interpretation review. The next feature must keep generated reflections separate, resolve quotations from immutable source IDs, report unsupported queries, and carry the edition's unresolved publication status into script review.
