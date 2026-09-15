import { findAsset } from "@/lib/server/media/assets";
import { serveAsset } from "@/lib/server/media/serve";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await findAsset((await params).id);
    return await serveAsset(request, a.path, a.mime);
  } catch {
    return new Response("Asset unavailable", { status: 404 });
  }
}
