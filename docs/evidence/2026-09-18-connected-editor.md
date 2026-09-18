# Connected episode editor — 2026-09-18

## Scope

This record covers F008 and `PLAN.md` milestone 1 only. The change connects existing episode, writing, media, preview, render, and download behavior through one workspace. It adds no database migration and made no model or speech request.

## Implemented behavior

- A persistent episode layout shows the episode title, save state, export count, and direct links for Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports.
- The episode entry route opens Video when a composition exists, Script when only a script exists, and Idea otherwise.
- A read-only server summary derives section states from saved revisions and jobs. It distinguishes ready, stale, queued/running, failed, uncertain, and empty states; text-only compositions do not require a voice take.
- Studio controls are grouped by addressed section while the saved preview stays visible. Existing uploads, caption timing, preview revisions, render actions, and current and earlier export downloads remain available.
- In-memory episode buffers retain unsaved Idea, Script, source-edition, narration setup, media, upload, and timing edits across section switches and intra-episode Back/Forward navigation. A custom dialog guards links outside the episode, and a `beforeunload` handler protects reload/close.

## Automated verification

- `pnpm check` passed the harness, ESLint with zero warnings, TypeScript, and 27 unit tests.
- `pnpm test:db` passed all three disposable PostgreSQL suites: migrations and revision conflicts, source import recovery/deduplication, and durable writing/job behavior.
- `pnpm build` completed the production build and generated every episode and workspace route.
- `git diff --check` passed.

Workspace unit coverage includes idea/script/video entry routing, text-only and narrated dependencies, queued/running/failed/uncertain job states, historical failures with usable output, stale script/take/composition/export labels, uploaded-media labels, and every section URL.

## Browser acceptance

The existing “When waiting feels heavy” pilot opened from both the library and its episode URL at Video. It retained the Misty lake background, Quiet dawn music, text-only reading cards, the 148.1-second preview, landscape and vertical selection, two export records, and current and historical MP4, SRT, and source-description links.

All seven section links reached their addressable route with exactly one `aria-current="page"`. Keyboard activation reached Exports. At a 390 × 844 viewport, the document measured 375 CSS pixels for both client and scroll width, with one current section and no horizontal overflow.

An unsaved music-volume change from 25% to 30% survived a switch to Idea and browser Back. Choosing Keep editing in the custom leave dialog preserved 30%; choosing Discard & leave completed navigation to the library. Changing the narration review workflow also triggered the guard. A reload attempt with dirty media was prevented by the installed unload protection while the local edit remained present; native prompt wording remains browser-controlled.

Disposable idea-only and script-only fixtures covered the remaining entry states. The idea-only episode opened at Idea, saved and reloaded a changed title, exposed every section with useful prerequisites, and kept preview actions unavailable until a script existed. The script-only episode opened at Script, saved and reloaded a manual revision, and then saved a text-only preview without narration. The disposable server and database were stopped after the checks.

Malformed and valid-but-missing episode page routes and workspace API routes each returned HTTP 404. Existing landscape and vertical MP4s, SRT captions, and the source description returned HTTP 200 with the expected media types and non-empty bodies.

## Limits and next milestone

The local buffers live only for the mounted episode layout; they are not persisted autosave and do not recover work after a confirmed reload, browser restart, or app restart. Script, take, caption, and composition choice still follows the existing newest-artifact rules. Undo/redo, named history, explicit version selection, AI alternatives and partial rewrites, scene editing, and expanded export controls remain later milestones. Navigation API traversal protection depends on browser support; intra-episode Back/Forward was verified in the in-app browser.
