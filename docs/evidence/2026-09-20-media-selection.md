# Explicit media selection acceptance

Date: 2026-09-20  
Feature: F010

## Result

F010 passes. An episode now persists its selected voice take, caption timing revision, and composition independently of creation order. Creating an alternative does not replace an existing choice. Caption timing and preview save actions create immutable revisions and select the revision they just created.

## Automated evidence

- Migration `0008_messy_the_santerians.sql` applied to the real local database and twice in disposable integration databases. It preserved scripts, takes, captions, compositions, and exports while deterministically backfilling compatible selections by `(created_at, id)`.
- Database suites covered same-episode and dependency rejection, optimistic conflicts, first completed take selection only when no selection exists, later alternatives retaining the current selection, explicit timing/preview save selection, stale incompatible dependencies, and text-only null voice/caption selections.
- Workspace state, preview loading, render validation, and export currentness resolve the selected composition and its dependencies. Generation alternatives receive fresh request identities while retries keep their job identity.
- `pnpm check` passed harness checks, lint, TypeScript, and 29 unit tests. `pnpm test:db` passed all four suites. `pnpm build` and `git diff --check` passed.

## Browser evidence

The production build at `http://127.0.0.1:3107` reopened “When waiting feels heavy” directly in the episode editor.

1. The Voice & captions section showed the selected Brian ElevenLabs take and its selected 51-phrase timing revision in immutable history.
2. Preview history showed four saved revisions. Selecting Preview 1 changed the active player to the 95.7-second narrated forest composition and hydrated narrated settings.
3. Reload retained Preview 1. Selecting Preview 4 restored the 148.1-second text-only Misty lake composition; a second reload retained that restored selection.
4. At 390 × 844, the preview and history cards remained readable and controls stayed reachable. The document reported `innerWidth=390` and `scrollWidth=375`, so there was no horizontal overflow.

The pilot has one take and one timing revision, so switching among older take/timing records was proven with disposable deterministic database fixtures. The real pilot was left on its original Preview 4 selection. No LLM, speech, transcription, or rendering provider was called.

## Remaining milestone work

Milestone 2 still needs bounded client undo/redo and side-by-side script comparison. AI partial rewrites, timeline controls, richer media editing, and new export formats remain later milestones.
