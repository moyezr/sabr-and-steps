# Uploaded video backgrounds — F019

Date: 2026-10-08. Real local upload/render checks with original synthetic test clips and reflection text; no provider inference or creator pilot approval.

## Delivered behavior

Upload H.264 MP4 clips up to 30 MB, two minutes, 1920 pixels/1080p pixel area and 60 fps. Content inspection rejects unsupported media independently of filenames/MIME headers. Videos appear in the media library with muted previews and source notes. They can be used across a composition or on an individual scene with the existing dimming, crop, zoom and independent orientation controls.

Composition v4 snapshots explicit video kind, inspected duration, dimensions, checksum and provenance. Compatibility keys `image`/`sceneImages` continue to represent visual backgrounds; v1–v3 snapshots remain readable and cannot contain video descriptors. No database migration/dependency change is required. Clip audio stays muted. Whole-video loops follow the composition clock; scene loops restart at their first cue frame. Player and render share EpisodeFilm. Export descriptions and media-rights declarations include clips without inferring publication clearance.

## Verification

- `pnpm check`: harness/lint/types and 67 unit tests pass. New cases cover codec/duration/frame rate/pixel/stream/rotation bounds, required versioned video metadata, legacy image compatibility, suffix/seeking ranges and invalid offsets.
- `pnpm test:db`: all ten existing disposable DB suites pass. Source/provider/editor boundaries retain their recorded evidence.
- `pnpm build` and `git diff --check`: pass.
- `scripts/verify-video-backgrounds.ts --serve`: actual FFmpeg original clips, including embedded 880 Hz tone audio, actual upload inspection, unsupported/malformed/oversized rejection with no retained failed bytes, kind checks, prefix/suffix range serving, migration/repeat, immutable save/read, old image-only save, checksum tamper rejection and real durable rendering. Each output is completely decoded and probed; both formats have expected 1080p dimensions and no audio stream. Six short MP4s were rendered across original, final-build and browser-adjusted checks.
- `scripts/verify-video-frames.ts <fixture.json>`: actual PNGs through the saved renderer bundle in landscape and vertical. Adjacent frames differ, frames exactly one clip loop apart are byte-identical for both whole-video and scene clips, and a relocated scene at source frame four matches the original scene at composition frame 70 (scene begins at frame 66), outside text overlays. The initial relocated-scene check reused resolved composition props; correcting its selectComposition input made the independent comparison valid without changing EpisodeFilm or weakening the assertion.
- Browser: rejected PNG-as-video retains filename/library name and gives the format bounds; valid MP4/source notes append to the library and clear only the submitted form. Whole-video selection, scene/color switching, landscape x=100/zoom=1.05 and independent scene vertical x=0/zoom=1.05 persist after save/reload. All media video elements report muted=true with decoded frames. The browser-adjusted composition was rendered in both formats and its vertical download was completely decoded.
- Actual 390×844 and 1280×900 checks have no horizontal overflow. Thumbnails share responsive visual sizing; scene selection seeks the paused video and shows its words. Stage labels identify Video selected, and exact-export rights wording includes video clips.

The range-serving browser checks exposed garbage-collected FileHandles in the previous manual stream path. Node read streams now own descriptor closure on completion/cancel/failure. Final checks emitted no repeat of that diagnostic.

## Reproduction and retained evidence

See [verification commands](../verification.md#uploaded-video-backgrounds-f019). Raw snapshots/PNG/MP4s remain ignored under `.data/evidence/video-backgrounds/`: initial run `e3e0d0d9-4659-4839-96e0-5bd4bde529fc`, final run `6d7690d2-278a-4330-8ca2-d115e7eb4304`. Final desktop/mobile screenshots are in the latter folder. Disposable DBs and port 3112 servers were stopped/removed; no inference worker was started.

The real app was restarted on port 3107 with the final build. The existing pilot remains revision 4 with selected v2 text-only “Misty lake · dawn stillness”, duration 148.1 seconds. No personal media was removed and no source/provider rights or actual pilot approval changed. Temporal trim/speed, other codecs/containers and clip-audio mixing are outside this bounded feature.
