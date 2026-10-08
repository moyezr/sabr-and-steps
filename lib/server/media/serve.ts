import "server-only";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { dataPath } from "../jobs/files";
import { assetRange } from "../../asset-range";
export async function serveAsset(
  request: Request,
  relative: string,
  type: string,
  filename?: string,
) {
  const file = dataPath(relative);
  const info = await stat(/* turbopackIgnore: true */ file);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (filename)
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  const range = assetRange(request.headers.get("range"), info.size);
  if (!range)
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${info.size}` },
    });
  const { start, end, status } = range;
  if (status === 206) {
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  if (request.method === "HEAD") return new Response(null, { status, headers });
  // Node owns descriptor lifetime on completion, cancellation and read failures.
  const fileStream = createReadStream(/* turbopackIgnore: true */ file, {
    start,
    end,
  });
  const stream = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}
