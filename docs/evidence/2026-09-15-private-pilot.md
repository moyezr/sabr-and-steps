# First narrated private pilot — 2026-09-15

The creator explicitly authorized ElevenLabs. One real private draft of **When waiting feels heavy** was generated with Brian, `eleven_multilingual_v2`, pace 1.0, stability 0.65 and similarity boost 0.75. No paid fallback, second speech provider, public upload or creator approval occurred.

- Episode: `f012f0d8-7236-4b39-a23b-e0a6c55bc37d`, revision 4.
- Script: `136187f0-9a58-4941-b71a-828f1498a557`; canonical quotation is Qur’an 2:153, M.A.S. Abdel Haleem.
- Narration job: `9fa59a94-32ac-41f7-bb6c-80617a4d87c0`; take: `b51d0011-2efc-44ec-9ee7-5a2f0b6c001b`; duration 95.108934 seconds.
- Caption track: `eef78aa6-b5b1-43d3-9ed9-b2cf12c6de8d`; 51 phrases. Native character alignment exactly matches the spoken script; all caption words match and remain within audio bounds. Stored quotation text, reference, edition and import ID match the canonical passage.
- Composition: `ff08e322-4d4c-4846-baa5-bd3fdbc92e84`; forest gradient, no background audio, narration volume 1.0, private-draft marking and ElevenLabs attribution.
- Render job: `32855b1c-1857-4897-8ec3-11179ffdffe5`, succeeded in 211.703 seconds from enqueue to completion.
- Export: `975f1d55-f51a-4b20-9d7f-9860593a04a9`.

Both H.264/AAC MP4s measure 95.765333 seconds: landscape 1920×1080, vertical 1080×1920. Both decoded completely through FFmpeg without errors. The narration's measured peak is −3 dB; no clipping was detected. Representative actual frames were inspected at the opening, quotation, practical-step section and near the ending. The live Player also played the actual narration preview. Both exported MP4 URLs were then opened in the browser: landscape reported readyState 4, no media error and advancing playback; the vertical export visibly played through the quotation section. This technical inspection does not replace listening and creator approval of pronunciation/editorial quality.

Outputs are under `.data/exports/ff08e322-4d4c-4846-baa5-bd3fdbc92e84/32855b1c-1857-4897-8ec3-11179ffdffe5/`: `landscape.mp4` (6,827,672 bytes), `vertical.mp4` (6,797,104 bytes), `captions.srt` (3,231 bytes), and `description.txt` (2,094 bytes). Every download endpoint returned HTTP 200 and bytes matching its local file checksum. Description includes the canonical reference link. Full local verification is recorded in `.data/pilot-qa/verification.json`, with sampled PNGs beside it.

ElevenLabs usage settled at **1,501 characters**, from a 1,577-character reservation against 10,000 reported included characters. The subscription endpoint initially lagged at zero usage and later advanced its previously expired reset date. Credit checking now uses local settled usage and each dispatch's account snapshot to avoid spending the same reported credit twice during this lag. A stale reset date cannot erase a newer local charge. After restart, the Studio reports 8,499 conservatively available characters while the provider still reports 10,000. Prior OpenRouter index/evaluation/script usage was $0.00214733.

Final code verification: `pnpm check` (19 unit tests), `pnpm test:db` (three suites for the provider change before the final pure-function reset guard), and `pnpm build` passed. Added credit tests cover reporting lag, reconciliation, external consumption, outstanding reservations and stale reset dates. No credentials/generated media are tracked; no commits were made.

The requested ability to generate a real video is demonstrated by both complete narrated outputs. Full feature/pilot acceptance remains open: creator listening/editorial review, final review UI, source publication reuse, commercial narration rights and optional ambience are not claimed complete. These files are private review copies, not publication-cleared assets.
