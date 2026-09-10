# Environment and local setup

Keep credentials in the ignored `.env`. The tracked `.env.example` lists configuration names. Never print values, expose them with `NEXT_PUBLIC_`, or overwrite the creator's keys during setup.

## Local database

Docker must be running. From the project root:

```sh
pnpm db:configure
pnpm db:up
pnpm db:migrate
pnpm dev --hostname 127.0.0.1
```

`db:configure` preserves existing values and appends missing `SABR_DB_PASSWORD` and `DATABASE_URL` using a random password. The default database is available only on `127.0.0.1:55432`. Compose uses `pgvector/pgvector:0.8.2-pg17` and the persistent project volume `sabr-and-steps_postgres_data`.

`pnpm db:stop` stops only this project's database and preserves its data. Never use `docker compose down -v` as a routine reset. If configuring an existing database, set `DATABASE_URL` yourself and skip the Compose commands; its PostgreSQL installation must provide pgvector. The integration test creates and drops a uniquely named disposable database, so its connection role needs that privilege.

## Credentials

| Variable | Purpose | Current state |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | The two selected LLMs through OpenRouter | Added by creator; key presence checked |
| `ELEVEN_LABS_API_KEY` | Direct ElevenLabs speech | Added; preserve this exact spelling |
| `DEEPGRAM_API_KEY` | Direct transcription/narration | Added |
| `CARTESIA_API_KEY` | Direct narration | Added |
| `QF_CLIENT_ID`, `QF_CLIENT_SECRET` | Quran Foundation backend/server app | Added |
| `SUNNAH_API_KEY` | Hadith importer | Request filed; response pending |

The Providers screen reports key presence, not current authentication, balance, or commercial entitlement. Quran Foundation authentication and import results are separately verified and recorded in Sources; OpenRouter retrieval/draft generation is verified. The Studio performs authenticated ElevenLabs quota/voice reads; live narration is still awaiting the provider choice. [Provider policy](providers.md) explains how actual credits and usage rights will gate requests. No separate OpenAI credential is needed.

Source accounts: [OpenRouter keys](https://openrouter.ai/settings/keys), [Quran Foundation console](https://dev-console.quran.foundation/), [Sunnah.com developer process](https://sunnah.com/developers).

## Model and output settings

Episode records store script model, narration preference, intended use, target duration, and output format. Script model options are `openai/gpt-5.6-luna` and `google/gemini-3.8-flash`, with Luna the initial default. Voice IDs will be chosen during audition. Speech does not have an automatic paid/OpenRouter fallback.

Embedding configuration is fixed and versioned in `lib/domain/script.ts`: `openai/text-embedding-3-small`, 1536 dimensions, translation-text-v1. A different model requires a reviewed configuration and a new index. `APP_DATA_DIR` defaults to `./.data`; source payloads, provider responses, audio, render attempts and exports stay in this ignored local directory.

Start `pnpm worker` in a second terminal for queued jobs. The worker and app must use the same database and data directory. Install FFmpeg/ffprobe for audio probing and export validation. Remotion downloads its supported Chrome Headless Shell on the first render; this is a rendering browser, not a local inference model.

## Quran Foundation environment

New backend apps start in pre-live. The adapter defaults `QF_ENV` to `prelive` and explicitly maps the fixed OAuth/API endpoints. Move credentials and endpoints together after production permission is granted.

| `QF_ENV` | API origin | OAuth origin |
| --- | --- | --- |
| `prelive` | `https://apis-prelive.quran.foundation` | `https://prelive-oauth2.quran.foundation` |
| `production` | `https://apis.quran.foundation` | `https://oauth2.quran.foundation` |

`QURAN_TRANSLATION_ID=85` is the documented pre-live inspection edition. Publication reuse remains `not_cleared`; see [source workflow](sources.md). The live pre-live catalog only exposes chapters 1–2. Cache short-lived content tokens on the server. Client-credentials authentication needs no refresh token in `.env`. See [Quran Foundation quickstart](https://api-docs.quran.com/docs/quickstart/).

Next.js loads `.env` for the web app. Standalone setup, Drizzle, and integration test commands use `@next/env`. Validate only the settings required by an invoked feature and show missing names rather than values.
