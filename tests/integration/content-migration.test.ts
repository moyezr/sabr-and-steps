import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
nextEnv.loadEnvConfig(process.cwd());
test("content validity migration preserves older episode and immutable script revisions", async () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `sabr_content_${randomUUID().replaceAll("-", "")}`;
  const directory = await mkdtemp(path.join(os.tmpdir(), "sabr-content-"));
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${name}`;
    pool = new Pool({ connectionString: url.toString() });
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    );
    const old = {
      ...journal,
      entries: journal.entries.filter((e: { idx: number }) => e.idx <= 10),
    };
    await mkdir(path.join(directory, "meta"));
    await writeFile(
      path.join(directory, "meta/_journal.json"),
      JSON.stringify(old),
    );
    for (const entry of old.entries)
      await copyFile(
        `drizzle/${entry.tag}.sql`,
        path.join(directory, `${entry.tag}.sql`),
      );
    await migrate(drizzle(pool), { migrationsFolder: directory });
    const episode = (
      await pool.query(
        "INSERT INTO episodes (title,brief,theme,target_seconds,llm_model,narration_provider,format,purpose,revision) VALUES ('Synthetic legacy episode','','hope',120,'openai/gpt-5.6-luna','auto','both','publish',7) RETURNING id",
      )
    ).rows[0];
    const edition = (
      await pool.query(
        "INSERT INTO source_imports (environment,resource_id,name,author,status,expected_chapters,expected_verses,metadata,rights_notes) VALUES ('prelive',85,'Synthetic fixture','Fixture','completed',1,1,'{}','Synthetic only') RETURNING id",
      )
    ).rows[0];
    const blocks = [{ kind: "reflection", text: "Immutable synthetic words." }];
    const script = (
      await pool.query(
        "INSERT INTO script_revisions (episode_id,episode_revision,import_id,model,title,blocks,retrieval,checksum) VALUES ($1,7,$2,'manual','Synthetic legacy script',$3,'{}','legacy-checksum') RETURNING id",
        [episode.id, edition.id, JSON.stringify(blocks)],
      )
    ).rows[0];
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const saved = (
      await pool.query(
        "SELECT revision,content_revision FROM episodes WHERE id=$1",
        [episode.id],
      )
    ).rows[0];
    assert.deepEqual(saved, { revision: 7, content_revision: 7 });
    const unchanged = (
      await pool.query(
        "SELECT episode_revision,blocks,checksum FROM script_revisions WHERE id=$1",
        [script.id],
      )
    ).rows[0];
    assert.equal(unchanged.episode_revision, 7);
    assert.deepEqual(unchanged.blocks, blocks);
    assert.equal(unchanged.checksum, "legacy-checksum");
    await assert.rejects(
      pool.query("UPDATE episodes SET content_revision=8 WHERE id=$1", [
        episode.id,
      ]),
      /episode_content_revision/,
    );
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
