import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { QuranError } from "../../lib/server/providers/quran";
nextEnv.loadEnvConfig(process.cwd());

test("source imports recover chapters, prevent concurrent claims, deduplicate refreshes and retain old versions", async () => {
  assert(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `sabr_source_test_${randomUUID().replaceAll("-", "")}`;
  const directory = await mkdtemp(path.join(tmpdir(), "sabr-sources-"));
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool } = await import("../../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const { importQuran } = await import("../../lib/server/sources/importer");
    const { browseSources } = await import("../../lib/server/db/sources");
    let fail = true,
      changed = false;
    const fetched: number[] = [];
    const client = {
      environment: "prelive" as const,
      resources: async () => [
        {
          id: 85,
          name: "Synthetic test edition",
          author_name: "Test author",
          language_name: "english",
        },
      ],
      chapters: async () =>
        [1, 2].map((id) => ({
          id,
          name_simple: `Fixture ${id}`,
          verses_count: 3,
        })),
      get: async () => ({ info: { id: 85, info: "Synthetic metadata" } }),
      page: async (_resource: number, chapter: number) => {
        fetched.push(chapter);
        if (chapter === 2 && fail) throw new QuranError("QF_HTTP_503");
        return {
          verses: [1, 2, 3].map((n) => ({
            verse_key: `${chapter}:${n}`,
            verse_number: n,
            text_uthmani: "اختبار",
            translations: [
              {
                resource_id: 85,
                text: `Synthetic fixture ${chapter}:${n}${changed ? " changed" : ""}. Not scripture.`,
              },
            ],
          })),
          pagination: {
            current_page: 1,
            next_page: null,
            total_pages: 1,
            total_records: 3,
          },
        };
      },
    };
    await assert.rejects(
      importQuran(85, { client, dataDir: directory }),
      /QF_HTTP_503/,
    );
    assert.equal(
      (await pool.query("SELECT status FROM source_imports")).rows[0].status,
      "failed",
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM source_passages")).rows[0]
        .n,
      3,
    );
    fail = false;
    fetched.length = 0;
    const resumed = await importQuran(85, { client, dataDir: directory });
    assert.deepEqual(fetched, [2]);
    const context = await browseSources(resumed.id, {
      reference: "2:2",
      page: 1,
    });
    assert.equal(context.rows.length, 3);
    assert(context.referenceFound);
    assert.equal(
      (await browseSources(resumed.id, { reference: "94:5", page: 1 }))
        .referenceFound,
      false,
    );
    assert.equal(
      (await browseSources(resumed.id, { q: "%", page: 1 })).total,
      0,
    );
    const cached = await importQuran(85, { client, dataDir: directory });
    assert.equal(cached.id, resumed.id);
    assert(cached.cached);
    const refreshed = await importQuran(85, {
      client,
      dataDir: directory,
      refresh: true,
    });
    assert.equal(refreshed.id, resumed.id);
    assert(refreshed.cached);
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM source_passages")).rows[0]
        .n,
      6,
    );
    changed = true;
    const revision = await importQuran(85, {
      client,
      dataDir: directory,
      refresh: true,
    });
    assert.notEqual(revision.id, resumed.id);
    assert(
      !(
        await browseSources(resumed.id, { reference: "1:1", page: 1 })
      ).rows[0].text.includes("changed"),
    );
    const locker = await pool.connect();
    try {
      await locker.query("SELECT pg_advisory_lock(85002,85)");
      await assert.rejects(
        importQuran(85, { client, dataDir: directory }),
        /SOURCE_IMPORT_ALREADY_RUNNING/,
      );
    } finally {
      await locker.query("SELECT pg_advisory_unlock(85002,85)");
      locker.release();
    }
    await assert.rejects(
      pool.query(
        "UPDATE source_passages SET reference='94:1' WHERE import_id=$1",
        [resumed.id],
      ),
      (e: unknown) => (e as { code: string }).code === "23514",
    );
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
