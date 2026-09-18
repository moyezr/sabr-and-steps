import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeWorkspace,
  workspaceHref,
  WORKSPACE_SECTIONS,
  type WorkspaceInput,
} from "../../lib/domain/workspace";

function fixture(changes: Partial<WorkspaceInput> = {}): WorkspaceInput {
  return {
    episode: {
      id: "episode",
      title: "A saved idea",
      updatedAt: "2026-09-16",
      revision: 2,
    },
    scripts: [],
    takes: [],
    tracks: [],
    compositions: [],
    exports: [],
    jobs: [],
    ...changes,
  };
}

test("workspace opens ideas, drafts, and generated episodes at their available work", () => {
  const empty = summarizeWorkspace(fixture());
  assert.equal(empty.defaultSection, "idea");
  assert.equal(empty.stages.script.tone, "empty");
  assert.equal(empty.stages.video.tone, "empty");
  assert.equal(empty.hasActiveJobs, false);
  assert.equal(empty.exportCount, 0);
  const draft = summarizeWorkspace(
    fixture({ scripts: [{ id: "script", episodeRevision: 2 }] }),
  );
  assert.equal(draft.defaultSection, "script");
  assert.equal(draft.stages.script.tone, "ready");
  const generated = summarizeWorkspace(
    fixture({
      compositions: [
        {
          id: "composition",
          stale: true,
          data: { mode: "text", ambience: "none" },
        },
      ],
    }),
  );
  assert.equal(generated.defaultSection, "video");
  assert.equal(generated.stages.video.tone, "attention");
  assert.equal(generated.stages.voice.label, "Update reading cards");
});

test("workspace readiness follows the persisted script selection", () => {
  const input = fixture({
    selectedScriptId: "selected",
    scripts: [
      { id: "newest-alternative", episodeRevision: 1 },
      { id: "selected", episodeRevision: 2 },
    ],
    takes: [{ id: "take", scriptId: "selected", stale: false }],
    tracks: [{ id: "track", voiceTakeId: "take" }],
  });
  const summary = summarizeWorkspace(input);
  assert.equal(summary.stages.script.label, "Draft saved");
  assert.equal(summary.stages.voice.label, "Take saved");

  input.selectedScriptId = "newest-alternative";
  assert.equal(summarizeWorkspace(input).stages.script.label, "Idea changed");
});

test("text-only previews need no voice and exports reflect the latest saved preview", () => {
  const input = fixture({
    scripts: [{ id: "script", episodeRevision: 2 }],
    compositions: [
      { id: "latest", stale: false, data: { mode: "text", ambience: "none" } },
    ],
    exports: [{ compositionId: "old" }],
  });
  const earlier = summarizeWorkspace(input);
  assert.equal(earlier.stages.voice.label, "Reading cards");
  assert.equal(earlier.stages.voice.tone, "ready");
  assert.equal(earlier.stages.music.label, "No music");
  assert.equal(earlier.stages.background.label, "Built-in background");
  assert.equal(earlier.stages.exports.label, "Earlier exports");
  assert.equal(earlier.stages.exports.tone, "attention");
  input.exports = [...input.exports, { compositionId: "latest" }];
  assert.equal(summarizeWorkspace(input).stages.exports.tone, "ready");
  assert.equal(summarizeWorkspace(input).exportCount, 2);
  input.compositions = [{ ...input.compositions[0], stale: true }];
  assert.equal(
    summarizeWorkspace(input).stages.exports.label,
    "Earlier exports",
  );
});

