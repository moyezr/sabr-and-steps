# F020 private draft automation — 2026-10-14

## Scope and implementation

Explicit one-shot topic requests use immutable source/model/editorial/media/reading profiles and create an isolated episode, production run and durable `production_draft` job in one transaction. Migration 0012 adds only profiles and production runs with foreign keys and uniqueness constraints. No dependency or lockfile changes were needed.

The worker reuses generated scripts, saves the composition and run pointer atomically, then renders both private formats. First script selection is now atomic with script persistence, closing a crash gap. Script, composition, export and run persistence verify a live owner. Automation export registration also checks that the run owns the exact composition. Manual drafts/selections and changed episode revisions stop composition without discarding work. Renders retain their captured composition even if later selections change.

Cumulative OpenRouter reservations are checked under the existing account lock before dispatch, accounting for embeddings, held/settled estimates and higher reported costs. The maximum run reservation budget is $0.10. These are reservation limits, not a guarantee of external billing. Ambiguous provider outcomes retain needs-attention state without a blind retry.

## Automated verification

- `pnpm check`: harness, zero-warning lint, TypeScript and 69 unit tests pass.
- `pnpm test:db`: all 11 disposable database checks pass. Fresh/repeat migrations and the older 0010-to-current upgrade preserve historical content validity and immutable scripts.
- The automation DB suite verifies concurrent duplicate requests create one episode/job/run; changed input under an existing identity is rejected; resumed render work reuses one script/composition; expired ownership cannot persist a new script; manual editing during generation remains intact; uncertain dispatch cannot retry; an existing settled reservation blocks a new over-budget request before dispatch; changed asset bytes/metadata cannot replace captured media; origin/validation/read-only HTTP boundaries are enforced.
- `pnpm build` passes with the new page/API, and `git diff --check` passes.

Broad testing exposed an existing migration-fixture teardown race: forced database removal could terminate an idle socket after pg-pool end resolved. The fixture now handles only SQLSTATE 57P01 during disposal; other errors and all migration assertions still fail. Full DB checks passed after the fix.

## Actual render and browser verification

`scripts/verify-automation-workflow.ts --serve` used a uniquely named disposable database, a synthetic source explicitly labeled “not scripture”, synthetic embeddings and an injected Luna-shaped draft. The real production server, job leasing, canonical resolver, composition saver, Remotion renderer and export registration ran without inference.

Three complete runs produced six actual H.264 MP4s, at 1920×1080 and 1080×1920, approximately 8.6 seconds each. FFprobe dimensions/duration/no-audio checks and full FFmpeg decoding passed. Sampled frames in both orientations show centered reading text, source attribution and the private-draft watermark. Source descriptions and SRTs retain the synthetic canonical reference/text. A landscape download through the browser is byte-identical to the worker’s 384,629-byte output.

Browser checks passed profile save, exact default values, explicit start, progress updates, next-topic input retention during polling, failed-run retry into the same episode, completed export links, unreviewed checklists and independent reuse blockers. Desktop and 390×844 checks have no horizontal overflow. Acceptance caught and fixed HeroUI numeric defaults placed on Input rather than TextField, the standalone-render-only registration guard, and stale retry progress labels.

The final real local app loads `/automation` with the partial source coverage/reuse status and existing media library. The Calm private drafts profile saves/reloads; a whitespace-only topic returns 422, keeps fields editable and creates no job/episode. Existing episode revision/content/media selections match the pre-migration snapshot exactly. Real production runs and queued/running/uncertain jobs remain zero. Migration 0012 is installed, the app is available on 3107, worker is stopped, and all automation fixture databases/servers are removed.

Ignored evidence: `.data/evidence/automation/bdae8507-4f77-4739-b0ba-514c424cf640/` contains exports, metadata, reports and both sampled frames. `.data/evidence/2026-10-14/automation-desktop.png` shows the final real workspace. Check logs and the installation comparison snapshot remain under `.data/`.

## Boundaries

No new live LLM/speech inference, real religious-source import, creator approval, source/media reuse clearance, publication render, platform upload, recurring job or provider fallback occurred. Narrated automation and source/publication prerequisites remain future work. Existing pilot content/media is unchanged.
