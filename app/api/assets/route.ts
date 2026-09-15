import { mutationAllowed } from "@/lib/server/http";
import { importAsset, MAX_ASSET_BYTES } from "@/lib/server/media/assets";
export async function POST(request: Request) {
  if (!mutationAllowed(request))
    return Response.json(
      { error: "Request origin not allowed" },
      { status: 403 },
    );
  try {
    // Bound the stream before parsing multipart, including clients without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("UPLOAD_EMPTY");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_ASSET_BYTES + 16384) {
        await reader.cancel();
        throw new Error("ASSET_SIZE_LIMIT_30_MB");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("UPLOAD_EMPTY");
    const result = await importAsset(new Uint8Array(await file.arrayBuffer()), {
      name: form.get("name") || file.name,
      kind: form.get("kind"),
      provenance:
        form.get("provenance") ||
        "Creator upload · source and reuse rights not reviewed.",
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error && /^[A-Z0-9_]+$/.test(e.message)
            ? e.message
            : "UPLOAD_INVALID_OR_UNAVAILABLE",
      },
      { status: 422 },
    );
  }
}
