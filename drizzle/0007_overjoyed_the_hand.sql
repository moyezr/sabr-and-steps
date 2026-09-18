CREATE TABLE "episode_script_drafts" (
	"episode_id" uuid PRIMARY KEY NOT NULL,
	"base_script_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_draft_revision" CHECK ("episode_script_drafts"."revision" > 0),
	CONSTRAINT "script_draft_title_length" CHECK (char_length(trim("episode_script_drafts"."title")) BETWEEN 1 AND 140)
);
--> statement-breakpoint
CREATE TABLE "episode_workspace_states" (
	"episode_id" uuid PRIMARY KEY NOT NULL,
	"selected_script_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_state_revision" CHECK ("episode_workspace_states"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "script_revisions" ADD COLUMN "label" text DEFAULT 'Version' NOT NULL;--> statement-breakpoint
ALTER TABLE "script_revisions" ADD COLUMN "change_kind" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "script_revisions" ADD COLUMN "generation_instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
WITH "ranked_scripts" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "episode_id"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "position"
	FROM "script_revisions"
)
UPDATE "script_revisions" AS "script"
SET
	"label" = 'Version ' || "ranked_scripts"."position"::text,
	"change_kind" = CASE
		WHEN "script"."parent_id" IS NULL THEN 'generated'
		ELSE 'checkpoint'
	END
FROM "ranked_scripts"
WHERE "script"."id" = "ranked_scripts"."id";--> statement-breakpoint
ALTER TABLE "episode_script_drafts" ADD CONSTRAINT "episode_script_drafts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_script_drafts" ADD CONSTRAINT "episode_script_drafts_base_script_id_script_revisions_id_fk" FOREIGN KEY ("base_script_id") REFERENCES "public"."script_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_workspace_states" ADD CONSTRAINT "episode_workspace_states_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_workspace_states" ADD CONSTRAINT "episode_workspace_states_selected_script_id_script_revisions_id_fk" FOREIGN KEY ("selected_script_id") REFERENCES "public"."script_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "script_draft_base_script" ON "episode_script_drafts" USING btree ("base_script_id");--> statement-breakpoint
CREATE INDEX "workspace_selected_script" ON "episode_workspace_states" USING btree ("selected_script_id");--> statement-breakpoint
ALTER TABLE "script_revisions" ADD CONSTRAINT "script_change_kind" CHECK ("script_revisions"."change_kind" IN ('generated','checkpoint','restored'));--> statement-breakpoint
ALTER TABLE "script_revisions" ADD CONSTRAINT "script_label_length" CHECK (char_length(trim("script_revisions"."label")) BETWEEN 1 AND 140);--> statement-breakpoint
INSERT INTO "episode_workspace_states" (
	"episode_id",
	"selected_script_id",
	"revision",
	"created_at",
	"updated_at"
)
SELECT
	"episode"."id",
	"latest_script"."id",
	1,
	"episode"."created_at",
	"episode"."updated_at"
FROM "episodes" AS "episode"
LEFT JOIN LATERAL (
	SELECT "script"."id"
	FROM "script_revisions" AS "script"
	WHERE "script"."episode_id" = "episode"."id"
	ORDER BY "script"."created_at" DESC, "script"."id" DESC
	LIMIT 1
) AS "latest_script" ON true;
