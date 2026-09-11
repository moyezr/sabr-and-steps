import { z } from "zod";
import { type ScriptBlock } from "./script";
export const cueSchema = z.object({
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  text: z.string().min(1).max(300),
  kind: z.enum(["reflection", "quote"]),
  reference: z.string().optional(),
  edition: z.string().optional(),
});
export type Cue = z.infer<typeof cueSchema>;
export const voiceSettingsSchema = z.object({
  speed: z.number().min(0.7).max(1.2).default(1),
  stability: z.number().min(0).max(1).default(0.65),
  similarity_boost: z.number().min(0).max(1).default(0.75),
});
export const narrationInputSchema = z.object({
  scriptId: z.string().uuid(),
  provider: z.enum(["cartesia", "elevenlabs", "deepgram"]),
  voiceId: z.string().min(1).max(100),
  settings: voiceSettingsSchema,
  purpose: z.enum(["audition", "publish"]),
  reviewMode: z.enum(["stages", "consolidated"]),
  providerOverride: z.boolean().default(false),
});
export function spokenSegments(blocks: ScriptBlock[]) {
  let offset = 0;
  return blocks.map((b, index) => {
    const text =
      b.kind === "quote"
        ? `In a translation of the Quran, chapter ${b.reference.split(":")[0]}, verse ${b.reference.split(":")[1]}: ${b.text}`
        : b.text;
    const item = {
      start: offset,
      end: offset + text.length,
      text,
      kind: b.kind,
      reference: b.kind === "quote" ? b.reference : undefined,
      edition: b.kind === "quote" ? b.edition : undefined,
    };
    offset += text.length + (index < blocks.length - 1 ? 2 : 0);
    return item;
  });
}
export const alignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number().finite().nonnegative()),
  character_end_times_seconds: z.array(z.number().finite().nonnegative()),
});
export function cuesFromAlignment(
  blocks: ScriptBlock[],
  alignment: z.infer<typeof alignmentSchema>,
): Cue[] {
  const segments = spokenSegments(blocks);
  const transcript = segments.map((s) => s.text).join("\n\n");
  const text = alignment.characters.join("");
  if (text !== transcript) throw new Error("ALIGNMENT_TEXT_MISMATCH");
  const starts = alignment.character_start_times_seconds,
    ends = alignment.character_end_times_seconds;
  if (
    starts.length !== alignment.characters.length ||
    ends.length !== starts.length ||
    !starts.length
  )
    throw new Error("ALIGNMENT_TIMESTAMPS_MISSING");
  for (let i = 0; i < starts.length; i++)
    if (ends[i] < starts[i] || (i > 0 && starts[i] < starts[i - 1]))
      throw new Error("ALIGNMENT_TIMESTAMPS_INVALID");
  const charIndex: number[] = [];
  alignment.characters.forEach((c, index) => {
    for (let i = 0; i < c.length; i++) charIndex.push(index);
  });
  const cues: Cue[] = [];
  for (const segment of segments) {
    const words = Array.from(segment.text.matchAll(/\S+/g));
    let current: Cue | undefined;
    let count = 0;
    for (const word of words) {
      const start = starts[charIndex[segment.start + word.index!]],
        end = ends[charIndex[segment.start + word.index! + word[0].length - 1]];
      if (!Number.isFinite(start) || !Number.isFinite(end))
        throw new Error("ALIGNMENT_TIMESTAMPS_MISSING");
      if (
        !current ||
        count >= 6 ||
        current.text.length + word[0].length > 42 ||
        end - current.start > 3.6
      ) {
        if (current) cues.push(current);
        current = {
          start,
          end: Math.max(end, start + 0.04),
          text: word[0],
          kind: segment.kind,
          reference: segment.reference,
          edition: segment.edition,
        };
        count = 1;
      } else {
        current.text += " " + word[0];
        current.end = Math.max(end, current.start + 0.04);
        count++;
      }
      if (/[.!?;:]$/.test(word[0]) && current) {
        cues.push(current);
        current = undefined;
        count = 0;
      }
    }
    if (current) cues.push(current);
  }
  return cues;
}
export function validateCues(cues: Cue[], duration: number) {
  let previousEnd = 0;
  for (const cue of cues) {
    cueSchema.parse(cue);
    if (
      cue.start < previousEnd - 0.001 ||
      cue.end <= cue.start ||
      cue.end > duration + 0.15
    )
      throw new Error("CAPTION_TIMING_INVALID");
    previousEnd = cue.end;
  }
}
export function toSrt(cues: Cue[]) {
  const time = (seconds: number) => {
    const n = Math.round(seconds * 1000);
    return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
  };
  return cues
    .map((c, i) => `${i + 1}\n${time(c.start)} --> ${time(c.end)}\n${c.text}\n`)
    .join("\n");
}
export const compositionSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  title: z.string(),
  scriptChecksum: z.string(),
  voiceChecksum: z.string(),
  captionChecksum: z.string(),
  duration: z.number().positive().max(305),
  fps: z.literal(30),
  cues: z.array(cueSchema).min(1),
  audioUrl: z.string(),
  background: z.enum(["forest", "dusk", "sand"]),
  ambience: z.enum(["none", "soft-noise"]),
  ambienceVolume: z.number().min(0).max(0.15),
  narrationVolume: z.number().min(0).max(1),
  mode: z.enum(["narrated", "text"]).optional(),
  readingWpm: z.number().min(70).max(180).optional(),
  image: z
    .object({
      id: z.string().uuid(),
      url: z.string(),
      checksum: z.string(),
      name: z.string(),
      provenance: z.string(),
      mime: z.string().optional(),
      width: z.number().positive().nullable().optional(),
      height: z.number().positive().nullable().optional(),
    })
    .nullable()
    .optional(),
  imageDim: z.number().min(0.2).max(0.85).optional(),
  imagePosition: z.number().min(0).max(100).optional(),
  music: z
    .object({
      id: z.string().uuid(),
      url: z.string(),
      checksum: z.string(),
      name: z.string(),
      provenance: z.string(),
      duration: z.number().positive(),
    })
    .nullable()
    .optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  musicLoop: z.boolean().optional(),
  musicFade: z.number().min(0).max(10).optional(),
  draft: z.boolean(),
  attribution: z.string(),
});
export type CompositionData = z.infer<typeof compositionSchema>;

