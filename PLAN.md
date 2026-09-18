# Episode editor plan

Date: 2026-09-16.

Status: accepted by the creator; milestone 1 is complete as F008. Milestone 2 is the next bounded implementation. This document records intended behavior; verification and session results remain in `PROGRESS.md` and `feature_list.json`.

## Goal

Make each episode a persistent editing workspace where the creator can move freely between writing, sound, visuals, and export while seeing the video take shape.

The creator should be able to begin with a vague feeling or scenario, develop an Islamic reminder in the Sabr & Steps format, iterate with different models, manually revise the script, bring their own music and backgrounds, adjust the video, and export the desired format.

## Findings that motivated the plan

- The prominent workflow steps are non-clickable labels. `WorkflowSteps` always marks Idea as current and labels later stages Upcoming.
- Separate script and studio screens exist, but the episode interface does not connect them into a consistent editing experience.
- The existing pilot's script editor, media uploads, preview, and downloads load through those separate routes. These capabilities should be retained and integrated.
- Generating a draft with unchanged inputs can return the previous completed job instead of producing a fresh alternative.
- Model preferences, output format, and content share an episode revision, so changing a preference can mark otherwise valid media as outdated.
- Several media paths automatically use the newest script or voice take instead of an explicitly selected version.

## Workspace design

```text
Episode title       Saved · Undo/Redo · History       Export

Sections         Editing area                  Live preview
──────────       ─────────────────────         ──────────────
Idea             Controls/content for          Landscape /
Script & sources the selected section          Vertical
Voice & captions
Music            Contextual AI assistance      Playback
Backgrounds      and source information        controls
Video styling

                 Scene timeline + audio tracks
```

Navigation stays available throughout. The creator can upload music before writing, revisit the idea after previewing, or change a background without repeating earlier steps. On smaller screens, preserve access to editing and preview without squeezing every panel into the desktop arrangement.

## 1. Open existing episodes as editable projects

Opening “When waiting feels heavy” should load its selected script, voice or text-only mode, backgrounds, music, timing, and latest composition.

Replace the decorative workflow with real navigation. Show useful states such as Ready, Generating, or Needs updated narration. An unfinished section remains accessible and explains what is needed; only actions with unmet prerequisites are unavailable.

Keep the episode title, saving status, history, preview, and export action consistent across the workspace.

## 2. Begin with a feeling or unfinished thought

Accept an input such as: “I've been trying for months and feel like nothing is changing.”

Offer two paths: develop it manually, or ask AI to suggest angles, working titles, hooks, and a practical takeaway. Let the creator refine suggestions with instructions such as “more reassuring,” “less formal,” or “focus on patience.”

Place the model selector beside each generation action. Use only the two permitted models, `openai/gpt-5.6-luna` and `google/gemini-3.8-flash`, through OpenRouter. Preserve previous suggestions when switching models, and record which model produced each result.

## 3. Support real script iteration

Organize the script into editable blocks: opening, reflections, quotations, practical steps, and closing. Allow writing from scratch, adding or removing blocks, reordering, and direct text editing.

Selecting a sentence or paragraph exposes actions to:

- Rewrite with custom instructions.
- Shorten, simplify, or adjust the tone.
- Generate alternatives using either permitted model.
- Compare the suggestion with the original, then accept or reject it.

AI suggestions leave the current script intact until accepted.

Keep source search and surrounding context in a drawer beside the script. Creators can select, insert, or replace passages without leaving the episode. Canonical quotations stay linked to their verified wording and edition; original reflections remain freely editable. Preserve source attribution and make corpus coverage limitations visible.

## 4. Make versions, saving, and undo dependable

Add autosaved working drafts, undo/redo, and named versions with meaningful labels, model information, and generation instructions. Allow comparing versions and restoring an older version as a new one.

The selected version must be explicit. Generating another script or voice take must not silently replace the version currently used by the video. Persist the selected script, voice take, caption track, and composition.

Distinguish “Generate another,” which produces a fresh alternative, from retrying an interrupted request, which safely resumes the same operation. Snapshot the generation input and its source revision. If AI finishes while the creator is editing, its result becomes a suggestion instead of overwriting their changes.

Keep working drafts separate from immutable checkpoints and export snapshots. Retain local edits on save failure or revision conflict, and protect unsaved work when navigating between sections.

## 5. Give narration and captions focused controls

Support narrated videos and text-only reading cards as equal workflows.

For narration, let the creator choose a working provider and voice, audition it, adjust supported delivery settings, generate takes, compare them, and select the preferred take. Show expected credit use before generation and retain the existing credit and rights checks. Only expose provider capabilities that are implemented and usable.

For captions, provide playback-linked timing, phrase splitting and merging, line breaks, and styling controls. Clicking a caption seeks to its position in the video.

For text-only videos, allow reading-speed changes and individual card durations. Wording edits remain connected to the script so captions and narration cannot quietly diverge.

## 6. Make music and backgrounds easy to bring in and shape

