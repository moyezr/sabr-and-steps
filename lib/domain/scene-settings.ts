import { z } from "zod";
import type { Cue } from "./media";

export const visualSettingsSchema = z.object({
  font: z.enum(["serif", "sans"]).default("serif"),
  textScale: z.number().min(0.65).max(1.15).default(1),
  lineHeight: z.number().min(1.1).max(1.7).default(1.24),
  alignment: z.enum(["center", "left"]).default("center"),
  placement: z.enum(["upper", "center", "lower"]).default("center"),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#fff9e9"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#e5d7b6"),
  transition: z.enum(["fade", "cut"]).default("fade"),
  openingText: z.string().max(160).default(""),
  closingText: z.string().max(160).default("One gentle step at a time."),
  branding: z.string().max(40).default("SABR & STEPS"),
});
export const framingSchema = z.object({
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  zoom: z.number().min(1).max(2).default(1),
});
export const formatFramingSchema = z.object({
  landscape: framingSchema.default({ x: 50, y: 50, zoom: 1 }),
  vertical: framingSchema.default({ x: 50, y: 50, zoom: 1 }),
});
export const sceneOverrideInputSchema = z.object({
  cueIndex: z.number().int().min(0).max(999),
  imageId: z.string().uuid().nullable().optional(),
  imageDim: z.number().min(0.2).max(0.85).optional(),
  framing: formatFramingSchema.optional(),
  visual: visualSettingsSchema.optional(),
});
export const editorSettingsSchema = z.object({
  visual: visualSettingsSchema.default(visualSettingsSchema.parse({})),
  framing: formatFramingSchema.default(formatFramingSchema.parse({})),
  sceneOverrides: z.array(sceneOverrideInputSchema).max(1000).default([]),
  cardDurations: z.array(z.number().min(0.5).max(30)).max(1000).default([]),
  openingSeconds: z.number().min(0).max(8).default(0.5),
  closingSeconds: z.number().min(0.1).max(8).default(0.6),
  musicStart: z.number().min(0).max(1800).default(0),
  musicEnd: z.number().positive().max(1800).nullable().default(null),
  musicFadeIn: z.number().min(0).max(10).default(3),
  musicFadeOut: z.number().min(0).max(10).default(3),
  musicDuck: z.number().min(0).max(1).default(0.35),
});
export type EditorSettings = z.infer<typeof editorSettingsSchema>;
export type VisualSettings = z.infer<typeof visualSettingsSchema>;
export const defaultEditorSettings = () => editorSettingsSchema.parse({});
/** Normalize schema key order before comparing local settings with server snapshots. */
export function editorSettingsKey(input: unknown) {
  const result = editorSettingsSchema.safeParse(input);
  return JSON.stringify(result.success ? result.data : input);
}

export function retimeReadingCues(
  cues: Cue[],
  settings: EditorSettings,
): Cue[] {
  if (
    settings.cardDurations.length &&
    settings.cardDurations.length !== cues.length
  )
    throw new Error("READING_CARDS_CHANGED");
  let time = settings.openingSeconds;
  return cues.map((cue, i) => {
    const duration = settings.cardDurations[i] ?? cue.end - cue.start;
    const next = { ...cue, start: time, end: time + duration };
    time = next.end;
    return next;
  });
}

export function musicGainAt(
  seconds: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
  duck: number,
  cues: Cue[],
  narrated: boolean,
) {
  if (seconds < 0 || seconds >= duration) return 0;
  const fade = Math.min(
    1,
    fadeIn ? seconds / fadeIn : 1,
    fadeOut ? (duration - seconds) / fadeOut : 1,
  );
  // A short ramp around spoken phrases avoids abrupt gain changes.
  let proximity = 0;
  if (narrated)
    for (const cue of cues) {
      const distance =
        seconds < cue.start
          ? cue.start - seconds
          : seconds > cue.end
            ? seconds - cue.end
            : 0;
      proximity = Math.max(proximity, Math.max(0, 1 - distance / 0.2));
    }
  return Math.max(0, fade) * (1 - proximity * (1 - duck));
}

export function splitCue(cues: Cue[], index: number, wordCount: number): Cue[] {
  const cue = cues[index];
  if (!cue) throw new Error("CAPTION_NOT_FOUND");
  const words = cue.text.trim().split(/\s+/);
  if (
    !Number.isInteger(wordCount) ||
    wordCount < 1 ||
    wordCount >= words.length
  )
    throw new Error("CAPTION_SPLIT_INVALID");
  const middle = cue.start + ((cue.end - cue.start) * wordCount) / words.length;
  return [
    ...cues.slice(0, index),
    { ...cue, text: words.slice(0, wordCount).join(" "), end: middle },
    { ...cue, text: words.slice(wordCount).join(" "), start: middle },
    ...cues.slice(index + 1),
  ];
}
export function mergeCue(cues: Cue[], index: number): Cue[] {
  const a = cues[index],
    b = cues[index + 1];
  if (
    !a ||
    !b ||
    a.kind !== b.kind ||
    a.reference !== b.reference ||
    a.edition !== b.edition ||
    a.sourceKind !== b.sourceKind ||
    a.blockIndex !== b.blockIndex ||
    `${a.text} ${b.text}`.length > 300
  )
    throw new Error("CAPTION_MERGE_INVALID");
  return [
    ...cues.slice(0, index),
    { ...a, text: `${a.text} ${b.text}`, end: b.end },
    ...cues.slice(index + 2),
  ];
}
/** Split/merge and line breaks may change phrase boundaries, never words or citation attribution. */
export function validateCaptionRestructure(original: Cue[], updated: Cue[]) {
  const groups = (items: Cue[]) => {
    const output: { key: string; words: string[] }[] = [];
    for (const c of items) {
      const key = JSON.stringify([
        c.kind,
        c.reference,
        c.edition,
        c.sourceKind,
        c.blockIndex,
      ]);
      const words = c.text.trim().split(/\s+/);
      const last = output[output.length - 1];
      if (last?.key === key) last.words.push(...words);
      else output.push({ key, words });
    }
    return output;
  };
  if (JSON.stringify(groups(original)) !== JSON.stringify(groups(updated)))
    throw new Error("CAPTION_WORDS_CHANGED");
}

/** Conservative wrapping estimate for edited cards; saved legacy layouts keep their original sizing. */
export function fitSceneText(
  text: string,
  width: number,
  height: number,
  requestedSize: number,
  lineHeight: number,
) {
  let size = requestedSize;
  while (size > 24) {
    const columns = Math.max(1, Math.floor(width / size));
    const lines =
      text
        .split("\n")
        .reduce(
          (sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)),
          0,
        ) + 1;
    if (lines * size * lineHeight <= height) break;
    size = Math.max(24, size - 2);
  }
  return size;
}
