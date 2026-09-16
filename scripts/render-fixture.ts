import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
async function main() {
  const root = path.resolve(".data/render-fixture");
  await mkdir(root, { recursive: true });
  await exec("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=5",
    "-af",
    "volume=0.03,afade=t=in:d=0.2,afade=t=out:st=4.7:d=0.3",
    path.join(root, "fixture.mp3"),
  ]);
  const serveUrl = await bundle({
    entryPoint: path.resolve("video/root.tsx"),
    publicDir: root,
    outDir: path.resolve(".data/render-fixture-bundle"),
  });
  // This tone is a renderer fixture, not narration or evidence of a completed pilot.
  const data = {
    version: 1 as const,
    title: "Renderer fixture",
    scriptChecksum: "fixture",
    voiceChecksum: "fixture",
    captionChecksum: "fixture",
    duration: 5,
    fps: 30 as const,
    cues: [
      {
        start: 0,
        end: 2.5,
        text: "A small step toward a calmer day.",
        kind: "reflection" as const,
      },
      {
        start: 2.5,
        end: 5,
        text: "Synthetic quotation fixture for layout.",
        kind: "quote" as const,
        reference: "1:1",
        edition: "Synthetic fixture — not a source",
      },
    ],
    audioUrl: "/public/fixture.mp3",
    background: "forest" as const,
    ambience: "none" as const,
    ambienceVolume: 0,
    narrationVolume: 1,
    draft: true,
    attribution: "SYNTHETIC RENDER TEST · Tone only",
  };
  const inputProps = { data };
  for (const id of ["Landscape", "Vertical"]) {
    const composition = await selectComposition({ serveUrl, id, inputProps });
    const outputLocation = path.join(root, `${id}.mp4`);
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      outputLocation,
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      concurrency: 2,
    });
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      output: path.join(root, `${id}.png`),
      frame: 95,
    });
    const { stdout } = await exec("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      outputLocation,
    ]);
    const info = JSON.parse(stdout);
    const video = info.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    assert.equal(video.width, id === "Landscape" ? 1920 : 1080);
    assert.equal(video.height, id === "Landscape" ? 1080 : 1920);
    assert(
      info.streams.some(
        (s: { codec_type: string }) => s.codec_type === "audio",
      ),
    );
    assert(Math.abs(Number(info.format.duration) - 5) < 0.1);
    await writeFile(path.join(root, `${id}-probe.json`), stdout);
    console.log(id, "verified");
  }
  const composition = await selectComposition({
    serveUrl,
    id: "Landscape",
    inputProps,
  });
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    output: path.join(root, "Landscape-repeat.png"),
    frame: 95,
  });
  const hash = async (f: string) =>
    createHash("sha256")
      .update(new Uint8Array(await readFile(path.join(root, f))))
      .digest("hex");
  assert.equal(await hash("Landscape.png"), await hash("Landscape-repeat.png"));
  console.log("Repeated frame is byte-identical");
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
