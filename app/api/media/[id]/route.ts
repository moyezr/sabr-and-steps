import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { voiceTakes } from "@/lib/server/db/schema";
import { serveAsset } from "@/lib/server/media/serve";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });
  try {
    const take = (
      await getDb().select().from(voiceTakes).where(eq(voiceTakes.id, id))
    )[0];
    if (!take) return new Response("Not found", { status: 404 });
    return await serveAsset(request, take.audioPath, "audio/mpeg");
  } catch {
    return new Response("Media unavailable", { status: 503 });
  }
}
