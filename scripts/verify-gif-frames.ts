import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { compositionSchema } from "../lib/domain/media";
async function main() {
  const root = path.resolve(".data/render-fixture");
  const serveUrl = await bundle({
    entryPoint: path.resolve("video/root.tsx"),
    publicDir: root,
    outDir: path.resolve(".data/gif-check-bundle"),
  });
  const data = compositionSchema.parse({
    version: 2,
    title: "GIF timing test",
    scriptChecksum: "fixture",
    voiceChecksum: "",
    captionChecksum: "fixture",
    duration: 5,
    fps: 30,
    cues: [
      {
        start: 0,
        end: 5,
        text: "Synthetic animation check",
        kind: "reflection",
      },
    ],
    audioUrl: "",
    background: "forest",
    ambience: "none",
    ambienceVolume: 0,
    narrationVolume: 0,
    mode: "text",
    image: {
      id: "00000000-0000-4000-8000-000000000000",
      url: "/public/background.gif",
      checksum: "fixture",
      name: "Fixture",
      provenance: "Synthetic test pattern",
      mime: "image/gif",
      width: 320,
      height: 180,
    },
    imageDim: 0.45,
    imagePosition: 65,
    draft: true,
    attribution: "Fixture",
  });
  for (const id of ["Landscape", "Vertical"]) {
    const inputProps = { data };
    const composition = await selectComposition({ serveUrl, id, inputProps });
    const hashes: string[] = [];
    for (const frame of [30, 90, 45]) {
      const output = path.join(root, `gif-${id}-${frame}.png`);
      await renderStill({ serveUrl, composition, inputProps, output, frame });
      hashes.push(
        createHash("sha256")
          .update(new Uint8Array(await readFile(output)))
          .digest("hex"),
      );
    }
    assert.equal(
      hashes[0],
      hashes[1],
      "Same GIF time after a loop must produce the same frame",
    );
    assert.notEqual(
      hashes[0],
      hashes[2],
      "GIF must animate rather than freeze at its first frame",
    );
    console.log(id, "GIF animation and deterministic loop verified");
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