/** Reading cards use canonical visible text, without narration's spoken citation prefix. */
export function readingCues(
  blocks: ScriptBlock[],
  wordsPerMinute: number,
): Cue[] {
  z.number().min(70).max(180).parse(wordsPerMinute);
  const cues: Cue[] = [];
  let time = 0.5;
  for (const block of blocks) {
    const words = block.text.trim().split(/\s+/);
    let phrase: string[] = [];
    const flush = () => {
      if (!phrase.length) return;
      const duration = Math.max(2.5, (phrase.length * 60) / wordsPerMinute);
      cues.push({
        start: time,
        end: time + duration,
        text: phrase.join(" "),
        kind: block.kind,
        ...(block.kind === "quote"
          ? { reference: block.reference, edition: block.edition }
          : {}),
      });
      time += duration;
      phrase = [];
    };
    for (const word of words) {
      if (phrase.length >= 10 || phrase.join(" ").length + word.length > 68)
        flush();
      phrase.push(word);
      if (/[.!?;]$/.test(word)) flush();
    }
    flush();
  }
  if (!cues.length || time + 0.6 > 305)
    throw new Error("TEXT_DURATION_TOO_LONG");
  return cues;
}
/** Keep summed linear gains below full scale, including at maximum sliders. */
export function mixGains(narration: number, music: number) {
  const scale = Math.max(1, (narration + music) / 0.95);
  return { narration: narration / scale, music: music / scale };
}
export function musicEnvelope(
  frame: number,
  fps: number,
  end: number,
  fade: number,
) {
  const t = frame / fps;
  if (t >= end) return 0;
  if (!fade) return 1;
  const seconds = Math.min(fade, end / 2);
  return Math.max(0, Math.min(1, t / seconds, (end - t) / seconds));
}
