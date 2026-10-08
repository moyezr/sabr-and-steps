import { z } from "zod";

export const VIDEO_UPLOAD_GUIDE =
  "Use an H.264 MP4 up to 30 MB, 2 minutes, 1920 pixels and 60 fps.";
const videoProbeSchema = z.object({
  format: z.object({ format_name: z.string() }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      pix_fmt: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      duration: z.coerce.number().optional(),
      avg_frame_rate: z.string().optional(),
      disposition: z.object({ attached_pic: z.number().optional() }).optional(),
      tags: z.object({ rotate: z.string().optional() }).optional(),
      side_data_list: z
        .array(z.object({ rotation: z.number().optional() }))
        .optional(),
    }),
  ),
});

/** Content inspection, independent of filename, declared MIME and silent audio tracks. */
export function inspectVideoUpload(bytes: Uint8Array, probe: unknown) {
  const info = videoProbeSchema.parse(probe);
  const streams = info.streams.filter((s) => s.codec_type === "video");
  const v = streams[0];
  const [n, d] = (v?.avg_frame_rate || "0/1").split("/").map(Number);
  const fps = n / d;
  const rotation =
    v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ??
    Number(v?.tags?.rotate || 0);
  const header = new TextDecoder("ascii").decode(bytes.slice(4, 12));
  if (
    header.slice(0, 4) !== "ftyp" ||
    header.slice(4).startsWith("qt") ||
    info.format.format_name !== "mov,mp4,m4a,3gp,3g2,mj2" ||
    streams.length !== 1 ||
    !v ||
    v.disposition?.attached_pic ||
    v.codec_name !== "h264" ||
    !["yuv420p", "yuvj420p"].includes(v.pix_fmt || "") ||
    info.streams.some((s) => !["video", "audio"].includes(s.codec_type)) ||
    info.streams.filter((s) => s.codec_type === "audio").length > 1 ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    fps > 60.01 ||
    !Number.isFinite(v.duration) ||
    v.duration! < 1 / 30 ||
    v.duration! > 120 ||
    !v.width ||
    !v.height ||
    Math.min(v.width, v.height) < 100 ||
    Math.max(v.width, v.height) > 1920 ||
    v.width * v.height > 2073600 ||
    !Number.isFinite(rotation) ||
    rotation % 90 !== 0
  )
    throw new Error("USE_H264_MP4_UP_TO_2_MIN_1920_PX_60_FPS");
  return {
    mime: "video/mp4",
    duration: v.duration!,
    width: Math.abs(rotation % 180) === 90 ? v.height : v.width,
    height: Math.abs(rotation % 180) === 90 ? v.width : v.height,
  };
}

/** Use composition fps rather than source fps; avoid seeking past the last source frame. */
export function backgroundLoopFrames(duration: number, fps: number) {
  return Math.max(1, Math.floor(duration * fps + 0.000001));
}
