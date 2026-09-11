CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"mime" text NOT NULL,
	"checksum" text NOT NULL,
	"duration" double precision,
	"provenance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compositions" ALTER COLUMN "voice_take_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "compositions" ALTER COLUMN "caption_track_id" DROP NOT NULL;