Turn the existing uploads into a visible media library with thumbnails, audio previews, names, and source notes.

Music controls include track selection, trim/start offset, volume, looping, separate fade-in and fade-out, and lowering music during narration.

Background controls include uploaded images/GIFs, crop, position, zoom, and dimming. Allow applying a background to the entire video or selected scenes, with separate framing adjustments for landscape and vertical.

Preserve the current image/GIF scope initially. Video-file backgrounds remain a later extension. Creator uploads are the primary workflow; a stock library is not required.

## 7. Add a scene timeline and direct visual control

Represent the video as scenes linked to script blocks. Selecting a scene highlights its words, background, timing, and styling controls.

Expose the details currently hard-coded in the video: typography, text size, line spacing, placement, colors, transitions, opening/closing cards, and branding. Provide whole-video defaults with scene overrides where useful. Preserve readable source attribution.

Changes appear immediately in the preview. Preview and render continue to consume the same versioned composition data.

The timeline distinguishes reading-card durations from timing derived from narration. Changing spoken content clearly identifies the audio that needs updating; changing visuals alone preserves valid narration.

## 8. Make export a deliberate final step

Offer landscape, vertical, or both, with a preview of the selected output. Initially retain the existing 1080p MP4 outputs, caption file, and source-referenced description.

Export captures an exact saved revision, shows progress and recoverable errors, and keeps previous exports available. Each export reveals which script, voice, media, and settings produced it.

Keep private drafts and publication-ready outputs clearly distinguished, with outstanding reviews shown in one understandable place. Export availability does not imply publication clearance. Long-running generation and rendering continue through the durable worker.

## Changes and their effects

Changes should affect only work that depends on them.

| Change | Expected effect |
| --- | --- |
| Switch the model for the next request | Existing script and media remain usable |
| Generate an alternative | Current selected version stays unchanged |
| Accept changed spoken words | Corresponding narration and timing need updating |
| Change music, background, or typography | Update preview/export; preserve narration |
| Change export orientation | Preserve script and narration; check layout |

## Implementation milestones

Implement one bounded milestone at a time, with acceptance evidence before proceeding. F008 tracks milestone 1; F005 is paused for creator feedback and resumes after the navigation milestone. D018 records the phased editor direction.

| Order | Deliverable | Status |
| --- | --- | --- |
| 1 | Connected episode workspace, working navigation, existing-project loading | Completed (F008) |
| 2 | Autosave, explicit version selection, history, correct change tracking | Planned |
| 3 | Idea assistance, iterative script editing, source selection, partial rewrites | Planned |
| 4 | Scene timeline, voice/caption editing, media library, visual controls | Planned |
| 5 | Format-specific export, consolidated review, complete workflow testing | Planned |

### Milestone 1 boundary

Connect existing functionality through a shared episode workspace: Idea, Script & sources, Voice & captions, Music, Backgrounds, Video, and Exports. The episode entry route should open Video when a composition exists, otherwise Script when a draft exists, otherwise Idea. Idea remains directly reachable at `/episodes/[id]/brief`; script keeps its existing route and studio sections have addressable query links.

Load existing persisted artifacts and show stage states derived from their revisions and outstanding jobs. Keep incomplete sections accessible, explain prerequisites beside affected actions, preserve unsaved media edits when switching Studio sections, guard in-app links and browser reload/close, and retain earlier exports. The mounted episode workspace retains dirty drafts across intra-episode Back/Forward navigation; persisted recovery after reload or restart remains part of milestone 2. Reuse existing upload, timing, preview, and render controls without claiming new media capabilities.

This milestone does not add autosave, undo/redo, named history, explicit selected-version persistence, partial AI rewrites, a scene timeline, or new rendering formats. Existing latest-artifact selection remains until milestone 2. No database migration or model inference is required. Completion requires the connected-editor checks in [docs/verification.md](docs/verification.md), not merely compilation.

Retain existing episodes, source records, media, and exports during migration. Future implementation should use focused commits with actual timestamps and follow the repository's verification and handoff rules.

## Acceptance journey

Verify an actual creative session:

1. Reopen “When waiting feels heavy” and reach every editor section directly.
2. Try another model and generate a fresh alternative without replacing the currently selected work.
3. Rewrite one paragraph, compare the proposal, and accept it without changing unrelated blocks or quotations.
4. Compare versions, restore an older version as a new one, and verify the selected version persists.
5. Upload music and a background; adjust the mix, captions, scene styling, and framing.
6. Reload and navigate between sections without losing saved work; verify clear recovery for failed saves and conflicts.
7. Change the model preference or output orientation without invalidating valid narration.
8. Edit while generation is running; verify its completion cannot overwrite subsequent manual edits.
9. Preview and export the selected format, verifying that the output matches the chosen composition and that older exports remain available.
10. Exercise generation/render failures, recovery, keyboard navigation, and smaller-screen layouts.

Use deterministic fixtures for routine generation tests. Identify live-provider checks separately, preserving the existing authorization, cost, and rights boundaries.
