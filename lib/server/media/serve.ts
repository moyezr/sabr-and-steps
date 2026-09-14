import "server-only";
import { open, stat } from "node:fs/promises";
import { dataPath } from "../jobs/files";
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
  let start = 0,
    end = info.size - 1,
    status = 200;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), end) : end;
    if (start > end || start >= info.size)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  const handle = await open(/* turbopackIgnore: true */ file, "r");
  let position = start;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (position > end) {
          await handle.close();
          controller.close();
          return;
        }
        const buffer = new Uint8Array(Math.min(65536, end - position + 1));
        const { bytesRead } = await handle.read(
          buffer,
          0,
          buffer.length,
          position,
        );
        if (!bytesRead) {
          await handle.close();
          controller.close();
          return;
        }
        position += bytesRead;
        controller.enqueue(buffer.subarray(0, bytesRead));
      } catch (e) {
        await handle.close();
        controller.error(e);
      }
    },
    async cancel() {
      await handle.close();
    },
  });
  return new Response(stream, { status, headers });
}
