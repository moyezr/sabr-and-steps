import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { mediaAssets } from "../db/schema";
import { dataPath } from "../jobs/files";
const exec = promisify(execFile);
export const MAX_ASSET_BYTES = 30 * 1024 * 1024;
export async function listAssets() {
  const assets = await getDb()
    .select()
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt));
  return assets.map(({ id, kind, name, duration, provenance, mime }) => ({
    id,
    kind,
    mime,
    name,
    duration,
    provenance,
    url: `/api/assets/${id}`,
  }));
}
export async function findAsset(id: string) {
  z.string().uuid().parse(id);
  const asset = (
    await getDb().select().from(mediaAssets).where(eq(mediaAssets.id, id))
  )[0];
  if (!asset) throw new Error("ASSET_NOT_FOUND");
  return asset;
}
export async function checkedAsset(id: string, kind: "image" | "audio") {
  const a = await findAsset(id);
  if (a.kind !== kind) throw new Error("ASSET_KIND_MISMATCH");
  const bytes = await readFile(/* turbopackIgnore: true */ dataPath(a.path));
  if (
    createHash("sha256").update(new Uint8Array(bytes)).digest("hex") !==
    a.checksum
  )
    throw new Error("ASSET_CHECKSUM_MISMATCH");
  return a;
}
/** Inspect bounded local uploads; filenames and MIME headers are never trusted. No external URLs. */
export async function importAsset(bytes: Uint8Array, metadata: unknown) {
  const input = z
    .object({
      name: z.string().trim().min(1).max(100),
      kind: z.enum(["image", "audio"]),
      provenance: z.string().trim().min(1).max(1000),
    })
    .parse(metadata);
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES)
    throw new Error("ASSET_SIZE_LIMIT_30_MB");
  const id = randomUUID();
  const relative = `assets/${id}/original`;
  const file = dataPath(relative);
  await mkdir(/* turbopackIgnore: true */ path.dirname(file), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(/* turbopackIgnore: true */ file, bytes, { mode: 0o600 });
  try {
    const isGif = ["GIF87a", "GIF89a"].includes(
      Buffer.from(bytes.slice(0, 6)).toString("ascii"),
    );
    const { stdout } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        ...(isGif ? ["-count_frames"] : []),
        "-of",
        "json",
        file,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    const info = JSON.parse(stdout);
    let mime: string;
    let duration: number | null = null;
    let width: number | null = null,
      height: number | null = null;
    if (input.kind === "image") {
      const hex = Buffer.from(bytes.slice(0, 12)).toString("hex");
      mime = isGif
        ? "image/gif"
        : hex.startsWith("89504e470d0a1a0a")
          ? "image/png"
          : hex.startsWith("ffd8ff")
            ? "image/jpeg"
            : hex.startsWith("52494646") && hex.endsWith("57454250")
              ? "image/webp"
              : "";
      const stream = info.streams[0];
      if (isGif) {
        duration = Number(info.format.duration);
        const count = Number(stream?.nb_read_frames);
        if (
          !Number.isFinite(duration) ||
          duration > 30 ||
          !Number.isFinite(count) ||
          count > 300 ||
          count * stream.width * stream.height > 100000000
        )
          throw new Error("GIF_TOO_LARGE_USE_A_SHORTER_OR_SMALLER_GIF");
      }
      if (
        !mime ||
        !stream ||
        stream.codec_type !== "video" ||
        info.streams.length !== 1 ||
        stream.width < 100 ||
        stream.height < 100 ||
        stream.width * stream.height > 40000000 ||
        Math.max(stream.width, stream.height) > 8192 ||
        (!isGif && Number(stream.nb_frames || 1) > 1)
      )
        throw new Error("USE_JPEG_PNG_WEBP_OR_GIF_UP_TO_8192_PX");
      width = stream.width;
      height = stream.height;
    } else {
      const formats: Record<string, string> = {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        "mov,mp4,m4a,3gp,3g2,mj2": "audio/mp4",
      };
      mime = formats[info.format.format_name];
      duration = Number(info.format.duration);
      if (
        !mime ||
        info.streams.filter(
          (s: { codec_type: string }) => s.codec_type === "audio",
        ).length !== 1 ||
        info.streams.some(
          (s: {
            codec_type: string;
            disposition?: { attached_pic?: number };
          }) => s.codec_type !== "audio" && !s.disposition?.attached_pic,
        ) ||
        !Number.isFinite(duration) ||
        duration < 1 ||
        duration > 1200
      )
        throw new Error("USE_MP3_WAV_OR_M4A_UP_TO_20_MINUTES");
    }
    const asset = (
      await getDb()
        .insert(mediaAssets)
        .values({
          id,
          ...input,
          path: relative,
          mime,
          duration,
          width,
          height,
          checksum: createHash("sha256").update(bytes).digest("hex"),
        })
        .returning()
    )[0];
    return {
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      url: `/api/assets/${asset.id}`,
    };
  } catch (e) {
    await unlink(/* turbopackIgnore: true */ file);
    throw e;
  }
}
