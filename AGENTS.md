# Agent guide

Sabr & Steps is a local studio for English Islamic reassurance and self-help videos.
This file is the entry map. Read topic documents when relevant to the task.

## Start a session

1. Read [PROGRESS.md](PROGRESS.md), [feature_list.json](feature_list.json), and relevant [decisions](DECISIONS.md).
2. Inspect the working directory, `git status --short`, and recent history if present. Preserve existing user changes.
3. Select one bounded feature or the user's requested maintenance task. Keep at most one feature `in_progress`; a backlog is not permission to implement everything.
4. On first setup run `make setup && make test`. On a prepared checkout, use `pnpm check` before code changes.

## Commands

- First run: `make setup && make test`.
- Development: `make dev`.
- Baseline verification: `pnpm check`.
- Production compilation: `pnpm build`.
- Database: `pnpm db:configure`, `pnpm db:up`, `pnpm db:migrate`; integration checks: `pnpm test:db`.
- Automatic fixes only when intended: `pnpm lint:fix`.
- Detailed verification and evidence: [docs/verification.md](docs/verification.md).

## Project rules

- Follow the user's current instructions; update superseded repo decisions in the same change.
- Use pnpm and preserve `pnpm-lock.yaml`. Choose stable dependency versions, inspect installed APIs, and review migration SQL.
- Use Next.js App Router, TypeScript, and HeroUI **v3**. Do not copy HeroUI v2 APIs into this project.
- Use Drizzle with local PostgreSQL/pgvector; see `PROGRESS.md` for implementation status.
- Script LLMs are restricted to `openai/gpt-5.6-luna` and `google/gemini-3.8-flash`.
- Preserve `ELEVEN_LABS_API_KEY`. Speech credit/rights checks must precede generation; no silent paid or OpenRouter speech fallback.
- All model inference uses external APIs. Use OpenRouter for LLMs and direct Cartesia/ElevenLabs/Deepgram for speech. Do not introduce local LLMs, embedding models, TTS, or speech recognition models.
- Keep credentials and database/filesystem/provider access in server or worker modules. Never expose secrets through `NEXT_PUBLIC_`, client imports, logs, or fixtures.
- Long operations belong in the planned durable worker, not a web request or an untracked background promise.
- Preserve canonical source text and references. Generated reflections must be distinguishable from quotations; see [content rules](docs/content.md).
- Preview and render must consume the same versioned composition data. Final assets and provider outputs belong under the ignored local data directory.
- Do not delete personal media, database volumes, or existing work as a setup or reset shortcut.
- Do not publish/upload videos, contact third parties, or create recurring jobs without the user's authorization for that action.

## Context by task

| Task | Read |
| --- | --- |
| Accepted editor roadmap and milestone boundaries | [PLAN.md](PLAN.md) |
| Scope, UX, episode format | [docs/product.md](docs/product.md) |
| Data, provider adapters, worker, rendering | [docs/architecture.md](docs/architecture.md) |
| Sources, retrieval, scripts, titles | [docs/content.md](docs/content.md) |
| Keys, local setup, model settings | [docs/environment.md](docs/environment.md) |
| Credit routing and provider rights | [docs/providers.md](docs/providers.md) |
| Acceptance checks, failures, evidence | [docs/verification.md](docs/verification.md) |

## Finish a session

- Verify the changed behavior at the appropriate boundary. Feature completion needs its acceptance steps and recorded evidence, not just a successful compile.
- Keep failures visible. Never weaken acceptance criteria or mark mocks as live-provider evidence to make a feature pass.
- Update the selected feature and `PROGRESS.md` with results, unresolved issues, and a concrete next action. Record new architectural choices in `DECISIONS.md`.
- Review the diff, keep secrets/generated assets out of version control, and stop temporary processes started for checks.
- Commit verified work in focused commits with descriptive messages and actual timestamps. Push only when the creator authorizes it; use the `moyezr` GitHub account for this repository.
- Report scope, verification, and limitations. Record commit IDs only if commits were actually made.

This harness adapts the [Walking Labs course](https://walkinglabs.github.io/learn-harness-engineering/en/) with a short entry map, persistent state, and evidence-based handoffs. `PROGRESS.md` is the sole session handoff; do not create a duplicate agent-specific progress log.
