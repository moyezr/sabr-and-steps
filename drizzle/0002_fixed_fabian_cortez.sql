CREATE TABLE "embedding_indexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"config_hash" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"preprocessing" text NOT NULL,
	"state" text DEFAULT 'building' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embedding_dimensions" CHECK ("embedding_indexes"."dimensions" = 1536)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" text DEFAULT 'Waiting for worker' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"owner" uuid,
	"lease_until" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_key_unique" UNIQUE("key"),
	CONSTRAINT "job_status" CHECK ("jobs"."status" IN ('queued','running','succeeded','failed','needs_attention'))
);
--> statement-breakpoint
CREATE TABLE "passage_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"index_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	"checksum" text NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"unit" text NOT NULL,
	"estimated" double precision NOT NULL,
	"actual" double precision,
	"state" text DEFAULT 'reserved' NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_usage_operation_unique" UNIQUE("operation"),
	CONSTRAINT "usage_state" CHECK ("provider_usage"."state" IN ('reserved','dispatched','settled','uncertain','released')),
	CONSTRAINT "usage_amount" CHECK ("provider_usage"."estimated" >= 0 AND ("provider_usage"."actual" IS NULL OR "provider_usage"."actual" >= 0))
);
--> statement-breakpoint
CREATE TABLE "query_embeddings" (
	"key" text PRIMARY KEY NOT NULL,
	"config_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"episode_revision" integer NOT NULL,
	"parent_id" uuid,
	"job_id" uuid,
	"import_id" uuid NOT NULL,
	"index_id" uuid NOT NULL,
	"model" text NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"retrieval" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"review_state" text DEFAULT 'unreviewed' NOT NULL,
	"review_notes" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_revisions_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "script_review" CHECK ("script_revisions"."review_state" IN ('unreviewed','reviewed'))
);
--> statement-breakpoint
ALTER TABLE "embedding_indexes" ADD CONSTRAINT "embedding_indexes_import_id_source_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."source_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_embeddings" ADD CONSTRAINT "passage_embeddings_index_id_embedding_indexes_id_fk" FOREIGN KEY ("index_id") REFERENCES "public"."embedding_indexes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_embeddings" ADD CONSTRAINT "passage_embeddings_passage_id_source_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."source_passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_revisions" ADD CONSTRAINT "script_revisions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_revisions" ADD CONSTRAINT "script_revisions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_revisions" ADD CONSTRAINT "script_revisions_import_id_source_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."source_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_revisions" ADD CONSTRAINT "script_revisions_index_id_embedding_indexes_id_fk" FOREIGN KEY ("index_id") REFERENCES "public"."embedding_indexes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_index_config" ON "embedding_indexes" USING btree ("import_id","config_hash");--> statement-breakpoint
CREATE INDEX "jobs_claim" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "passage_embedding_version" ON "passage_embeddings" USING btree ("index_id","passage_id");--> statement-breakpoint
CREATE INDEX "script_episode" ON "script_revisions" USING btree ("episode_id","created_at");