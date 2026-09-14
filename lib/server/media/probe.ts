import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export async function probeMedia(file: string) {
  const { stdout } = await exec(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    { maxBuffer: 1024 * 1024 },
  );
  const result = JSON.parse(stdout) as {
    format: { duration: string };
    streams: {
      codec_type: string;
      width?: number;
      height?: number;
      codec_name: string;
      sample_rate?: string;
    }[];
  };
  const duration = Number(result.format.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("MEDIA_DURATION_INVALID");
  return { ...result, duration };
}
