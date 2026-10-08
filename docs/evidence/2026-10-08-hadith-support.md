# Hadith source support — 2026-10-08

## Delivered behavior

- `/sources/hadith` imports bounded reviewed manual datasets and inspects complete reports, original numbering schemes and alternate references, collection/book/chapter context, narrator, supplied grades and grading authorities, canonical links, review evidence, coverage and reuse notes.
- Blank input templates contain no invented religious wording, grades, review evidence or rights. Unknown narrator/translator/grade authority remains explicit. An empty grade list is displayed as unknown, without inferring a grade from a collection name.
- Identical inputs retain source IDs. Changed wording or provenance creates a separate immutable import. Concurrent identical imports deduplicate through the database checksum constraint. Provider fetch times alone do not produce duplicate unreviewed versions.
- The optional server-only Sunnah.com adapter uses the official API, fixed HTTPS origin, `X-API-Key`, request timeout and redirect rejection. Provider importing runs through `scripts/import-hadith.ts`, outside web requests. Imported provider reports remain unreviewed until explicit full-context review.
- The episode source drawer permits explicit insertion/replacement of a complete reviewed hadith report. The quotation retains source kind, canonical report ID, import, edition, reference and exact text. Qur’an identity validation remains separate. The canonical resolver supplies provenance for saved context and exported descriptions; no raw provider payload is returned by the browsing API.

## Verification performed

- Targeted ESLint passed for the new domain, provider, source server, import command, API, browser and tests.
- Four deterministic unit tests passed: required review/provenance and unknown grades; bounded query validation; complete provider-body/numbering preservation; missing-key, authentication and mismatched-reference failures.
- The disposable database integration passed with migration 0011. It verified concurrent import deduplication, preserved prior snapshots, canonical text/reference/edition/import/ID tamper rejection, unreviewed provider-report insertion rejection, explicit record review, unknown metadata, literal keyword escaping, public API payload filtering and malformed identities.
- A manual script accepted a reviewed synthetic hadith quotation through revision-checked autosave and an immutable checkpoint; working and saved source context retained the hadith kind, full report and attribution. Test reports are explicitly synthetic and are not religious-source evidence. The temporary database was removed.
- Browser acceptance remains pending for the parent session. The ignored input fixture is `.data/evidence/2026-10-08/hadith-reviewed-fixture.json`; it must be used only in disposable acceptance state and removed from that state afterward.
- Full application build and render/browser acceptance are recorded by the parent session separately. No new inference or speech was dispatched for this source slice.

## Current external limitations

- `SUNNAH_API_KEY` is absent in the configured environment. Live API fetching and an actual reviewed hadith corpus have not been verified or imported. [Sunnah.com’s developer documentation](https://sunnah.com/developers) requires an API key and says the API exposes only a portion of its checked data. The adapter follows the [official API specification](https://github.com/sunnah-com/api/blob/master/spec.v1.yml); complete collection coverage is never inferred.
- The authenticated, read-only Qur’an catalog check still returned pre-live chapters 1 and 2 only. [Quran Foundation’s current quickstart](https://api-docs.quran.com/docs/quickstart/) expressly limits pre-live to those chapters and requires approved production access for the full dataset. No production access was requested or assumed.
- Existing Abdel Haleem translation reuse remains not cleared. API access and attribution do not establish narration/video reproduction permission. Hadith provider imports likewise begin with reuse not cleared and unknown translation authorship unless supplied explicitly. No permission request or third-party message was sent.
- Feature acceptance requiring a real verified hadith in a creator-reviewed script/export remains pending real source data and review. Synthetic tests do not satisfy that requirement.

Parent-session production browser acceptance is now recorded in [editor completion](2026-10-08-editor-completion.md), including explicit fixture/live limits. Earlier pending-browser notes describe the subagent handoff, not the final session state.
