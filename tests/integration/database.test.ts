import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

nextEnv.loadEnvConfig(process.cwd());

test("fresh database migration, pgvector, persistence, constraints, and revision conflicts", async () => {
  assert(
    process.env.DATABASE_URL,
    "Run pnpm db:configure and pnpm db:up first.",
  );
  const admin = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  });
  const database = `sabr_test_${randomUUID().replaceAll("-", "")}`;
  let applicationPool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const { getPool } = await import("../../lib/server/db/client");
    applicationPool = getPool();
    const db = drizzle(applicationPool);
    await migrate(db, { migrationsFolder: "drizzle" });
    await migrate(db, { migrationsFolder: "drizzle" });
    const extension = await applicationPool.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    );
    assert.equal(extension.rowCount, 1);
    const { createEpisode, findEpisode, updateEpisode } = await import(
      "../../lib/server/db/episodes"
    );
    const { EMPTY_EPISODE } = await import("../../lib/domain/episode");
    const input = { ...EMPTY_EPISODE, title: "A persistent intention" };
    const created = await createEpisode(input);
    assert.equal(created.revision, 1);
    assert.equal((await findEpisode(created.id))?.title, input.title);
    const results = await Promise.all([
      updateEpisode(
        created.id,
        { ...input, title: "First concurrent edit" },
        1,
      ),
      updateEpisode(
        created.id,
        { ...input, title: "Second concurrent edit" },
        1,
      ),
    ]);
    assert.equal(
      results.filter(Boolean).length,
      1,
      "Only one revision-matched update can win.",
    );
    const reader = new Pool({ connectionString: url.toString() });
    try {
      assert.equal(
        (
          await reader.query("SELECT revision FROM episodes WHERE id = $1", [
            created.id,
          ])
        ).rows[0].revision,
        2,
      );
    } finally {
      await reader.end();
    }
    await assert.rejects(
      applicationPool.query(
        "UPDATE episodes SET target_seconds = 301 WHERE id = $1",
        [created.id],
      ),
      (error: unknown) => (error as { code?: string }).code === "23514",
    );
    await assert.rejects(
      applicationPool.query(
        "UPDATE episodes SET llm_model = 'unapproved' WHERE id = $1",
        [created.id],
      ),
      (error: unknown) => (error as { code?: string }).code === "23514",
    );
  } finally {
    await applicationPool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