test("narration readiness follows script and caption dependencies including legacy previews", () => {
  const input = fixture({
    scripts: [{ id: "script", episodeRevision: 2 }],
    takes: [{ id: "take", scriptId: "script", stale: false }],
    compositions: [
      { id: "legacy", stale: false, data: { ambience: "soft-noise" } },
    ],
  });
  assert.equal(summarizeWorkspace(input).stages.voice.label, "Timing needed");
  assert.equal(
    summarizeWorkspace(input).stages.music.label,
    "Ambience selected",
  );
  input.tracks = [{ id: "track", voiceTakeId: "take" }];
  assert.equal(summarizeWorkspace(input).stages.voice.label, "Take saved");
  input.takes = [{ id: "take", scriptId: "script", stale: true }];
  assert.equal(
    summarizeWorkspace(input).stages.voice.label,
    "Update narration",
  );
  input.scripts = [{ id: "new-script", episodeRevision: 1 }];
  assert.equal(
    summarizeWorkspace(input).stages.voice.label,
    "Update narration",
  );
  assert.equal(summarizeWorkspace(input).stages.script.label, "Idea changed");
});

test("active jobs mark only their stage; historical failures do not hide saved output", () => {
  const input = fixture({
    scripts: [{ id: "script", episodeRevision: 2 }],
    jobs: [
      { kind: "draft", status: "failed" },
      { kind: "render", status: "succeeded" },
    ],
  });
  assert.equal(summarizeWorkspace(input).stages.script.tone, "ready");
  assert.equal(summarizeWorkspace(input).hasActiveJobs, false);
  input.jobs = [
    ...input.jobs,
    { kind: "draft", status: "queued" },
    { kind: "narration", status: "running" },
    { kind: "render", status: "running" },
  ];
  const summary = summarizeWorkspace(input);
  assert.equal(summary.hasActiveJobs, true);
  assert.deepEqual(summary.stages.script, { label: "Queued", tone: "working" });
  assert.equal(summary.stages.voice.tone, "working");
  assert.equal(summary.stages.exports.tone, "working");
  assert.equal(summary.stages.video.tone, "empty");
  assert.equal(summary.stages.music.tone, "empty");
  input.jobs = [
    { kind: "draft", status: "running" },
    { kind: "draft", status: "queued" },
  ];
  assert.equal(summarizeWorkspace(input).stages.script.label, "Generating");
});

test("failed and uncertain jobs stay visible when their stage has no usable artifact", () => {
  const summary = summarizeWorkspace(
    fixture({
      jobs: [
        { kind: "draft", status: "failed" },
        { kind: "narration", status: "needs_attention" },
        { kind: "render", status: "failed" },
      ],
    }),
  );
  assert.deepEqual(summary.stages.script, {
    label: "Last attempt failed",
    tone: "attention",
  });
  assert.deepEqual(summary.stages.voice, {
    label: "Check provider result",
    tone: "attention",
  });
  assert.deepEqual(summary.stages.exports, {
    label: "Last attempt failed",
    tone: "attention",
  });
  assert.equal(summary.hasActiveJobs, false);

  const active = summarizeWorkspace(
    fixture({
      jobs: [
        { kind: "draft", status: "failed" },
        { kind: "draft", status: "queued" },
      ],
    }),
  );
  assert.deepEqual(active.stages.script, { label: "Queued", tone: "working" });
});

test("uploaded music and image selection is reflected without exposing private data", () => {
  const input = fixture({
    compositions: [
      {
        id: "preview",
        stale: false,
        data: {
          mode: "text",
          ambience: "none",
          music: { id: "music" },
          image: { id: "image" },
        },
      },
    ],
  });
  const summary = summarizeWorkspace(input);
  assert.equal(summary.stages.music.label, "Music selected");
  assert.equal(summary.stages.background.label, "Image selected");
  assert.deepEqual(Object.keys(summary.episode).sort(), [
    "id",
    "title",
    "updatedAt",
  ]);
  assert.equal("compositions" in summary, false);
});

test("every section has an accessible route including empty stages", () => {
  assert.equal(workspaceHref("episode", "idea"), "/episodes/episode/brief");
  assert.equal(workspaceHref("episode", "script"), "/episodes/episode/script");
  for (const section of WORKSPACE_SECTIONS.slice(2)) {
    assert.equal(
      workspaceHref("episode", section.id),
      `/episodes/episode/studio?section=${section.id}`,
    );
  }
});
