CREATE TABLE "caption_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_take_id" uuid NOT NULL,
	"parent_id" uuid,
	"cues" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"review_state" text DEFAULT 'unreviewed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"script_id" uuid NOT NULL,
	"voice_take_id" uuid NOT NULL,
	"caption_track_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"review_state" text DEFAULT 'unreviewed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compositions_checksum_unique" UNIQUE("checksum")
);
--> statement-breakpoint
CREATE TABLE "video_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"composition_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"landscape_path" text NOT NULL,
	"vertical_path" text NOT NULL,
	"srt_path" text NOT NULL,
	"description_path" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_exports_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "voice_takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"voice_id" text NOT NULL,
	"voice_name" text NOT NULL,
	"settings" jsonb NOT NULL,
	"purpose" text NOT NULL,
	"transcript" text NOT NULL,
	"audio_path" text NOT NULL,
	"duration" double precision NOT NULL,
	"checksum" text NOT NULL,
	"rights" jsonb NOT NULL,
	"alignment" jsonb NOT NULL,
	"review_state" text DEFAULT 'unreviewed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_takes_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "caption_tracks" ADD CONSTRAINT "caption_tracks_voice_take_id_voice_takes_id_fk" FOREIGN KEY ("voice_take_id") REFERENCES "public"."voice_takes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_script_id_script_revisions_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."script_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_voice_take_id_voice_takes_id_fk" FOREIGN KEY ("voice_take_id") REFERENCES "public"."voice_takes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_caption_track_id_caption_tracks_id_fk" FOREIGN KEY ("caption_track_id") REFERENCES "public"."caption_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_exports" ADD CONSTRAINT "video_exports_composition_id_compositions_id_fk" FOREIGN KEY ("composition_id") REFERENCES "public"."compositions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_exports" ADD CONSTRAINT "video_exports_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_takes" ADD CONSTRAINT "voice_takes_script_id_script_revisions_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."script_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_takes" ADD CONSTRAINT "voice_takes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;