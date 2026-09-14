import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { voiceTakes, scriptRevisions, videoExports } from "../db/schema";
import { compositionSchema, toSrt } from "../../domain/media";
import { scriptBlockSchema } from "../../domain/script";
import { dataPath, writeArtifact } from "../jobs/files";
import { type Job, progress, heartbeat } from "../jobs/store";
import { validateCurrentComposition } from "./composition";
import { checkedAsset } from "./assets";
import { probeMedia } from "./probe";
export async function renderVideo(job: Job) {
  const { compositionId } = z
    .object({ compositionId: z.string().uuid() })
    .parse(job.input);
  const db = getDb();
  const c = await validateCurrentComposition(compositionId);
  if (job.episodeId !== c.episodeId) throw new Error("EPISODE_MISMATCH");
  const existing = (
    await db.select().from(videoExports).where(eq(videoExports.jobId, job.id))
  )[0];
  if (existing) return { exportId: existing.id };
  const data = compositionSchema.parse(c.data);
  if (!data.draft) throw new Error("PUBLICATION_REVIEW_REQUIRED");
  const take = c.voiceTakeId
    ? (
        await db
          .select()
          .from(voiceTakes)
          .where(eq(voiceTakes.id, c.voiceTakeId))
      )[0]
    : undefined;
  const assets: { url: string; path: string; mime: string }[] = [];
  if (take) {
    const audio = await readFile(dataPath(take.audioPath));
    if (
      createHash("sha256").update(new Uint8Array(audio)).digest("hex") !==
      data.voiceChecksum
    )
      throw new Error("AUDIO_CHECKSUM_MISMATCH");
    assets.push({
      url: data.audioUrl,
      path: dataPath(take.audioPath),
      mime: "audio/mpeg",
    });
  }
  for (const [snapshot, kind] of [
    [data.image, "image"],
    [data.music, "audio"],
  ] as const) {
    if (!snapshot) continue;
    const a = await checkedAsset(snapshot.id, kind);
    if (a.checksum !== snapshot.checksum)
      throw new Error("ASSET_CHECKSUM_MISMATCH");
    assets.push({ url: snapshot.url, path: dataPath(a.path), mime: a.mime });
  }
  const relative = `exports/${c.id}/${job.id}`;
  const directory = dataPath(relative);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await progress(job, "Rendering both formats from the shared composition");
  const attemptDirectory = dataPath(`render-attempts/${job.id}/${job.owner}`);
  const requestPath = `render-attempts/${job.id}/${job.owner}/request.json`;
  await writeArtifact(requestPath, {
    data,
    assets,
    outputDirectory: attemptDirectory,
    bundleDirectory: attemptDirectory + "/bundle",
  });
  try {
    await exec(
      process.execPath,
      [
        "--import",
        "tsx",
        path.resolve("worker/render-child.ts"),
        dataPath(requestPath),
      ],
      { maxBuffer: 2 * 1024 * 1024, timeout: 30 * 60 * 1000 },
    );
  } catch {
    throw new Error("RENDER_PROCESS_FAILED");
  }
  await heartbeat(job);
  const metadata: Record<string, unknown> = {
    compositionChecksum: c.checksum,
    voiceChecksum: data.voiceChecksum,
    imageChecksum: data.image?.checksum,
    musicChecksum: data.music?.checksum,
    mode: data.mode || "narrated",
    captionChecksum: data.captionChecksum,
    remotion: "4.0.524",
    draft: true,
  };
  for (const format of ["Landscape", "Vertical"] as const) {
    const output = path.join(directory, `${format.toLowerCase()}.mp4`);
    const info = await probeMedia(
      path.join(attemptDirectory, `${format.toLowerCase()}.mp4`),
    );
    const video = info.streams.find((s) => s.codec_type === "video");
    const sound = info.streams.find((s) => s.codec_type === "audio");
    if (
      !video ||
      ((Boolean(data.audioUrl) || Boolean(data.music)) && !sound) ||
      video.width !== (format === "Landscape" ? 1920 : 1080) ||
      video.height !== (format === "Landscape" ? 1080 : 1920) ||
      Math.abs(info.duration - data.duration) > 0.2
    )
      throw new Error("EXPORT_VALIDATION_FAILED");
    await rename(
      path.join(attemptDirectory, `${format.toLowerCase()}.mp4`),
      output,
    );
    metadata[format] = {
      ...info,
      sha256: createHash("sha256")
        .update(new Uint8Array(await readFile(output)))
        .digest("hex"),
    };
    await progress(job, `${format} export verified`);
  }
  const script = (
    await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.id, c.scriptId))
  )[0];
  const blocks = z.array(scriptBlockSchema).parse(script.blocks);
  const quotes = blocks.filter((b) => b.kind === "quote");
  const description = [
    script.title,
    "",
    "PRIVATE DRAFT — not cleared for publication. Creator review is pending.",
    "",
    "An original reflection from Sabr & Steps, with a separately attributed Qur’an translation.",
    "",
    ...quotes.map(
      (q) =>
        `Qur’an ${q.reference} — ${q.edition}. https://quran.com/${q.reference.replace(":", "/")} (source version ${q.importId})`,
    ),
    "",
    take
      ? `AI narration: ${take.provider}, ${take.voiceName}, ${take.model}. ${data.attribution}`
      : "Text-only video · No AI narration.",
    ...(data.image
      ? [`Background image: ${data.image.name}. ${data.image.provenance}`]
      : []),
    ...(data.music
      ? [`Background music: ${data.music.name}. ${data.music.provenance}`]
      : []),
    "Translation reuse and speech rights must be cleared before publication.",
    "",
    "Reflection transcript:",
    take?.transcript || blocks.map((b) => b.text).join("\n\n"),
  ].join("\n");
  await writeFile(path.join(directory, "captions.srt"), toSrt(data.cues), {
    mode: 0o600,
  });
  await writeFile(path.join(directory, "description.txt"), description, {
    mode: 0o600,
  });
  await writeArtifact(`${relative}/metadata.json`, metadata);
  await validateCurrentComposition(c.id);
  const output = (
    await db
      .insert(videoExports)
      .values({
        compositionId: c.id,
        jobId: job.id,
        landscapePath: `${relative}/landscape.mp4`,
        verticalPath: `${relative}/vertical.mp4`,
        srtPath: `${relative}/captions.srt`,
        descriptionPath: `${relative}/description.txt`,
        metadata,
      })
      .returning()
  )[0];
  return { exportId: output.id, compositionId: c.id };
}
