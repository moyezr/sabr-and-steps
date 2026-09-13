import "server-only";
import path from "node:path";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
export function dataPath(relative: string) {
  const root = path.resolve(/* turbopackIgnore: true */ process.env.APP_DATA_DIR || ".data");
  const target = path.resolve(/* turbopackIgnore: true */ root, relative);
  if (!target.startsWith(root + path.sep))
    throw new Error("ASSET_PATH_INVALID");
  return target;
}
export async function readArtifact(relative: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ dataPath(relative), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("ARTIFACT_CORRUPT");
  }
}
export async function writeArtifact(relative: string, value: unknown) {
  const file = dataPath(relative);
  await mkdir(/* turbopackIgnore: true */ path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(/* turbopackIgnore: true */ file + ".tmp", JSON.stringify(value), { mode: 0o600 });
  await rename(/* turbopackIgnore: true */ file + ".tmp", file);
}
