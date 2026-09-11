export function mutationAllowed(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const source = new URL(origin);
    // Next may normalize request.url to localhost; Host retains the browser authority.
    return (
      ["http:", "https:"].includes(source.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(source.hostname) &&
      source.host === host.toLowerCase()
    );
  } catch {
    return false;
  }
}
