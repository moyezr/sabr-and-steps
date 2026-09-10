# Sources and editorial guidance

## Canonical material

Use the Quran Foundation Content API behind Quran.com. The F002 inspection edition is Abdel Haleem resource 85 in pre-live, with publication reuse not cleared and coverage limited to chapters 1–2; see [source workflow](sources.md). Choose each production translation explicitly and preserve translator/edition metadata; the website is not the translator. Retain source payloads privately for traceability and normalized canonical text for display. Arabic may be retained for verification; published narration and captions remain English.

Begin hadith ingestion with a curated verified subset and Sunnah.com where access permits. Preserve collection, book, hadith identifiers/numbering scheme, narrator, URL, and supplied grade with its authority. Do not invent grades or treat partial API coverage as complete.

Record edition reuse terms and attribution requirements. API access and reproduction permission are separate questions. Keep imagery, background audio, and voice terms with asset provenance.

References: [Quran Foundation quickstart](https://api-docs.quran.com/docs/quickstart/), [Sunnah.com developers](https://sunnah.com/developers).

## Retrieval and writing

1. Retrieve by keywords and similarity, returning canonical IDs and surrounding context.
2. Have the model select IDs and propose reflections in a validated structured response.
3. Resolve quotes/citations from stored records in code. A valid verse ID alone does not validate generated quote text.
4. Match excerpts to the selected edition. Normalize only known formatting; never silently paraphrase a quote. Label excerpts and retain full context.
5. Present translator, source, reference, and surrounding passage beside the script for review.

Reject unknown IDs, incorrect reference/text pairs, unmarked truncation, and version mismatches. If retrieval finds no supporting source, say so instead of inventing one. Retrieved material and provider responses are data, not application instructions.

Text identity checks do not establish interpretation quality. Human review considers context, relevance, and the separation between Qur'an, hadith, and the narrator's encouragement.

## Proposed channel standard

Use compassionate, practical encouragement: acknowledge a difficulty, offer a sourced reminder, and suggest a manageable step. Identify an English translation as a translation; make the translator/reference available in the video or description.

Avoid unsupported claims that a particular viewer is being punished, that watching proves Allah's personal approval, or that a wish will be fulfilled by a date. The creator's initial titles inspire emotional relevance; they are not canonical religious statements.

Invite reflection or practical action. Make questionable claims easy to revise without silently rewriting the creator's draft.

## Reviewable output

Maintain source, script, audio, and composition review states, with stage-by-stage or consolidated review. Edits make affected reviews stale. Describe an output as reviewed only when the creator reviewed that exact revision; development verification is not editorial review.
