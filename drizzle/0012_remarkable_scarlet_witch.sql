CREATE TABLE "automation_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_profile_name" CHECK (char_length(trim("automation_profiles"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "automation_profile_settings" CHECK (jsonb_typeof("automation_profiles"."settings") = 'object')
);
--> statement-breakpoint
CREATE TABLE "production_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"script_id" uuid,
	"composition_id" uuid,
	"export_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_runs_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "production_runs_episode_id_unique" UNIQUE("episode_id"),
	CONSTRAINT "production_runs_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "production_snapshot" CHECK (jsonb_typeof("production_runs"."snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_profile_id_automation_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."automation_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_script_id_script_revisions_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."script_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_composition_id_compositions_id_fk" FOREIGN KEY ("composition_id") REFERENCES "public"."compositions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_export_id_video_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."video_exports"("id") ON DELETE no action ON UPDATE no action;