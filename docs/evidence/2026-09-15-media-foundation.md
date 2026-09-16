# Narration and render foundation — 2026-09-15

This is **fixture and read-only provider evidence**, not a completed narrated pilot.

## Verified

- `pnpm check`: 16 unit tests, zero-warning lint, TypeScript and harness checks passed. `pnpm test:db`: three disposable database suites passed. Migrations 0002/0003 also applied to the preserved local application database.
- Caption fixtures preserve the spoken text, reject missing/mismatched/nonmonotonic alignment, reject overlap/out-of-bounds timing, and generate SRT timecodes. Database checks preserve words during manual timing edits; old caption parents conflict, and new scripts/takes/timing revisions invalidate prior compositions.
- ElevenLabs mocked account fixtures block exhausted included credits, free-plan publication and concurrent outstanding reservations before TTS dispatch. No fixture was counted as a live-provider call. Durable queue tests cover one claim, deduplication, expired lease recovery and uncertain dispatch.
- Authenticated read-only ElevenLabs subscription and voice discovery worked both through the API and the production Studio. The account reported 10,000 unused free-plan characters. The pilot's Cartesia pin remained intact; generation stayed disabled until an explicit override. No actual TTS was dispatched.
- `pnpm exec tsx scripts/render-fixture.ts` produced five-second H.264/AAC fixtures at 1920×1080 and 1080×1920. ffprobe confirmed both dimensions, duration and audio streams. A repeated frame was byte-identical. Both PNGs were visually inspected for text wrapping, margins, attribution and draft marking. The audio is a synthetic low-volume tone, not narration.
- The standalone renderer passed before the queued worker did. A full workflow fixture exposed a React server-mode incompatibility. Rendering now runs in an awaited child process with normal React; each attempt has its own lease-owner directory. The durable parent verifies ownership and output metadata before registering exports.
- `pnpm exec tsx --conditions=react-server scripts/verify-media-workflow.ts` then passed: job `5d26c1cb-5261-4033-8f0e-2c682e14c368`, export `83dae55e-7251-4cd4-ae22-9ed9712b33dc`, synthetic composition `454eb14d-7c99-4dff-8ee0-ca75bcc1c1ee`. Its disposable database was removed after verification; local fixture outputs remain ignored.
- An isolated production browser fixture exercised both Player formats, playback, editable caption timing and invalidation of the old preview after saving. Download endpoints returned both MP4s, SRT and description with correct MIME/disposition. MP4 range request returned HTTP 206 and the requested 64 bytes. Earlier workflow fixture export ID was `4cea7568-e9a3-4105-b36e-6281f69dca67` in a separate disposable database, also cleaned up.
- Production Studio inspected at desktop and 390×844: controls wrap, live balance/voices load, and empty narration state renders correctly. An initial null-selection crash was fixed in both Studio and the script editor. Final production build passed without the earlier broad file-tracing warning; trace inspection found zero `.env`, `.data`, or artifact paths.

## Reproduce

Run the render fixture first, then `pnpm exec tsx --conditions=react-server scripts/verify-media-workflow.ts`. Add `--serve` to the second command after a production build to open its isolated browser fixture on port 3109; stop with Ctrl-C to drop only that fixture database. Neither command invokes a model or speech provider. FFmpeg/ffprobe and Remotion's supported render browser are required.

## Remaining

The actual pilot has zero voice takes and zero exports. Its latest script `136187f0-9a58-4941-b71a-828f1498a557` remains unreviewed. Await the explicit speech choice, generate narration with fresh quota checks, then evaluate pronunciation/alignment, render both full outputs and perform creator review. No real narration listening, publication clearance, background ambience, or full pilot acceptance is claimed. Cartesia/Deepgram live dispatch is not implemented. F004 remains active; F005/F006 acceptance is still pending.
