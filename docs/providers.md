# Provider and credit policy

Updated 2026-09-14 after the creator added direct speech credentials.

## Selected routing

- LLM calls use OpenRouter with only `openai/gpt-5.6-luna` (default) or `google/gemini-3.8-flash`. These exact IDs were found in OpenRouter's public model catalog. No automatic model-family substitution.
- Narration uses direct Cartesia, ElevenLabs, or Deepgram, selected from eligible credit balances and the chosen voice. Default audition preference: Cartesia, ElevenLabs, then Deepgram; a creator-pinned provider stays pinned.
- Transcription prefers Deepgram's available credits. Prefer native TTS timestamps when sufficiently accurate to avoid a second transcription charge.
- Embeddings use OpenRouter `openai/text-embedding-3-small` at 1536 dimensions with versioned preprocessing. Cache them by source checksum and embedding configuration.
- No local inference and no direct OpenAI API key. OpenRouter LLM calls use the OpenRouter account balance.

## Current implementation versus planned integrations

Implemented: model/provider preferences persist with an episode; the Providers screen shows server-side key presence; the pure selection policy and its tests enforce eligible credits, usage rights, pinned providers, and explicit paid opt-in.

OpenRouter retrieval/drafts now verify current account credits and model prices, reserve local usage, and persist responses and actual cost. ElevenLabs voice discovery, authenticated subscription reads, atomic character reservations and timestamped TTS are implemented. One real ElevenLabs private pilot take is verified (1,501 characters). Account reporting lag and stale reset snapshots are covered by the local settled-usage guard; current Studio availability includes local reservations and charges. Cartesia/Deepgram quota and dispatch integrations remain pending. The Providers overview labels unchecked balances; the Studio checks ElevenLabs on request. No inference is triggered merely by opening or saving an episode.

## Before any future generation

1. Check account access and a recent provider balance. A configured key is not verified access; an unknown balance is not zero or free credit.
2. Estimate the request in the provider's billing unit. Keep dollars, characters, seconds, and provider credits distinct; compare normalized cost only when the conversion is known.
3. Check the intended use and the actual account/output terms. Publishing requires confirmed applicable rights. Auditions may use eligible noncommercial credits.
4. Reserve estimated usage atomically in the local ledger before dispatch. Account for concurrent jobs, periodic balance reconciliation, credits consumed outside this app, provider expiry/reset dates, and a conservative safety margin.
5. Reuse completed output by text/voice/model/settings hash. Pin a voice/provider for each complete take; never switch mid-episode to spend another provider's remaining quota.
6. If credit/rights are insufficient or unknown, show the reason and alternatives. Never silently fall back to paid use, OpenRouter speech, a different voice, or another LLM.
7. Reconcile actual usage/cost and store model, provider request ID, voice, and license snapshot with each asset. Ambiguous timeouts need reconciliation before retry; exactly-once external billing cannot be promised.

The pure policy in `lib/domain/providers.ts` is only the decision step. The future worker must supply verified offers and enforce the reservation/dispatch lifecycle.

## Public plan facts checked at setup

| Provider | Public offer | Practical implication |
| --- | --- | --- |
| ElevenLabs | Free: 10,000 credits/month. Commercial rights are included on paid plans; free output is noncommercial with attribution. | Use free credits for auditions. Do not assume an eventual upgrade licenses previous output. |
| Cartesia | Free: 20,000 credits/month. Pro adds a commercial-use license. | Check the actual plan before selecting a take for publication. |
| Deepgram | Advertises $200 introductory credit, followed by pay-as-you-go. | Check this account's remaining grant, expiration, and applicable usage terms; never assume a recurring $200 balance. |

These are public offers, not verified balances for the creator. Plan terms and pricing change; refresh them during provider implementation and store provenance. Temporary promotions must have explicit end dates; they are unsuitable as permanent zero-cost defaults.

Sources: [ElevenLabs billing](https://elevenlabs.io/docs/overview/administration/billing), [ElevenLabs pricing](https://elevenlabs.io/pricing), [Cartesia pricing](https://www.cartesia.ai/pricing), [Deepgram pricing](https://deepgram.com/pricing), [OpenRouter catalog](https://openrouter.ai/api/v1/models), [Luna model](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Gemini Flash on OpenRouter](https://openrouter.ai/google/gemini-3.8-flash).
