CREATE TABLE "composition_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"composition_id" uuid NOT NULL,
	"export_id" uuid NOT NULL,
	"composition_checksum" text NOT NULL,
	"script_checksum" text NOT NULL,
	"voice_checksum" text NOT NULL,
	"caption_checksum" text NOT NULL,
	"decision" text NOT NULL,
	"checklist" jsonb NOT NULL,
	"feedback" text NOT NULL,
	"rights_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "composition_review_decision" CHECK ("composition_reviews"."decision" IN ('approved','needs_changes')),
	CONSTRAINT "composition_review_checksum" CHECK (char_length("composition_reviews"."composition_checksum") = 64),
	CONSTRAINT "composition_review_feedback" CHECK (char_length("composition_reviews"."feedback") <= 6000)
);
--> statement-breakpoint
CREATE TABLE "hadith_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"edition" text NOT NULL,
	"translator" text,
	"provenance" text NOT NULL,
	"coverage_notes" text NOT NULL,
	"record_count" integer NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"rights_status" text DEFAULT 'not_cleared' NOT NULL,
	"rights_notes" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hadith_provider" CHECK ("hadith_imports"."provider" IN ('manual','sunnah')),
	CONSTRAINT "hadith_import_status" CHECK ("hadith_imports"."status" = 'completed'),
	CONSTRAINT "hadith_import_rights" CHECK ("hadith_imports"."rights_status" IN ('not_cleared','cleared')),
	CONSTRAINT "hadith_import_count" CHECK ("hadith_imports"."record_count" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "hadith_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"collection_code" text NOT NULL,
	"collection_name" text NOT NULL,
	"book_number" text NOT NULL,
	"book_name" text,
	"chapter_id" text,
	"chapter_title" text,
	"hadith_number" text NOT NULL,
	"numbering_scheme" text NOT NULL,
	"other_references" jsonb NOT NULL,
	"reference" text NOT NULL,
	"narrator" text,
	"text" text NOT NULL,
	"arabic" text DEFAULT '' NOT NULL,
	"context" jsonb NOT NULL,
	"grades" jsonb NOT NULL,
	"source_url" text NOT NULL,
	"raw" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"review_state" text DEFAULT 'unreviewed' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "hadith_review_state" CHECK ("hadith_passages"."review_state" IN ('unreviewed','reviewed')),
	CONSTRAINT "hadith_review_evidence" CHECK ("hadith_passages"."review_state" != 'reviewed' OR ("hadith_passages"."reviewed_by" IS NOT NULL AND "hadith_passages"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "script_rewrite_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"base_script_id" uuid NOT NULL,
	"draft_revision" integer NOT NULL,
	"episode_revision" integer NOT NULL,
	"model" text NOT NULL,
	"instructions" text NOT NULL,
	"selection" jsonb NOT NULL,
	"alternatives" jsonb NOT NULL,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_rewrite_suggestions_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "rewrite_model" CHECK ("script_rewrite_suggestions"."model" IN ('openai/gpt-5.6-luna', 'google/gemini-3.8-flash')),
	CONSTRAINT "rewrite_revision" CHECK ("script_rewrite_suggestions"."draft_revision" >= 0 AND "script_rewrite_suggestions"."episode_revision" > 0),
	CONSTRAINT "rewrite_instructions" CHECK (char_length("script_rewrite_suggestions"."instructions") <= 2000),
	CONSTRAINT "rewrite_alternatives" CHECK (CASE WHEN jsonb_typeof("script_rewrite_suggestions"."alternatives") = 'array' THEN jsonb_array_length("script_rewrite_suggestions"."alternatives") = 3 ELSE false END)
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "content_revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE "episodes" SET "content_revision" = "revision";--> statement-breakpoint
ALTER TABLE "composition_reviews" ADD CONSTRAINT "composition_reviews_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composition_reviews" ADD CONSTRAINT "composition_reviews_composition_id_compositions_id_fk" FOREIGN KEY ("composition_id") REFERENCES "public"."compositions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composition_reviews" ADD CONSTRAINT "composition_reviews_export_id_video_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."video_exports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hadith_passages" ADD CONSTRAINT "hadith_passages_import_id_hadith_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."hadith_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_rewrite_suggestions" ADD CONSTRAINT "script_rewrite_suggestions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_rewrite_suggestions" ADD CONSTRAINT "script_rewrite_suggestions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_rewrite_suggestions" ADD CONSTRAINT "script_rewrite_suggestions_base_script_id_script_revisions_id_fk" FOREIGN KEY ("base_script_id") REFERENCES "public"."script_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "composition_review_revision" ON "composition_reviews" USING btree ("composition_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hadith_import_checksum" ON "hadith_imports" USING btree ("checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "hadith_import_identity" ON "hadith_passages" USING btree ("import_id","collection_code","numbering_scheme","hadith_number");--> statement-breakpoint
CREATE INDEX "hadith_import_collection" ON "hadith_passages" USING btree ("import_id","collection_code");--> statement-breakpoint
CREATE INDEX "rewrite_episode_created" ON "script_rewrite_suggestions" USING btree ("episode_id","created_at");--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episode_content_revision" CHECK ("episodes"."content_revision" > 0 AND "episodes"."content_revision" <= "episodes"."revision");