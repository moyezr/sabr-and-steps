# Targeted reflection rewrites — 2026-10-08

## Implemented boundary

Sentence, paragraph, and whole-reflection selections snapshot the original block, exact text range, selected immutable script, working-draft revision, saved episode revision, instructions, and requested model. Durable `script_rewrite` jobs retain three distinct alternatives per request. Requests accept only `openai/gpt-5.6-luna` and `google/gemini-3.8-flash`; generation never replaces the selected script or working draft.

The script editor compares each retained set with its original selection. Rejection retains the set for reference. Explicit application enters the existing local edit history and autosave path. Range rebasing preserves later edits outside the selected words; overlapping target edits, changed canonical blocks, and oversized accepted reflections are refused. Switching saved versions keeps older comparisons visible and disables their application to another base.

## Deterministic checks

- `pnpm exec tsx --conditions=react-server --test tests/unit/script-rewrites.test.ts`: three tests pass. Coverage includes exact selections, permitted models, supported/unsupported shape, distinct alternatives, provider model mismatch/incomplete JSON, canonical-block preservation, later prefix/suffix/unrelated edits, whitespace boundaries, length limits, and undo.
- `pnpm exec tsx --conditions=react-server --test tests/integration/rewrites.test.ts`: disposable database suite passes against shared migration 0011, including repeated migration. Coverage includes request identity/idempotence, both permitted model histories, immutable snapshots, later edits during generation, unchanged saved episode and selected script, canonical target exclusion, explicit apply through autosave, persistent rejection, stopped/uncertain retry boundaries, lost worker ownership, and actual POST/origin checks.
- `pnpm exec tsx --conditions=react-server scripts/verify-rewrites-workflow.ts`: deterministic seed/assert/cleanup passes, with two retained sets and zero provider usage. `--serve` exposes port 3110 and injected `complete`, `fail`, `uncertain`, `report`, and `stop` commands for browser acceptance. Every source passage in this fixture is synthetic.
- Targeted ESLint passes. Repository `pnpm typecheck` passes after integration with the other roadmap changes.

Browser acceptance is pending the combined studio verification. These checks do not claim creator editorial approval or pronunciation/aesthetic acceptance.

## Bounded live verification

The creator authorized the remaining roadmap work. The session used bounded live verification for the remaining model check. `pnpm exec tsx --conditions=react-server scripts/verify-live-writing.ts --run` checked the configured OpenRouter account and fresh model catalog before dispatch. Both permitted model IDs were available with known pricing, and sufficient credits were confirmed.

Using `openai/gpt-5.6-luna`, the real durable worker, account/price checks, reservation accounting, strict response parsing, and lease-checked persistence completed one F012 idea-direction set and one targeted reflection-rewrite set. Both jobs succeeded, each retained one set, and both usage reservations settled. Each request had an additional $0.015 estimated spending limit; the total verification estimated cap was $0.03.

| Stage | Estimated USD | Provider-reported actual USD | Result |
| --- | ---: | ---: | --- |
| Idea directions | 0.0022716 | 0.0004152 | One retained three-direction set |
| Reflection rewrite | 0.0039678 | 0.0002660 | One retained three-alternative set |
| Total | 0.0062394 | 0.0006812 | Two succeeded jobs |

Sanitized account/catalog availability, job/result counts, and usage evidence are stored in ignored `.data/evidence/2026-10-08/live-writing.json`. The disposable live-verification database was removed. No model substitution, speech, rendering, publication, or third-party messaging occurred. Gemini availability was checked; this run makes no live Gemini inference claim. Live results were schema-validated development evidence, not creator approval of their religious interpretation.

Parent-session production browser acceptance is now recorded in [editor completion](2026-10-08-editor-completion.md), including explicit fixture/live limits. Earlier pending-browser notes describe the subagent handoff, not the final session state.
