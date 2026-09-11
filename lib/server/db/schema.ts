import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  vector,
  jsonb,
  uniqueIndex,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import type { EpisodeInput } from "../../domain/episode";

export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    brief: text("brief").notNull().default(""),
    theme: text("theme").$type<EpisodeInput["theme"]>().notNull(),
    targetSeconds: integer("target_seconds").notNull(),
    llmModel: text("llm_model").$type<EpisodeInput["llmModel"]>().notNull(),
    narrationProvider: text("narration_provider")
      .$type<EpisodeInput["narrationProvider"]>()
      .notNull(),
    format: text("format").$type<EpisodeInput["format"]>().notNull(),
    purpose: text("purpose").$type<EpisodeInput["purpose"]>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("episodes_updated_at_idx").on(table.updatedAt),
    check(
      "episode_title_length",
      sql`char_length(trim(${table.title})) BETWEEN 1 AND 140`,
    ),
    check("episode_brief_length", sql`char_length(${table.brief}) <= 5000`),
    check("episode_duration", sql`${table.targetSeconds} BETWEEN 60 AND 300`),
    check(
      "episode_model",
      sql`${table.llmModel} IN ('openai/gpt-5.6-luna', 'google/gemini-3.8-flash')`,
    ),
    check(
      "episode_theme",
      sql`${table.theme} IN ('hope', 'patience', 'gratitude', 'forgiveness', 'trust')`,
    ),
    check(
      "episode_narration",
      sql`${table.narrationProvider} IN ('auto', 'cartesia', 'elevenlabs', 'deepgram')`,
    ),
    check(
      "episode_format",
      sql`${table.format} IN ('both', 'landscape', 'vertical')`,
    ),
    check("episode_purpose", sql`${table.purpose} IN ('audition', 'publish')`),
    check("episode_revision", sql`${table.revision} > 0`),
  ],
);

// Immutable completed snapshots; retries checkpoint chapters within an import.
export const sourceImports = pgTable(
  "source_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environment: text("environment").notNull(),
    resourceId: integer("resource_id").notNull(),
    name: text("name").notNull(),
    author: text("author").notNull(),
    status: text("status").notNull().default("running"),
    expectedChapters: integer("expected_chapters").notNull(),
    expectedVerses: integer("expected_verses").notNull(),
    completedChapters: integer("completed_chapters")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    metadata: jsonb("metadata").notNull(),
    rightsStatus: text("rights_status").notNull().default("not_cleared"),
    rightsNotes: text("rights_notes").notNull(),
    checksum: text("checksum"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "source_environment",
      sql`${t.environment} IN ('prelive','production')`,
    ),
    check(
      "source_status",
      sql`${t.status} IN ('running','failed','completed')`,
    ),
    check("source_rights", sql`${t.rightsStatus} IN ('not_cleared','cleared')`),
    check(
      "source_counts",
      sql`${t.expectedChapters} BETWEEN 1 AND 114 AND ${t.expectedVerses} BETWEEN 1 AND 6236`,
    ),
  ],
);
export const sourcePassages = pgTable(
  "source_passages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => sourceImports.id),
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    reference: text("reference").notNull(),
    chapterName: text("chapter_name").notNull(),
    text: text("text").notNull(),
    arabic: text("arabic").notNull(),
    raw: jsonb("raw").notNull(),
    checksum: text("checksum").notNull(),
  },
  (t) => [
    uniqueIndex("passage_import_reference").on(t.importId, t.reference),
    index("passage_chapter").on(t.importId, t.chapter, t.verse),
    check(
      "passage_reference",
      sql`${t.chapter} BETWEEN 1 AND 114 AND ${t.verse} BETWEEN 1 AND 286 AND ${t.reference} = ${t.chapter}::text || ':' || ${t.verse}::text`,
    ),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id").references(() => episodes.id),
    kind: text("kind").notNull(),
    key: text("key").notNull().unique(),
    input: jsonb("input").notNull(),
    result: jsonb("result"),
    status: text("status").notNull().default("queued"),
    progress: text("progress").notNull().default("Waiting for worker"),
    attempts: integer("attempts").notNull().default(0),
    owner: uuid("owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "job_status",
      sql`${t.status} IN ('queued','running','succeeded','failed','needs_attention')`,
    ),
    index("jobs_claim").on(t.status, t.availableAt),
  ],
);

