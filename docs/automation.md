# Private draft automation

F020 adds an explicit topic-to-export workflow at `/automation`. It currently produces **text-only private drafts** with reading cards in both formats. Narrated automation, publication renders, uploads and recurring schedules are subsequent features.

## Use it

1. Apply migrations with `pnpm db:migrate`, start the app and run `pnpm worker` in a separate terminal.
2. Open **Draft automation**. Save a profile with a completed Qur’an source edition, either permitted script model, theme, editorial instructions, duration, reading speed, background/music choices and inference reservation budget.
3. Choose the saved profile, enter a working title and emotional need, and select **Generate complete private draft**. Each explicit request creates a new episode; existing episodes are preserved.
4. Follow progress in Recent runs. Open the episode to inspect its unreviewed script, reading cards and exact saved composition. Completed runs have both MP4s, SRT captions and a source-referenced description in Exports.
5. Review the actual outputs and their source context. Draft automation never records creator approval or grants source, speech or media reuse rights.

Profiles are immutable through the application. Save another profile when defaults change. Runs retain the original profile and media checksums independently of later choices. The target duration guides writing; reading speed determines the actual video length. Over-five-minute output is rejected rather than silently cut. Upload personal media through an episode’s existing Music or Backgrounds section before choosing it in a profile.

The included local **Calm private drafts** profile uses Luna, the current partial Abdel Haleem edition, a 120-second writing target, 110 words/minute, the Forest palette, silence, and a $0.05 inference reservation limit. It clears no publication rights.

## Recovery and cost

An uncertain browser start retains its request identity in that tab’s session storage; confirm it to recover the same episode. Reusing an identity with different input is rejected. Failed jobs can retry the same run. A saved script or composition is reused after restart; completed export registration and the run’s pointers require a valid worker lease. New manual drafts, selections or episode edits pause automation before composition so they are retained. Once composition is captured, rendering uses that exact snapshot even if the editor changes afterward.

The cumulative budget includes embedding and drafting reservations, outstanding holds, settled estimates and higher reported costs. The maximum profile budget is $0.10. Reservation estimates are not a provider billing guarantee. Unknown provider outcomes remain **Needs reconciliation** and cannot automatically dispatch again. There is no provider/model/paid speech fallback.

## Verification

Run `pnpm check`, `pnpm test:db` and `pnpm build`. For synthetic sources and injected generation with actual worker/Remotion renders:

```sh
pnpm exec tsx --conditions=react-server scripts/verify-automation-workflow.ts
```

Add `--serve` after building for a disposable browser fixture on port 3109. Commands are `complete`, `fail`, `uncertain`, `report` and `stop`. `complete` processes queued fixture runs, probes both layouts and fully decodes the MP4s. Provider keys are blanked in the fixture web server; embeddings and generation are synthetic. `stop` stops its server and removes only the disposable database; generated evidence stays ignored.

See [acceptance evidence](evidence/2026-10-14-draft-automation.md). Synthetic generation is not live-provider, real-source or creator-review evidence.
