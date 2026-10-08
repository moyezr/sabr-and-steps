import "server-only";
export class DiagnosticHttpError extends Error {
  constructor(readonly status: number | null) {
    super("PROVIDER_STATUS_UNAVAILABLE");
  }
}
export async function readDiagnosticJson(
  url: string,
  headers: Record<string, string>,
  request: typeof fetch,
) {
  const origin = new URL(url).origin;
  if (!["https://api.deepgram.com", "https://api.cartesia.ai"].includes(origin))
    throw new DiagnosticHttpError(null);
  let response: Response;
  try {
    response = await request(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new DiagnosticHttpError(null);
  }
  if (!response.ok) throw new DiagnosticHttpError(response.status);
  try {
    const raw = await response.text();
    if (raw.length > 1000000) throw new Error("OVERSIZED");
    return JSON.parse(raw) as unknown;
  } catch {
    throw new DiagnosticHttpError(null);
  }
}
export function deniedDiagnostic(error: unknown) {
  return (
    error instanceof DiagnosticHttpError &&
    [401, 403].includes(error.status ?? 0)
  );
}
