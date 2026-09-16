# Initialization evidence — 2026-09-14

Environment: macOS, Node.js 22.19.0, pnpm 11.21.0. Scope: H001, the existing Next.js/HeroUI starter and agent harness.

| Check | Observed result |
| --- | --- |
| `./init.sh` | Frozen install succeeded; harness, ESLint with zero warnings, and TypeScript checks passed |
| `pnpm build` | Next.js 16.2.6 production build succeeded; seven static pages generated |
| `pnpm start --hostname 127.0.0.1 --port 3107` | Started successfully; browser displayed the expected starter page |
| Browser theme check | Toggle changed the accessible button from “Switch to light mode” to “Switch to dark mode”; selection survived reload; toggle back succeeded |
| `pnpm dev --hostname 127.0.0.1 --port 3107` | Started successfully; HTTP GET `/` returned 200 with the expected starter title |
| Git ignore checks | `.env`, `.env.local`, `.env.production`, `.data/sample.mp4`, and `artifacts/example.log` ignored; `.env.example` and `pnpm-lock.yaml` not ignored |
| Script syntax | `node --check scripts/check-harness.mjs` and `bash -n init.sh` passed |
| Harness failure cases | Isolated temporary copies rejected a passing feature without evidence, two active features, duplicate IDs, and a broken document link |

The failure-case checks used temporary copies of the harness files; the actual feature tracker was not modified for those checks. Reproduce by copying the docs, required root files, and script into a temporary directory, applying each invalid case separately, and running `node scripts/check-harness.mjs`; each must exit nonzero with its diagnostic.

Both temporary servers were stopped after verification. The browser test tab was closed. There is no running service left from these checks.

Initial failures repaired: unresolved pnpm build decisions for the starter's existing native packages; incompatible legacy ESLint wrapping around Next.js 16 flat config; theme-switch effect triggering the current React lint rule; obsolete lint suppression in the starter error boundary.

No application data, migration, model API, Qur'an/hadith import, caption alignment, or video export was tested. Those features do not exist yet. No real credentials were added, no paid inference was requested, and no commit or remote was created.
