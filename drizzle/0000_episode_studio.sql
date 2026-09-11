CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"theme" text NOT NULL,
	"target_seconds" integer NOT NULL,
	"llm_model" text NOT NULL,
	"narration_provider" text NOT NULL,
	"format" text NOT NULL,
	"purpose" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_title_length" CHECK (char_length(trim("episodes"."title")) BETWEEN 1 AND 140),
	CONSTRAINT "episode_brief_length" CHECK (char_length("episodes"."brief") <= 5000),
	CONSTRAINT "episode_duration" CHECK ("episodes"."target_seconds" BETWEEN 60 AND 300),
	CONSTRAINT "episode_model" CHECK ("episodes"."llm_model" IN ('openai/gpt-5.6-luna', 'google/gemini-3.8-flash')),
	CONSTRAINT "episode_theme" CHECK ("episodes"."theme" IN ('hope', 'patience', 'gratitude', 'forgiveness', 'trust')),
	CONSTRAINT "episode_narration" CHECK ("episodes"."narration_provider" IN ('auto', 'cartesia', 'elevenlabs', 'deepgram')),
	CONSTRAINT "episode_format" CHECK ("episodes"."format" IN ('both', 'landscape', 'vertical')),
	CONSTRAINT "episode_purpose" CHECK ("episodes"."purpose" IN ('audition', 'publish')),
	CONSTRAINT "episode_revision" CHECK ("episodes"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX "episodes_updated_at_idx" ON "episodes" USING btree ("updated_at");