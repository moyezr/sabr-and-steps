# Architecture

Status: episode CRUD, source ingestion/browser, remote retrieval and editable AI drafts are verified. Durable jobs, ElevenLabs quota/rights checks, narration/timing, and shared Remotion preview/export are implemented and undergoing pilot verification. Cartesia/Deepgram speech dispatch and publication review remain pending. See PROGRESS for live versus fixture evidence.

## Boundaries

```text
Browser studio
  -> Next.js server: validated actions, reads, previews, downloads
       -> PostgreSQL: content, revisions, sources, embeddings, jobs, reviews
       -> Durable job queue in PostgreSQL
            -> Node worker
                 -> Quran Foundation / Sunnah.com source adapters
                 -> OpenRouter inference adapters
                 -> Direct Cartesia / ElevenLabs / Deepgram speech adapters
                 -> Local assets and Remotion renderer
```

Use one repository. Keep the root-level `app/`, `components/`, `config/`, and `styles/` layout. Modules are added as their first feature needs them; entries below include planned locations:

| Planned location | Responsibility |
| --- | --- |
| `lib/domain/` | Provider-independent types and validation schemas |
| `lib/server/db/` | Drizzle schema, pool, queries |
| `lib/server/providers/` | Source/AI adapters, response validation |
| `lib/server/writing/`, `lib/server/media/`, `lib/server/jobs/` | Retrieval, script revisions, media and durable jobs |
| `worker/` | Job claiming, execution, retries, recovery |
| `video/` | Remotion compositions and serializable input schemas |
| `drizzle/` | Reviewed SQL migrations |
| `tests/` | Meaningful unit, database, workflow, and render checks |

Browser code must not import server modules. Mark Next.js server-only entry points and validate browser/provider inputs. Shared domain/composition modules must not read secrets. Keep worker infrastructure independent of Next-only module loading.

## Data design

Implemented entities: Episode, EpisodeWorkspaceState, EpisodeScriptDraft, SourceImport, SourcePassage, EmbeddingIndex, PassageEmbedding, QueryEmbedding, ScriptRevision, Job, ProviderUsage, VoiceTake, CaptionTrack, Composition, and VideoExport. Review state currently exists on script/media records; full final-review workflow remains pending. See [source import details](sources.md).

- Editions carry publisher/translator, resource ID, URL, import date, rights notes, and version/checksum. Passages retain canonical references and text.
- Embeddings reference a source version and model, dimensions, and preprocessing revision. A model/configuration change creates a new index generation; never mix incompatible vector spaces.
- Citations reference passage IDs and selected excerpt ranges. Script revisions preserve source versions.
- The episode workspace persists explicit selected script, voice take, caption track, and composition IDs plus an optimistic selection revision. Mutable autosave content lives in one revision-checked working-draft row per episode; named checkpoints and restored versions are immutable script revisions. Media selections must belong to the episode and match their selected dependencies. Incompatible pointers remain visible as stale work instead of silently switching to a newer artifact.
- Assets carry relative storage paths, checksums, media metadata, origin, and license/provenance. Large files live on disk.
- Reviews/renders reference immutable composition revisions so edits cannot silently alter an approved export.

Use Drizzle for relational/vector queries, parameterized SQL for PostgreSQL-specific behavior, and migrations to enable pgvector. Combine full-text ranking with vector retrieval and return source context. Similarity is not an authenticity score.

## Worker and recovery

Begin with one worker, bounded concurrency, and a PostgreSQL job table. Claim atomically with a lease; persist attempts, timeout, progress, timestamps, input revision/hash, and sanitized errors. Recover expired leases after restart. Retry transient errors with a cap; require an explicit retry after exhaustion.

Cache completed outputs by content/configuration hash. Local jobs can be idempotent, but an ambiguous provider timeout may have incurred a charge. Preserve request IDs when available and do not claim exactly-once external billing.

Write files atomically before registering completed assets. Reject paths outside the asset root. User media and database volumes are not disposable caches; retention controls need lifecycle metadata.

## Remote model stages

OpenRouter serves the two allowed script LLMs and the versioned text-embedding-3-small configuration. Direct ElevenLabs timestamped speech is implemented; Cartesia and Deepgram dispatch remain pending; see [provider policy](providers.md). Validate model capabilities. Record sanitized job IDs, latency, model IDs, attempts, and reported/estimated cost locally; do not log credentials or whole provider payloads by default.

Request timestamped transcription of generated narration using a supported model. Match timing to the approved script and keep its exact quotation text. Flag mismatches and missing timing for review. Transcription is not guaranteed forced alignment. If quality is insufficient, evaluate a direct API or manual adjustment, not a local model.

## Rendering

Prepare all media before rendering. Remotion consumes the explicitly selected immutable composition and its selected dependencies, shares the same serializable input between preview/export, and never calls an LLM from a frame. New narration alternatives use a fresh request identity and do not change an existing selection; retries retain the same job identity. Derive narrated duration from measured audio; derive text-only duration from versioned reading cards. Use deterministic animation, ready fonts, and explicit random seeds where needed.

Two layout profiles adapt wrapping, source placement, and type size while keeping captions centered. Image/GIF choice, framing, dimming, music volume, loop, silence, fades, and background are composition settings. Uploaded media is checksummed and its source notes are copied into export descriptions. Text-only selections keep nullable voice/caption dependencies and do not become stale when an unrelated narration take is generated. Preview, render validation, and export currentness use persisted selections rather than creation order.

## Implemented infrastructure

Compose runs the project database on loopback port 55432 using `pgvector/pgvector:0.8.2-pg17` and a persistent named volume. Drizzle migrations create the episode table and pgvector extension. `pnpm test:db` exercises the real database using a disposable database. The foreground source worker runs through `pnpm sources:import`; `pnpm worker` processes durable drafting, narration, and rendering jobs. Remotion runs in an awaited child process with normal React; the parent worker uses React server conditions for server-only modules. Each render attempt writes to a lease-owner directory, then the worker verifies ownership, dimensions, audio, duration and checksums before registering exports.
