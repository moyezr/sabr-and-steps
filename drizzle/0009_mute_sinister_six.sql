CREATE TABLE "idea_suggestion_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"episode_revision" integer NOT NULL,
	"model" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"suggestions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_suggestion_sets_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "idea_suggestion_episode_revision" CHECK ("idea_suggestion_sets"."episode_revision" > 0),
	CONSTRAINT "idea_suggestion_model" CHECK ("idea_suggestion_sets"."model" IN ('openai/gpt-5.6-luna', 'google/gemini-3.8-flash')),
	CONSTRAINT "idea_suggestion_instructions_length" CHECK (char_length("idea_suggestion_sets"."instructions") <= 2000),
	CONSTRAINT "idea_suggestion_input_snapshot" CHECK (jsonb_typeof("idea_suggestion_sets"."input_snapshot") = 'object'),
	CONSTRAINT "idea_suggestion_results" CHECK (CASE WHEN jsonb_typeof("idea_suggestion_sets"."suggestions") = 'array' THEN jsonb_array_length("idea_suggestion_sets"."suggestions") = 3 ELSE false END)
);
--> statement-breakpoint
ALTER TABLE "idea_suggestion_sets" ADD CONSTRAINT "idea_suggestion_sets_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_suggestion_sets" ADD CONSTRAINT "idea_suggestion_sets_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idea_suggestion_episode_created" ON "idea_suggestion_sets" USING btree ("episode_id","created_at");
