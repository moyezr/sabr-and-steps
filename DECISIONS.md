# Decisions

## D017 — Reconstructed initial Git import and future commits

**Creator request, 2026-09-16.** Publish the existing implementation to `moyezr/sabr-and-steps` using the `moyezr` GitHub account. The repository previously had no commits, and its Codex refs contained no recoverable development commit history. Import the current files in seven logical groups with requested author dates September 10–16, 2026. These dates are an editorial arrangement, not evidence that development happened on those days. Retain actual committer timestamps and identify the reconstruction in every import commit body.

The groups are setup, data, sources, writing/jobs, media, UI, and verification. They are interdependent parts of one existing implementation; intermediate import commits are not independently verified release snapshots. The complete imported tree passes the recorded checks. Earlier session evidence keeps its original dates. Future changes use focused commits with actual timestamps; no recurring push is authorized.

Date: 2026-09-14. These are selected directions; implementation status lives in `PROGRESS.md` and `feature_list.json`.

## D001 — Local infrastructure, remote inference

**Selected; provider routing refined by D009.** Run the creator UI, PostgreSQL with pgvector, job worker, and media storage locally. Route LLM inference through OpenRouter and speech through the creator's direct providers. No local models, including embeddings, speech recognition, and narration.

This keeps operational cost and deployment work low while following the user's provider preference. Local storage does not mean prompts and audio stay on the device: inference sends the necessary inputs to external services. Add hosting if collaboration or availability later requires it.

## D002 — Drizzle ORM

**Selected by technical judgment after the user reopened the choice.** Use Drizzle and reviewed SQL migrations for PostgreSQL. Keep database queries behind server-side data modules.

