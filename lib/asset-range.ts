/** One bounded byte range, including browser suffix probes. Null means HTTP 416. */
export function assetRange(header: string | null | undefined, size: number) {
  if (!Number.isSafeInteger(size) || size < 1) return null;
  if (!header) return { start: 0, end: size - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const a = Number(match[1]),
    b = Number(match[2]);
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  const start = match[1] ? a : Math.max(0, size - b);
  const end = match[1] && match[2] ? Math.min(b, size - 1) : size - 1;
  if ((!match[1] && !b) || start > end || start >= size) return null;
  return { start, end, status: 206 };
}