export const providerUsage = pgTable(
  "provider_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    operation: text("operation").notNull().unique(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    unit: text("unit").notNull(),
    estimated: doublePrecision("estimated").notNull(),
    actual: doublePrecision("actual"),
    state: text("state").notNull().default("reserved"),
    details: jsonb("details").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "usage_state",
      sql`${t.state} IN ('reserved','dispatched','settled','uncertain','released')`,
    ),
    check(
      "usage_amount",
      sql`${t.estimated} >= 0 AND (${t.actual} IS NULL OR ${t.actual} >= 0)`,
    ),
  ],
);

export const embeddingIndexes = pgTable(
  "embedding_indexes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => sourceImports.id),
    configHash: text("config_hash").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    preprocessing: text("preprocessing").notNull(),
    state: text("state").notNull().default("building"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("embedding_index_config").on(t.importId, t.configHash),
    check("embedding_dimensions", sql`${t.dimensions} = 1536`),
  ],
);
export const passageEmbeddings = pgTable(
  "passage_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indexId: uuid("index_id")
      .notNull()
      .references(() => embeddingIndexes.id),
    passageId: uuid("passage_id")
      .notNull()
      .references(() => sourcePassages.id),
    checksum: text("checksum").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  },
  (t) => [uniqueIndex("passage_embedding_version").on(t.indexId, t.passageId)],
);
export const queryEmbeddings = pgTable("query_embeddings", {
  key: text("key").primaryKey(),
  configHash: text("config_hash").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
});
export const scriptRevisions = pgTable(
  "script_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id),
    episodeRevision: integer("episode_revision").notNull(),
    parentId: uuid("parent_id"),
    jobId: uuid("job_id")
      .references(() => jobs.id)
      .unique(),
    importId: uuid("import_id")
      .notNull()
      .references(() => sourceImports.id),
    indexId: uuid("index_id")
      .notNull()
      .references(() => embeddingIndexes.id),
    model: text("model").notNull(),
    title: text("title").notNull(),
    blocks: jsonb("blocks").notNull(),
    retrieval: jsonb("retrieval").notNull(),
    checksum: text("checksum").notNull(),
    reviewState: text("review_state").notNull().default("unreviewed"),
    reviewNotes: text("review_notes").notNull().default(""),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("script_review", sql`${t.reviewState} IN ('unreviewed','reviewed')`),
    index("script_episode").on(t.episodeId, t.createdAt),
  ],
);

export const voiceTakes = pgTable("voice_takes", {
  id: uuid("id").primaryKey().defaultRandom(),
  scriptId: uuid("script_id")
    .notNull()
    .references(() => scriptRevisions.id),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id)
    .unique(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  voiceId: text("voice_id").notNull(),
  voiceName: text("voice_name").notNull(),
  settings: jsonb("settings").notNull(),
  purpose: text("purpose").notNull(),
  transcript: text("transcript").notNull(),
  audioPath: text("audio_path").notNull(),
  duration: doublePrecision("duration").notNull(),
  checksum: text("checksum").notNull(),
  rights: jsonb("rights").notNull(),
  alignment: jsonb("alignment").notNull(),
  reviewState: text("review_state").notNull().default("unreviewed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const captionTracks = pgTable("caption_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  voiceTakeId: uuid("voice_take_id")
    .notNull()
    .references(() => voiceTakes.id),
  parentId: uuid("parent_id"),
  cues: jsonb("cues").notNull(),
  checksum: text("checksum").notNull(),
  reviewState: text("review_state").notNull().default("unreviewed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  checksum: text("checksum").notNull(),
  duration: doublePrecision("duration"),
  width: integer("width"),
  height: integer("height"),
  provenance: text("provenance").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const compositions = pgTable("compositions", {
  id: uuid("id").primaryKey().defaultRandom(),
  episodeId: uuid("episode_id")
    .notNull()
    .references(() => episodes.id),
  scriptId: uuid("script_id")
    .notNull()
    .references(() => scriptRevisions.id),
  voiceTakeId: uuid("voice_take_id").references(() => voiceTakes.id),
  captionTrackId: uuid("caption_track_id").references(() => captionTracks.id),
  data: jsonb("data").notNull(),
  checksum: text("checksum").notNull(),
  reviewState: text("review_state").notNull().default("unreviewed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const videoExports = pgTable("video_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  compositionId: uuid("composition_id")
    .notNull()
    .references(() => compositions.id),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id)
    .unique(),
  landscapePath: text("landscape_path").notNull(),
  verticalPath: text("vertical_path").notNull(),
  srtPath: text("srt_path").notNull(),
  descriptionPath: text("description_path").notNull(),
  metadata: jsonb("metadata").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