The workload combines relational records, vector queries, full-text ranking, and job claiming. Drizzle's typed SQL approach suits that mix and directly supports pgvector columns and indexes. Extension creation still needs an explicit migration. See [Drizzle's vector guide](https://orm.drizzle.team/docs/guides/vector-similarity-search).

Prisma is viable; this is a project-fit decision, not a general ranking. Stable Prisma 7 requires more custom vector handling, while Prisma 8's newer extension path is currently prerelease. On 2026-09-14 the npm registry reports stable `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, Prisma 7.10.0, and Prisma's `latest` tag pointing to 8.0.0-rc.14. Recheck stable versions when installing; do not install an RC merely because it is tagged `latest`.

Tradeoff: we own SQL design and query review. Use typed, parameterized SQL and database integration tests where query semantics matter.

## D003 — Next.js 16, HeroUI v3, pnpm

**Selected by the user.** Preserve the initialized App Router project, TypeScript, Tailwind CSS 4, and HeroUI v3. Installed at setup: Next.js 16.2.6, React 19.2.6, HeroUI 3.2.5. Use shared theme tokens for the studio. Video compositions use Remotion-specific components, independent of dashboard widgets.

HeroUI's [v3 documentation](https://heroui.com/en/docs/react/getting-started) is the reference. Avoid mixing v2 examples into v3.

## D004 — One OpenRouter key initially (superseded)

**Superseded by D009.** The original plan used adapters for drafting, embeddings, TTS, and transcription. OpenRouter documents all four capabilities. Prove voice quality and timestamp support with the selected models before fixing a production voice.

Add a direct speech provider only if the audition or timing controls justify it. Models are configurable; generated artifacts record the model used. Embedding model changes require a versioned reindex, not a silent fallback into the same index.

Sources: [embeddings](https://openrouter.ai/docs/api_reference/embeddings), [speech](https://openrouter.ai/docs/guides/overview/multimodal/tts), [timestamped transcription](https://openrouter.ai/docs/guides/overview/multimodal/stt).

## D005 — Canonical sources plus retrieval

**Selected.** Obtain Qur'an translations from Quran.com/Quran Foundation and pursue Sunnah.com for a curated hadith corpus. Store provenance and source versions independently of embeddings. Retrieve exact references and context; compose quotations from canonical records rather than trusting generated quote text.

The English translation and corpus reuse terms still need review. Hadith coverage depends on API data; a complete Sahih al-Bukhari import is not assumed. Exact-text checks validate identity, not theological interpretation.

## D006 — One timeline, two native renders

**Design default for the pilot.** Shared script, narration, timing, and background produce separate 1920×1080 and 1080×1920 outputs. Captions stay centered with format-aware type size and wrapping. This preserves the user's visual intent while allowing readable text in both formats. Literal center-cropping can be added if the pilot establishes a need.

## D007 — Durable worker and reviewable versions

**Selected.** Start with a separate Node worker and a PostgreSQL job table. Store media on disk and metadata in the database. Persist revisions, model settings, costs, jobs, and reviews. A script change invalidates dependent narration/timing/render approvals. A reviewed export is a versioned snapshot.

Defer Redis, a separate vector database, a broad agent framework, and automated uploading until measured requirements warrant them.

## D008 — Repository as the working record

**Selected.** `AGENTS.md` maps the project; this file explains choices; `PROGRESS.md` carries evidence and the next action; `feature_list.json` contains acceptance criteria. Focused documents hold product and subsystem context. `init.sh` and `pnpm check` make setup and checks repeatable.

This adapts the [course templates](https://walkinglabs.github.io/learn-harness-engineering/en/resources/templates/) without a second progress/handoff file. Add process files when they solve an observed coordination problem.

## D009 — Direct speech credits and a restricted LLM choice

**Selected by the creator, 2026-09-14.** Use direct ElevenLabs, Deepgram, and Cartesia credentials to make use of included credits. Preserve `ELEVEN_LABS_API_KEY`. Reserve OpenRouter for the selected LLMs and potentially embeddings; do not route speech through it automatically.

Script models are restricted to `openai/gpt-5.6-luna` and `google/gemini-3.8-flash`. Both IDs were verified in the public OpenRouter catalog. Luna is the initial default. Store the choice per episode; do not silently substitute a different family.

Credit availability, capability, and publication rights all determine eligibility. Keep auditions distinct from channel publishing, preserve one voice per take, cache reusable output, and require explicit opt-in before paid fallback. Unknown balances or rights are not authorization to spend. See [provider policy](docs/providers.md) for verified public plan facts and the remaining quota/ledger work.

## D010 — Isolated project PostgreSQL and version-checked edits

**Implemented in F001.** Docker Compose provides PostgreSQL 17 with pgvector 0.8.2, a project-specific persistent volume, and a loopback-only port 55432. `db:configure` appends missing local DB settings while preserving provider credentials. SQL migrations enable the extension and enforce episode duration/model constraints.

Episode updates compare an integer revision and return a conflict if another edit has won. This prevents silent overwrites across tabs. Local JSON mutations validate the browser Origin against Host (Next can normalize request URLs to localhost) and reject cross-site/non-loopback requests. No remote hosting or user accounts are introduced.

## D011 — Checkpointed source imports and an explicit pre-live corpus

**Implemented in F002, 2026-09-14.** Use a server-only raw HTTP Quran Foundation adapter with Zod response validation and a foreground source worker. PostgreSQL advisory locks and atomic chapter checkpoints provide resumable ingestion without introducing background web-request work. The general media job queue remains F004 work.

Completed imports are immutable source snapshots; unchanged refreshes reuse their passage IDs, while changed content or metadata creates a new version. Store stable checksums and private provider payloads, and show partial coverage independently of completion of the available catalog.

The authenticated pre-live catalog exposes Abdel Haleem resource 85 and chapters 1–2 (293 verses). It is selected for inspection with publication rights `not_cleared`; transliteration resource 57 is excluded. Production corpus access and edition reuse clearance remain separate prerequisites for production material. See [source workflow and rights record](docs/sources.md).

## D014 — Versioned remote retrieval and durable generation

**Implemented 2026-09-15.** OpenRouter `openai/text-embedding-3-small`, 1536 dimensions, is versioned by model/preprocessing/source checksums. Canonical quotation wording comes exclusively from immutable passage IDs. Structured script output can supply reflection text and source IDs, never rewritten quotations. Both allowed script models retain explicit selection with no fallback.

PostgreSQL leased jobs run in `pnpm worker`; web routes only enqueue long work. Provider usage is reserved atomically before dispatch. Completed responses are cached locally; an uncertain dispatch blocks automatic retry. A server crash cannot guarantee exactly-once external billing, so reconciliation is required in ambiguous cases.

## D015 — Private draft composition and explicit speech choice

**Selected during pilot implementation, 2026-09-15.** Consolidated review permits generating a private, visibly watermarked draft before creator approval. This never clears source reuse or speech publication rights. The current export path produces private drafts only; publication remains blocked pending exact-revision review and rights.

Remotion 4.0.524 uses the same component and immutable composition data for the Player and both MP4 formats. Script, take and caption checksums tie outputs to a revision. Caption edits create new timing revisions and invalidate earlier previews. The renderer receives only a temporary loopback URL for the checksummed narration asset; no credentials are passed to the composition.

ElevenLabs free-plan speech is eligible only for noncommercial auditions after a fresh authenticated balance check. The pilot's Cartesia pin still requires explicit override before using ElevenLabs. No response to the pending creator question is implied by this implementation.

Remotion requires normal React rather than the worker's `react-server` condition. The worker awaits `worker/render-child.ts` through a bounded child process. Attempt output is isolated by lease owner; the parent rechecks ownership and validates media before publishing local export records. The full queued fixture caught and now covers this boundary.

## D016 — Bring-your-own media and optional narration

**Creator request, 2026-09-15–16.** The studio should be a complete reusable workflow: creator images/GIFs and music, generated editable scripts, optional narration, saved previews, revisions, and downloadable exports. Building a large stock asset library is not the task. Video backgrounds are deferred.

Composition v2 adds immutable, checksummed image/audio snapshots, image framing/dimming, music level/loop/fades, and narrated versus text-only mode. v1 remains readable. Text-only reading cards derive exact visible script words and quotation attribution at an adjustable reading speed; they have no fake voice take or provider dispatch. Voice/caption foreign keys are nullable only for this mode. Every save creates a new revision, even when returning to earlier settings; content checksums may repeat. Earlier exports remain downloadable.

Uploads are bounded to 30 MB, inspected locally with FFprobe and restricted file protocols, served by asset IDs, and retained under the ignored data directory. GIFs use matching Remotion 4.0.524 frame-based decoding for deterministic preview/render loops, with duration/frame/pixel limits. Assets carry source notes; missing notes do not imply reuse clearance. The render child receives only the selected verified local assets. Music is mixed with conservative headroom and explicit fades. No additional inference is needed for text-only videos.

One generated lake image and two original procedural instrumental sketches were created before the creator clarified that supplied assets are optional. They remain local conveniences; uploads are the primary workflow. No new voice or LLM calls were made for this feature.


## D018 — Connected episode editor, delivered in bounded milestones

**Accepted by the creator, 2026-09-16; milestone 1 delivered 2026-09-18.** [PLAN.md](PLAN.md) refines D016 into a persistent episode editor. Navigation is free between Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports; prerequisites constrain actions rather than hiding whole sections. Existing episodes, media, immutable compositions, and downloads must remain usable.

Milestone 1 connects the existing routes with a shared episode header and real navigation. The entry URL opens the most developed available work: a composition opens Video, otherwise a script opens Script, otherwise Idea. A server-side read-only summary derives stage readiness from persisted revisions and jobs; labels must not imply that stale media or incomplete review is ready. Studio sections reuse existing controls and preview data. Unsaved-edit protection covers in-app links and browser reload/close, with media query switches and intra-episode Back/Forward navigation preserving local edits in the mounted layout. This is a navigation guard, not persisted autosave; recovery after reload or restart belongs to milestone 2 working drafts.

The current newest-artifact lookup remains an explicit limitation for this first milestone. Milestone 2 adds persisted version selection, working drafts, undo/history, autosave, and narrower dependency invalidation. Idea assistance and targeted script rewriting follow in milestone 3; timeline/media controls in milestone 4; format-specific export and consolidated review in milestone 5. Do not expose these planned capabilities as functioning controls before their persistence and acceptance checks exist.

No schema migration or new model calls were required to connect navigation. Durable generation, immutable composition data shared by preview/render, canonical quotations, speech credit/rights checks, and private export restrictions remain in force. F008 is passing; F005 retains its existing evidence and waits for creator feedback.
