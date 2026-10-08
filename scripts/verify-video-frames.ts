/** Run with normal React; the durable request already contains only verified local assets. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { selectComposition, renderStill } from "@remotion/renderer";
import { assetRange } from "../lib/asset-range";

async function main() {
  const fixture = JSON.parse(await readFile(process.argv[2], "utf8"));
  const request = JSON.parse(await readFile(fixture.requestPath, "utf8"));
  const assets = new Map<string, { bytes: Uint8Array; mime: string }>();
  for (const asset of request.assets)
    assets.set(asset.url, {
      bytes: new Uint8Array(await readFile(asset.path)),
      mime: asset.mime,
    });
  const server = createServer((req, res) => {
    const asset = assets.get(req.url || "");
    if (!asset) return void res.writeHead(404).end();
    const range = assetRange(req.headers.range, asset.bytes.length);
    if (!range) return void res.writeHead(416).end();
    res.writeHead(range.status, {
      "Content-Type": asset.mime,
      "Access-Control-Allow-Origin": "*",
      "Content-Length": range.end - range.start + 1,
      ...(range.status === 206
        ? {
            "Content-Range": `bytes ${range.start}-${range.end}/${asset.bytes.length}`,
          }
        : {}),
    });
    res.end(asset.bytes.subarray(range.start, range.end + 1));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const props = {
      data: request.data,
      assetBaseUrl: `http://127.0.0.1:${address.port}`,
    };
    for (const id of ["Landscape", "Vertical"]) {
      const composition = await selectComposition({
        serveUrl: request.bundleDirectory,
        id,
        inputProps: props,
      });
      const frames = [20, 50, 21, 70, 100];
      const files: string[] = [];
      for (const frame of frames) {
        const file = path.join(
          fixture.root,
          `${id.toLowerCase()}-frame-${frame}.png`,
        );
        await renderStill({
          serveUrl: request.bundleDirectory,
          composition,
          frame,
          inputProps: props,
          output: file,
          imageFormat: "png",
        });
        files.push(file);
      }
      assert.deepEqual(
        new Uint8Array(await readFile(files[0])),
        new Uint8Array(await readFile(files[1])),
        `${id}: global clip loop differs`,
      );
      assert.notDeepEqual(
        new Uint8Array(await readFile(files[0])),
        new Uint8Array(await readFile(files[2])),
        `${id}: video did not move`,
      );
      assert.deepEqual(
        new Uint8Array(await readFile(files[3])),
        new Uint8Array(await readFile(files[4])),
        `${id}: scene clip loop differs`,
      );
      // Move the scene to frame zero: source frame four must equal frame 70 in
      // the original timeline, whose scene begins at frame 66. Compare a
      // background corner outside text/fade overlays.
      const originData = {
        ...request.data,
        cues: [{ ...request.data.cues[1], start: 0, end: 1.8 }],
        sceneImages: request.data.sceneImages.map(
          (s: { cueIndex: number }) => ({ ...s, cueIndex: 0 }),
        ),
        editorSettings: {
          ...request.data.editorSettings,
          sceneOverrides: request.data.editorSettings.sceneOverrides.map(
            (s: { cueIndex: number }) => ({ ...s, cueIndex: 0 }),
          ),
        },
      };
      const originFile = path.join(
        fixture.root,
        `${id.toLowerCase()}-scene-origin.png`,
      );
      const originProps = { ...props, data: originData };
      const originComposition = await selectComposition({
        serveUrl: request.bundleDirectory,
        id,
        inputProps: originProps,
      });
      await renderStill({
        serveUrl: request.bundleDirectory,
        composition: originComposition,
        frame: 4,
        inputProps: originProps,
        output: originFile,
        imageFormat: "png",
      });
      const crop = async (file: string) => {
        const { stdout } = await promisify(execFile)(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            file,
            "-vf",
            "crop=64:64:16:16,format=rgb24",
            "-f",
            "rawvideo",
            "-",
          ],
          { encoding: "buffer" },
        );
        return createHash("sha256")
          .update(new Uint8Array(stdout))
          .digest("hex");
      };
      assert.equal(
        await crop(files[3]),
        await crop(originFile),
        `${id}: scene clip did not restart at its boundary`,
      );
      console.log(
        `${id}: frame-exact global/scene loops, scene-origin reset and changing adjacent frames passed.`,
      );
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
