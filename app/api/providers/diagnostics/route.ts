import { mutationAllowed } from "@/lib/server/http";
import { cartesiaStatus } from "@/lib/server/providers/cartesia-status";
import { deepgramStatus } from "@/lib/server/providers/deepgram-status";
export async function POST(request: Request) {
  if (!mutationAllowed(request))
    return Response.json(
      { error: "Request origin not allowed." },
      { status: 403 },
    );
  try {
    const diagnostics = await Promise.all([cartesiaStatus(), deepgramStatus()]);
    return Response.json(
      { diagnostics },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Provider access could not be checked. Try again later." },
      { status: 503 },
    );
  }
}
