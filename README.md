# Sabr & Steps

A local creator studio for English Islamic encouragement videos: researched scripts, traceable Qur'an and hadith references, AI narration, centered captions, and landscape/vertical exports.

**Current state:** A working Next.js 16 + HeroUI v3 episode workspace backed by local PostgreSQL/pgvector and Drizzle. Create, edit, search, and reopen ideas, with duration, format, and provider preferences. The Sources library imports and inspects a versioned Qur’an translation with references, context, and reuse status. Source-grounded AI drafts are verified; the new Studio connects narration, caption timing, shared Remotion preview and draft exports. The first 96-second ElevenLabs private pilot is generated in both formats; creator review and publication clearance remain pending. See [PROGRESS.md](PROGRESS.md) for verified results.

## Run locally

Use Node.js 22 (22.19.0 or later), pnpm 11.21.0, and running Docker. The package manager is pinned in `package.json`; `.nvmrc` selects Node 22 for nvm users.

```sh
./init.sh
pnpm db:configure
pnpm db:up
pnpm db:migrate
pnpm dev --hostname 127.0.0.1
```

Open <http://127.0.0.1:3000>. Creating and saving ideas uses no AI credits. Without a running database, the workspace shows setup guidance and keeps failed form edits available for retry.

`db:configure` creates missing local database settings without overwriting existing credentials. Use `.env.example` as a reference and fill provider credentials privately using [the environment guide](docs/environment.md). The Providers screen checks key presence only; the Studio separately checks the current ElevenLabs subscription before any speech request. Quran Foundation pre-live access and the selected source import have been verified separately. No direct OpenAI API key is required.

## Commands

| Command | Purpose |
| --- | --- |
| `./init.sh` | Install locked dependencies and run current checks |
| `pnpm check` | Validate harness records, lint, typecheck, and run unit tests |
| `pnpm test:db` | Migrate and exercise a disposable PostgreSQL test database |
| `pnpm db:stop` | Stop the project database while preserving its volume |
| `pnpm db:generate` | Generate a migration after a schema change; review the SQL |
| `pnpm lint:fix` | Explicitly apply lint fixes |
| `pnpm sources:list` | List authenticated English Qur’an resources |
| `pnpm sources:import 85` | Import/resume the selected pre-live inspection edition |
| `pnpm sources:verify` | Compare five imported passages with fresh source responses |
| `pnpm worker` | Process durable draft, narration and render jobs |
| `pnpm writing evaluate` | Run the small live retrieval evaluation (uses eligible OpenRouter credit) |
| `pnpm exec tsx scripts/render-fixture.ts` | Render and probe both 5-second tone fixtures; no inference |
| `pnpm build` | Compile a production build |
| `pnpm start --hostname 127.0.0.1` | Serve the production build |

Database integration tests need the database running. Browser acceptance steps and observed results are documented in [verification](docs/verification.md). Retrieval, script, credit/timing, worker and render checks are documented there. Fixtures are explicitly separate from live-provider and creator-review evidence.

See [source inspection](docs/sources.md) for the 293-verse pre-live corpus, importer recovery, and unresolved production reuse rights.

## Project map

- [AGENTS.md](AGENTS.md): agent entry point and working rules.
- [DECISIONS.md](DECISIONS.md): selected stack and reasons.
- [PROGRESS.md](PROGRESS.md): current evidence, limitations, and next action.
- [feature_list.json](feature_list.json): ordered work and acceptance criteria.
- [Product](docs/product.md), [architecture](docs/architecture.md), [content](docs/content.md), [environment](docs/environment.md), [providers](docs/providers.md), and [verification](docs/verification.md): task-specific context.

Product routes live in `app/`; reusable studio UI in `components/`; validation and credit selection in `lib/domain/`; server-only database/configuration in `lib/server/`; reviewed migrations in `drizzle/`. Unlinked sample routes from the original starter remain. Its [license](LICENSE) is retained.

### Bring your own picture and sound

In an episode’s **Studio & exports**, upload JPEG/PNG/WebP/GIF backgrounds and MP3/WAV/M4A audio. Choose narration or **Text & background music · no voiceover**, then set image framing/darkness, reading speed, music volume, looping and fades. **Save preview revision**, inspect either format, adjust, and save again before rendering. Earlier exports stay available under **Previous exports**. Files are local; video backgrounds are deferred. Exports currently retain the private-draft publication status.

Uploads are limited to 30 MB. GIFs are limited to 30 seconds, 300 frames, and 100 million decoded frame pixels; use smaller GIFs for longer loops. Audio may be up to 20 minutes. Source/credit notes are included in the description. Optional original instrumental sketches can be initialized with `pnpm media:seed`.
