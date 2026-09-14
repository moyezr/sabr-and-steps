/** Awaited by the durable worker. Remotion needs normal React, outside react-server conditions. */
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { z } from "zod";
import { compositionSchema } from "../lib/domain/media";
async function main() {
  const request = z
    .object({
      data: compositionSchema,
      assets: z.array(
        z.object({ url: z.string(), path: z.string(), mime: z.string() }),
      ),
      outputDirectory: z.string(),
      bundleDirectory: z.string(),
    })
    .parse(JSON.parse(await readFile(process.argv[2], "utf8")));
  const assets = new Map(
    await Promise.all(
      request.assets.map(
        async (a) => [a.url, { ...a, bytes: await readFile(a.path) }] as const,
      ),
    ),
  );
  const server = createServer((req, res) => {
    const asset = assets.get(req.url || "");
    if (!asset) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", asset.mime);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Length", asset.bytes.length);
    res.end(asset.bytes);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("ASSET_SERVER_FAILED");
    await mkdir(request.outputDirectory, { recursive: true, mode: 0o700 });
    const serveUrl = await bundle({
      entryPoint: path.resolve("video/root.tsx"),
      outDir: request.bundleDirectory,
      publicDir: null,
    });
    const inputProps = {
      data: request.data,
      assetBaseUrl: `http://127.0.0.1:${address.port}`,
    };
    for (const id of ["Landscape", "Vertical"]) {
      const composition = await selectComposition({ serveUrl, id, inputProps });
      let last = 0;
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        crf: 20,
        concurrency: 2,
        inputProps,
        outputLocation: path.join(
          request.outputDirectory,
          `${id.toLowerCase()}.mp4`,
        ),
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 10) * 10;
          if (pct > last) {
            last = pct;
            process.stdout.write(`${id}: ${pct}%\n`);
          }
        },
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}
void main().catch(() => {
  console.error("RENDER_PROCESS_FAILED");
  process.exitCode = 1;
});
