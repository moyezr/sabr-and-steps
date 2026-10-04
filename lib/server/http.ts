import "server-only";

export { mutationAllowed } from "@/lib/domain/request-origin";

export async function readJson(
  request: Request,
  maxLength = 24000,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("INVALID_BODY");
  const raw = await request.text();
  if (raw.length > maxLength) throw new Error("INVALID_BODY");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("INVALID_BODY");
  }
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
