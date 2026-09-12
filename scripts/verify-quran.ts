import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "../lib/server/db/client";
import { sourcePassages } from "../lib/server/db/schema";
import { listSourceImports } from "../lib/server/db/sources";
import { QuranClient, QuranError } from "../lib/server/providers/quran";
import { canonicalText } from "../lib/domain/source";
import { digest } from "../lib/server/sources/importer";
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  try {
    const client = new QuranClient();
    const latest = (await listSourceImports()).find(
      (r) =>
        r.status === "completed" &&
        r.environment === client.environment &&
        r.resourceId === 85,
    );
    assert(latest, "Import resource 85 first.");
    const saved = await getDb()
      .select()
      .from(sourcePassages)
      .where(eq(sourcePassages.importId, latest.id));
    for (const ref of ["1:1", "1:7", "2:153", "2:155", "2:286"]) {
      const [chapter, verse] = ref.split(":").map(Number);
      const page = await client.page(85, chapter, Math.ceil(verse / 50));
      const original = page.verses.find((v) => v.verse_key === ref);
      const stored = saved.find((v) => v.reference === ref);
      assert(original && stored, `Missing ${ref}`);
      const translation = original.translations.find(
        (t) => t.resource_id === 85,
      );
      assert(translation);
      assert.equal(stored.text, canonicalText(translation.text));
      assert.equal(stored.arabic, original.text_uthmani);
      assert.equal(digest(stored.raw), digest(original));
      console.log(
        `${ref}: translation, Arabic, reference and provider payload match fresh authenticated source.`,
      );
    }
    console.log(
      `Verified ${latest.id}; ${saved.length} stored verses. No quotation text or credentials logged.`,
    );
  } catch (error) {
    console.error(
      error instanceof QuranError ? error.code : "SOURCE_COMPARISON_FAILED",
    );
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}
void main();
