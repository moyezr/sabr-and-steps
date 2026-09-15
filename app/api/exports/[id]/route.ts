import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { videoExports } from "@/lib/server/db/schema";
import { serveAsset } from "@/lib/server/media/serve";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const kind = z
    .enum(["landscape", "vertical", "srt", "description"])
    .safeParse(new URL(request.url).searchParams.get("format"));
  if (!z.string().uuid().safeParse(id).success || !kind.success)
    return new Response("Not found", { status: 404 });
  try {
    const output = (
      await getDb().select().from(videoExports).where(eq(videoExports.id, id))
    )[0];
    if (!output) return new Response("Not found", { status: 404 });
    const files = {
      landscape: [
        output.landscapePath,
        "video/mp4",
        "sabr-and-steps-landscape-draft.mp4",
      ],
      vertical: [
        output.verticalPath,
        "video/mp4",
        "sabr-and-steps-vertical-draft.mp4",
      ],
      srt: [output.srtPath, "application/x-subrip", "captions.srt"],
      description: [
        output.descriptionPath,
        "text/plain; charset=utf-8",
        "description.txt",
      ],
    };
    const [file, type, name] = files[kind.data];
    return await serveAsset(
      request,
      file,
      type,
      new URL(request.url).searchParams.has("download") ? name : undefined,
    );
  } catch {
    return new Response("Export unavailable", { status: 503 });
  }
}
