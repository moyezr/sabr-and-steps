import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

nextEnv.loadEnvConfig(process.cwd());
const configuredDatabaseUrl = process.env.DATABASE_URL;

test("fresh database migration, pgvector, persistence, constraints, and revision conflicts", async () => {
  assert(configuredDatabaseUrl, "Run pnpm db:configure and pnpm db:up first.");
  const admin = new Pool({
    connectionString: configuredDatabaseUrl,
    connectionTimeoutMillis: 3000,
  });
  const database = `sabr_test_${randomUUID().replaceAll("-", "")}`;
  let applicationPool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(configuredDatabaseUrl);
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

test("workspace migrations deterministically backfill selections without deleting artifacts", async () => {
  assert(configuredDatabaseUrl, "Run pnpm db:configure and pnpm db:up first.");
  const admin = new Pool({
    connectionString: configuredDatabaseUrl,
    connectionTimeoutMillis: 3000,
  });
  const database = `sabr_workspace_migration_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(configuredDatabaseUrl);
    url.pathname = `/${database}`;
    pool = new Pool({ connectionString: url.toString() });
    const legacyMigrations = [
      "0000_episode_studio.sql",
      "0001_breezy_lord_tyger.sql",
      "0002_fixed_fabian_cortez.sql",
      "0003_third_kronos.sql",
      "0004_early_molten_man.sql",
      "0005_mature_radioactive_man.sql",
      "0006_chubby_titanium_man.sql",
    ];
    for (const file of legacyMigrations) {
      await pool.query(
        await readFile(
          new URL(`../../drizzle/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }

    const episodeWithScripts = randomUUID();
    const episodeWithoutScripts = randomUUID();
    await pool.query(
      `INSERT INTO episodes
        (id, title, theme, target_seconds, llm_model, narration_provider, format, purpose)
       VALUES
        ($1, 'Versioned episode', 'patience', 120, 'openai/gpt-5.6-luna', 'auto', 'both', 'audition'),
        ($2, 'Blank episode', 'hope', 90, 'google/gemini-3.8-flash', 'auto', 'vertical', 'audition')`,
      [episodeWithScripts, episodeWithoutScripts],
    );
    const sourceImport = (
      await pool.query<{ id: string }>(
        `INSERT INTO source_imports
          (environment, resource_id, name, author, status, expected_chapters,
           expected_verses, completed_chapters, metadata, rights_notes)
         VALUES ('prelive', 85, 'Fixture', 'Fixture', 'completed', 1, 1,
           ARRAY[1], '{}'::jsonb, 'Synthetic fixture')
         RETURNING id`,
      )
    ).rows[0];
    const embeddingIndex = (
      await pool.query<{ id: string }>(
        `INSERT INTO embedding_indexes
          (import_id, config_hash, model, dimensions, preprocessing, state)
         VALUES ($1, 'workspace-fixture', 'text-embedding-3-small', 1536,
           'fixture', 'ready')
         RETURNING id`,
        [sourceImport.id],
      )
    ).rows[0];
    const firstScript = "00000000-0000-4000-8000-000000000001";
    const secondScript = "00000000-0000-4000-8000-000000000002";
    const selectedScript = "00000000-0000-4000-8000-000000000003";
    await pool.query(
      `INSERT INTO script_revisions
        (id, episode_id, episode_revision, parent_id, import_id, index_id,
         model, title, blocks, retrieval, checksum, created_at)
       VALUES
        ($1, $4, 1, NULL, $5, $6, 'openai/gpt-5.6-luna', 'First',
          '[{"kind":"reflection","text":"First"}]'::jsonb, '{}'::jsonb,
          'first', '2026-01-01T00:00:00Z'),
        ($2, $4, 1, $1, $5, $6, 'openai/gpt-5.6-luna', 'Second',
          '[{"kind":"reflection","text":"Second"}]'::jsonb, '{}'::jsonb,
          'second', '2026-01-02T00:00:00Z'),
        ($3, $4, 1, $2, $5, $6, 'openai/gpt-5.6-luna', 'Selected',
          '[{"kind":"reflection","text":"Selected"}]'::jsonb, '{}'::jsonb,
          'selected', '2026-01-02T00:00:00Z')`,
      [
        firstScript,
        secondScript,
        selectedScript,
        episodeWithScripts,
        sourceImport.id,
        embeddingIndex.id,
      ],
    );

    await pool.query(
      await readFile(
        new URL("../../drizzle/0007_overjoyed_the_hand.sql", import.meta.url),
        "utf8",
      ),
    );

    const firstTake = "00000000-0000-4000-8200-000000000001";
    const selectedTake = "00000000-0000-4000-8200-000000000002";
    const otherScriptTake = "00000000-0000-4000-8200-000000000099";
    const firstCaption = "00000000-0000-4000-8300-000000000001";
    const selectedCaption = "00000000-0000-4000-8300-000000000002";
    const unrelatedCaption = "00000000-0000-4000-8300-000000000099";
    const firstComposition = "00000000-0000-4000-8400-000000000001";
    const selectedComposition = "00000000-0000-4000-8400-000000000002";
    const exportId = "00000000-0000-4000-8500-000000000001";
    const jobIds = [
      "00000000-0000-4000-8100-000000000001",
      "00000000-0000-4000-8100-000000000002",
      "00000000-0000-4000-8100-000000000003",
      "00000000-0000-4000-8100-000000000004",
    ];
    await pool.query(
      `INSERT INTO jobs (id, episode_id, kind, key, input, status)
       VALUES
        ($1, $5, 'fixture', 'migration-job-1', '{}'::jsonb, 'succeeded'),
        ($2, $5, 'fixture', 'migration-job-2', '{}'::jsonb, 'succeeded'),
        ($3, $5, 'fixture', 'migration-job-3', '{}'::jsonb, 'succeeded'),
        ($4, $5, 'fixture', 'migration-job-4', '{}'::jsonb, 'succeeded')`,
      [...jobIds, episodeWithScripts],
    );
    await pool.query(
      `INSERT INTO voice_takes
        (id, script_id, job_id, provider, model, voice_id, voice_name, settings,
         purpose, transcript, audio_path, duration, checksum, rights, alignment, created_at)
       VALUES
        ($1, $4, $6, 'fixture', 'fixture', 'voice-1', 'First voice', '{}'::jsonb,
          'audition', 'First', 'first.mp3', 5, 'take-1', '{}'::jsonb, '{}'::jsonb,
          '2026-01-03T00:00:00Z'),
        ($2, $4, $7, 'fixture', 'fixture', 'voice-2', 'Selected voice', '{}'::jsonb,
          'audition', 'Selected', 'selected.mp3', 5, 'take-2', '{}'::jsonb, '{}'::jsonb,
          '2026-01-03T00:00:00Z'),
        ($3, $5, $8, 'fixture', 'fixture', 'voice-3', 'Other script voice', '{}'::jsonb,
          'audition', 'Other', 'other.mp3', 5, 'take-3', '{}'::jsonb, '{}'::jsonb,
          '2026-01-04T00:00:00Z')`,
      [
        firstTake,
        selectedTake,
        otherScriptTake,
        selectedScript,
        secondScript,
        jobIds[0],
        jobIds[1],
        jobIds[2],
      ],
    );
    await pool.query(
      `INSERT INTO caption_tracks
        (id, voice_take_id, cues, checksum, created_at)
       VALUES
        ($1, $4, '[]'::jsonb, 'caption-1', '2026-01-05T00:00:00Z'),
        ($2, $4, '[]'::jsonb, 'caption-2', '2026-01-05T00:00:00Z'),
        ($3, $5, '[]'::jsonb, 'caption-other', '2026-01-06T00:00:00Z')`,
      [
        firstCaption,
        selectedCaption,
        unrelatedCaption,
        selectedTake,
        firstTake,
      ],
    );
    await pool.query(
      `INSERT INTO compositions
        (id, episode_id, script_id, voice_take_id, caption_track_id, data,
         checksum, created_at)
       VALUES
        ($1, $3, $4, $5, $6, '{}'::jsonb, 'composition-1',
          '2026-01-07T00:00:00Z'),
        ($2, $3, $4, $5, $6, '{}'::jsonb, 'composition-2',
          '2026-01-07T00:00:00Z')`,
      [
        firstComposition,
        selectedComposition,
        episodeWithScripts,
        selectedScript,
        selectedTake,
        selectedCaption,
      ],
    );
    await pool.query(
      `INSERT INTO video_exports
        (id, composition_id, job_id, landscape_path, vertical_path, srt_path,
         description_path, metadata)
       VALUES ($1, $2, $3, 'landscape.mp4', 'vertical.mp4', 'captions.srt',
         'description.txt', '{}'::jsonb)`,
      [exportId, firstComposition, jobIds[3]],
    );
    const artifactCountsBefore = (
      await pool.query<{
        voice_takes: number;
        caption_tracks: number;
        compositions: number;
        video_exports: number;
      }>(`SELECT
          (SELECT count(*)::int FROM voice_takes) AS voice_takes,
          (SELECT count(*)::int FROM caption_tracks) AS caption_tracks,
          (SELECT count(*)::int FROM compositions) AS compositions,
          (SELECT count(*)::int FROM video_exports) AS video_exports`)
    ).rows[0];

    await pool.query(
      await readFile(
        new URL("../../drizzle/0008_messy_the_santerians.sql", import.meta.url),
        "utf8",
      ),
    );

    const states = await pool.query<{
      episode_id: string;
      selected_script_id: string | null;
      selected_voice_take_id: string | null;
      selected_caption_track_id: string | null;
      selected_composition_id: string | null;
      revision: number;
    }>(
      `SELECT episode_id, selected_script_id, selected_voice_take_id,
         selected_caption_track_id, selected_composition_id, revision
       FROM episode_workspace_states ORDER BY episode_id`,
    );
    assert.equal(states.rowCount, 2);
    assert.deepEqual(
      states.rows.find((row) => row.episode_id === episodeWithScripts),
      {
        episode_id: episodeWithScripts,
        selected_script_id: selectedScript,
        selected_voice_take_id: selectedTake,
        selected_caption_track_id: selectedCaption,
        selected_composition_id: selectedComposition,
        revision: 1,
      },
    );
    assert.deepEqual(
      states.rows.find((row) => row.episode_id === episodeWithoutScripts),
      {
        episode_id: episodeWithoutScripts,
        selected_script_id: null,
        selected_voice_take_id: null,
        selected_caption_track_id: null,
        selected_composition_id: null,
        revision: 1,
      },
    );
    const artifactCountsAfter = (
      await pool.query<typeof artifactCountsBefore>(`SELECT
          (SELECT count(*)::int FROM voice_takes) AS voice_takes,
          (SELECT count(*)::int FROM caption_tracks) AS caption_tracks,
          (SELECT count(*)::int FROM compositions) AS compositions,
          (SELECT count(*)::int FROM video_exports) AS video_exports`)
    ).rows[0];
    assert.deepEqual(artifactCountsAfter, artifactCountsBefore);

    const drafts = await pool.query(
      "SELECT episode_id FROM episode_script_drafts",
    );
    assert.equal(
      drafts.rowCount,
      0,
      "Migration must not create a working draft until the creator edits.",
    );

    const metadata = await pool.query<{
      id: string;
      label: string;
      change_kind: string;
      generation_instructions: string;
    }>(
      `SELECT id, label, change_kind, generation_instructions
       FROM script_revisions ORDER BY created_at, id`,
    );
    assert.deepEqual(
      metadata.rows.map((row) => [
        row.id,
        row.label,
        row.change_kind,
        row.generation_instructions,
      ]),
      [
        [firstScript, "Version 1", "generated", ""],
        [secondScript, "Version 2", "checkpoint", ""],
        [selectedScript, "Version 3", "checkpoint", ""],
      ],
    );
    await assert.rejects(
      pool.query(
        "UPDATE episode_workspace_states SET revision = 0 WHERE episode_id = $1",
        [episodeWithScripts],
      ),
      (error: unknown) => (error as { code?: string }).code === "23514",
    );
    await assert.rejects(
      pool.query("UPDATE script_revisions SET label = '' WHERE id = $1", [
        selectedScript,
      ]),
      (error: unknown) => (error as { code?: string }).code === "23514",
    );
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
