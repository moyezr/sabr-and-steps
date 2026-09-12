import "server-only";

export { mutationAllowed } from "@/lib/domain/request-origin";

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("INVALID_BODY");
  const raw = await request.text();
  if (raw.length > 24000) throw new Error("INVALID_BODY");
  return JSON.parse(raw);
}

export function unavailableResponse() {
  return Response.json(
    {
      error:
        "The local database is unavailable. Your text is still here; start the database and try again.",
    },
    { status: 503 },
  );
}
