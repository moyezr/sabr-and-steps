import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultEditorSettings,
  editorSettingsKey,
  fitSceneText,
  editorSettingsSchema,
  retimeReadingCues,
  musicGainAt,
  splitCue,
  mergeCue,
  validateCaptionRestructure,
} from "../../lib/domain/scene-settings";
import {
  validateCues,
  type Cue,
  compositionSchema,
  cueSchema,
} from "../../lib/domain/media";

const cues: Cue[] = [
  {
    start: 0.5,
    end: 3,
    text: "Take one small step today.",
    kind: "reflection",
    blockIndex: 0,
  },
  {
    start: 3,
    end: 5,
    text: "Exact canonical words.",
    kind: "quote",
    reference: "1:1",
    edition: "Synthetic fixture",
    blockIndex: 1,
  },
];
test("reading durations preserve exact words and attribution and reject changed card counts", () => {
  const settings = {
    ...defaultEditorSettings(),
    openingSeconds: 2,
    cardDurations: [4, 3],
  };
  const updated = retimeReadingCues(cues, settings);
  assert.deepEqual(
    updated.map((c) => [c.start, c.end]),
    [
      [2, 6],
      [6, 9],
    ],
  );
  validateCaptionRestructure(cues, updated);
  assert.equal(updated[1].reference, "1:1");
  assert.throws(
    () => retimeReadingCues(cues, { ...settings, cardDurations: [1] }),
    /READING_CARDS_CHANGED/,
  );
});
test("caption split/merge and line breaks preserve source boundaries and reject word or citation changes", () => {
  const split = splitCue(cues, 0, 2);
  assert.equal(split.length, 3);
  validateCues(split, 5);
  validateCaptionRestructure(cues, split);
  assert.deepEqual(mergeCue(split, 0), cues);
  assert.throws(() => mergeCue(cues, 0), /CAPTION_MERGE_INVALID/);
  const broken = cues.map((c) => ({
    ...c,
    text: c.text.replaceAll(" ", "\n"),
  }));
  validateCaptionRestructure(cues, broken);
  assert.throws(
    () =>
      validateCaptionRestructure(cues, [
        { ...cues[0], text: "Changed words." },
        cues[1],
      ]),
    /CAPTION_WORDS_CHANGED/,
  );
  assert.throws(
    () =>
      validateCaptionRestructure(cues, [
        cues[0],
        { ...cues[1], reference: "1:2" },
      ]),
    /CAPTION_WORDS_CHANGED/,
  );
});
test("music has separate fades and smooth narration ducking, without lowering text-only music", () => {
  assert.equal(musicGainAt(0, 10, 2, 3, 0.3, cues, true), 0);
  assert(Math.abs(musicGainAt(2, 10, 2, 3, 0.3, cues, true) - 0.3) < 1e-8);
  assert.equal(musicGainAt(2, 10, 2, 3, 0.3, cues, false), 1);
  assert(Math.abs(musicGainAt(9, 10, 2, 3, 0.3, cues, true) - 1 / 3) < 1e-8);
  assert.equal(musicGainAt(10, 10, 2, 3, 0.3, cues, false), 0);
  assert(musicGainAt(0.4, 10, 0, 0, 0.3, cues, true) > 0.3);
});
test("versioned visual settings reject unsupported style and unbounded durations", () => {
  assert.equal(editorSettingsSchema.parse({}).framing.vertical.zoom, 1);
  assert.equal(
    editorSettingsSchema.safeParse({ visual: { textColor: "url(secret)" } })
      .success,
    false,
  );
  assert.equal(
    editorSettingsSchema.safeParse({ cardDurations: [Infinity] }).success,
    false,
  );
  assert.equal(
    editorSettingsSchema.safeParse({ framing: { vertical: { zoom: 4 } } })
      .success,
    false,
  );
  const legacy = {
    version: 1,
    title: "Fixture",
    scriptChecksum: "",
    voiceChecksum: "",
    captionChecksum: "",
    duration: 5,
    fps: 30,
    cues,
    audioUrl: "",
    background: "forest",
    ambience: "none",
    ambienceVolume: 0,
    narrationVolume: 1,
    draft: true,
    attribution: "",
  };
  assert.equal(compositionSchema.parse(legacy).version, 1);
  assert.equal(
    compositionSchema.parse({
      ...legacy,
      version: 3,
      editorSettings: defaultEditorSettings(),
    }).version,
    3,
  );
});

test("saved scene settings compare by schema values regardless of client property order", () => {
  const a = {
    ...defaultEditorSettings(),
    sceneOverrides: [
      {
        cueIndex: 1,
        visual: defaultEditorSettings().visual,
        framing: defaultEditorSettings().framing,
      },
    ],
  };
  const b = {
    ...a,
    sceneOverrides: [
      {
        framing: defaultEditorSettings().framing,
        cueIndex: 1,
        visual: defaultEditorSettings().visual,
      },
    ],
  };
  assert.equal(editorSettingsKey(a), editorSettingsKey(b));
  assert.notEqual(
    editorSettingsKey(a),
    editorSettingsKey({ ...b, closingSeconds: 2 }),
  );
});

test("edited card typography fits long captions and explicit line breaks within its text budget", () => {
  const size = fitSceneText("W".repeat(300), 1440, 250, 96, 1.7);
  assert(size >= 24 && size < 96);
  assert.equal(fitSceneText("One small step.", 1440, 432, 84, 1.24), 84);
  assert(
    fitSceneText(
      "Line one\nLine two\nLine three\nLine four",
      840,
      200,
      85,
      1.7,
    ) < 85,
  );
});

test("caption line breaks reject layouts beyond six lines while retaining exact wording", () => {
  assert.equal(
    cueSchema.safeParse({ ...cues[0], text: "Take\none\nsmall\nstep\ntoday." })
      .success,
    true,
  );
  assert.equal(
    cueSchema.safeParse({
      ...cues[0],
      text: "Take\n\n\none\nsmall\nstep\ntoday.",
    }).success,
    false,
  );
});

test("trim validation prevents invalid media ranges from reaching the live Player", () => {
  const base = {
    version: 3,
    title: "Fixture",
    scriptChecksum: "",
    voiceChecksum: "",
    captionChecksum: "",
    duration: 5,
    fps: 30,
    cues,
    audioUrl: "",
    background: "forest",
    ambience: "none",
    ambienceVolume: 0,
    narrationVolume: 0,
    draft: true,
    attribution: "",
    music: {
      id: "12345678-1234-4234-8234-123456789abc",
      url: "/fixture.mp3",
      checksum: "fixture",
      name: "Synthetic",
      provenance: "Fixture",
      duration: 2,
    },
  };
  assert.equal(
    compositionSchema.safeParse({
      ...base,
      editorSettings: {
        ...defaultEditorSettings(),
        musicStart: 0.2,
        musicEnd: 1.8,
      },
    }).success,
    true,
  );
  assert.equal(
    compositionSchema.safeParse({
      ...base,
      editorSettings: {
        ...defaultEditorSettings(),
        musicStart: 1.8,
        musicEnd: 1.2,
      },
    }).success,
    false,
  );
  assert.equal(
    compositionSchema.safeParse({
      ...base,
      editorSettings: { ...defaultEditorSettings(), musicStart: 2.1 },
    }).success,
    false,
  );
  assert.equal(
    compositionSchema.safeParse({
      ...base,
      editorSettings: {
        ...defaultEditorSettings(),
        musicStart: 1,
        musicEnd: 1.01,
      },
    }).success,
    false,
  );
});
