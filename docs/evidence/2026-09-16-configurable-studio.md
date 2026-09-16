# Configurable studio — 2026-09-15–16

## Scope

Creator requested serene backgrounds, soothing configurable BGM, and text-only videos. They selected soft instrumental music, then clarified the goal: a reusable bring-your-own-media workflow, not a stocked asset library. Still images, GIFs and audio are implemented; video backgrounds are deferred.

## Implemented

- Local, bounded JPEG/PNG/WebP/GIF and MP3/WAV/M4A uploads. Server probes actual media, restricts protocols and rejects invalid kinds/durations/sizes. Source notes are optional and remain explicitly unreviewed when omitted. Downloads stream by opaque asset ID and support byte ranges.
- Narrated and text-only modes. Text reading cards preserve visible script words and quotation attribution without creating voice takes or calling speech APIs. Adjustable reading speed; overlong scripts fail visibly.
- Image framing/darkness; music selection/level/loop/fade; narration level; silence. Conservative mix headroom. GIF frames are driven by the shared timeline, not browser wall-clock animation.
- Every saved preview is immutable and used by both aspect ratios. Unsaved controls disable render. Earlier exports stay downloadable. Script/timing changes retain existing invalidation; text-only previews remain independent of narration takes.
- Reviewed migrations 0004–0006 add assets, nullable voice/timing links for text-only, repeated content checksums across independent revisions, and image dimensions. Existing v1 pilot remains readable and downloadable.

## Verification

- `pnpm check`: harness, zero-warning lint, TypeScript, 20 unit tests pass. A floating-point tolerance assertion was corrected after exposing rounding at the conservative gain threshold; the tested sum remains below full scale.
- `pnpm test:db`: three disposable DB suites pass, including migrations applied twice, no-voice composition creation, exact visible quotation text, changed reading-speed checksum, asset type checks, invalid upload rejection, script invalidation, and independence from later voice takes.
- `pnpm build`: passes. Final scan found zero private media/env files in Git-eligible files or Next output traces.
- `scripts/verify-media-workflow.ts --variants`: durable worker rendered both formats for narration, text/music and silence with a synthetic animated GIF. Every MP4 fully decoded; silent outputs have no audio stream; descriptions retain fixture provenance. Final test export IDs: text `ea3cf4b3-c048-451a-a20e-5b23bf936d39`, narrated `da4d1bb9-1209-4ac3-a9a2-6462b6b27ec6`, silent `49848f0d-4ace-41ff-af78-a5590dd72548`. Disposable database removed by the test. Private paths/probes recorded in `.data/render-fixture/variants.json`.
- `scripts/verify-gif-frames.ts`: both formats show animation; frames at 1 and 3 seconds of a two-second GIF loop are byte-identical, while a different GIF time changes the image. Actual still frames were inspected. An initial missing JSX branch was caught by lint and corrected before this final verification.
- Browser: GIF and MP3 file chooser uploads succeed, including empty optional source notes; selected assets appear in controls. Temporary upload records/files were removed by exact IDs after checking no compositions referenced them. Keyboard changes to dimming and volume visibly invalidate the preview, save as a new revision, and survive reload. Text-only mode hides narration/timing controls. Both preview layouts play. Responsive inspection has no horizontal overflow; viewport override reset. Original export remains in Previous exports.
- HTTP: foreign-origin upload receives 403; uploaded audio range request receives 206.

## Assets and limitations

One starter image and two optional original procedural instrumental sketches were created before the scope clarification; no more stock assets were sourced. Image generation used the built-in tool, copied to `.data/studio-presets/misty-lake.png` and the local asset library. Prompt: “Use case: photorealistic-natural. Asset type: background image for Sabr & Steps tranquil reflection videos. Create a clean, serene photorealistic misty lake at dawn, still water reflecting softly layered forested mountains, gentle warm sunrise filtered through pale mist, muted deep sage and warm cream tones. Wide landscape composition, quiet open center with very little detail so centered white captions stay readable, also suitable for a center-cropped vertical frame. Natural photographic texture, peaceful restrained lighting, no people, no buildings, no text, no logos, no watermark.” Optional `pnpm media:seed` uses signal synthesis, not local model inference or a paid provider.

No new LLM or speech calls were made. Generated starter assets are not a claim of creator aesthetic/listening approval. Publication clearance and exact-revision final editorial approval remain separate outstanding work; existing private-draft markers are preserved.

## Full text-only example

Browser saved composition `e1ef91d0-4c5e-4fea-a05e-fb31a5fbcc04` and queued job `beffceb2-b910-484e-9ed7-e2942bfc59ae`. Export `6e725466-b1af-4053-b944-0a58a58908de` succeeded with 1920×1080 and 1080×1920 outputs, both 148.16 seconds. Files live under `.data/exports/e1ef91d0-4c5e-4fea-a05e-fb31a5fbcc04/beffceb2-b910-484e-9ed7-e2942bfc59ae/`.

Both files fully decode. Actual quotation frames inspected in both layouts preserve Qur’an 2:153 and edition attribution. The selected music matches at 4, 36, 68 and 132 seconds (correlation >0.9999 after approximately 43 ms AAC alignment), verifying looping. Measured fade-in/out follows the configured three-second envelope; peak −17.24 dB. No narration asset is in the composition or renderer request. Description contains image/music provenance, source URL and explicit no-narration mode. Downloaded vertical bytes match the local SHA-256 `e142fc4fe8bf1226b3143c353a8bc515022a23a39680b9044c4adcc6681e7004`. QC files are `.data/studio-qa/verification.json` and `.data/studio-qa/audio-verification.json`. These technical checks do not imply creator listening/editorial approval.
