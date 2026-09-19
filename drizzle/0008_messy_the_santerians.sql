ALTER TABLE "episode_workspace_states" ADD COLUMN "selected_voice_take_id" uuid;--> statement-breakpoint
ALTER TABLE "episode_workspace_states" ADD COLUMN "selected_caption_track_id" uuid;--> statement-breakpoint
ALTER TABLE "episode_workspace_states" ADD COLUMN "selected_composition_id" uuid;--> statement-breakpoint
ALTER TABLE "episode_workspace_states" ADD CONSTRAINT "episode_workspace_states_selected_voice_take_id_voice_takes_id_fk" FOREIGN KEY ("selected_voice_take_id") REFERENCES "public"."voice_takes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_workspace_states" ADD CONSTRAINT "episode_workspace_states_selected_caption_track_id_caption_tracks_id_fk" FOREIGN KEY ("selected_caption_track_id") REFERENCES "public"."caption_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_workspace_states" ADD CONSTRAINT "episode_workspace_states_selected_composition_id_compositions_id_fk" FOREIGN KEY ("selected_composition_id") REFERENCES "public"."compositions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "episode_workspace_states" AS "workspace"
SET "selected_voice_take_id" = (
	SELECT "take"."id"
	FROM "voice_takes" AS "take"
	WHERE "take"."script_id" = "workspace"."selected_script_id"
	ORDER BY "take"."created_at" DESC, "take"."id" DESC
	LIMIT 1
);--> statement-breakpoint
UPDATE "episode_workspace_states" AS "workspace"
SET "selected_caption_track_id" = (
	SELECT "track"."id"
	FROM "caption_tracks" AS "track"
	WHERE "track"."voice_take_id" = "workspace"."selected_voice_take_id"
	ORDER BY "track"."created_at" DESC, "track"."id" DESC
	LIMIT 1
);--> statement-breakpoint
UPDATE "episode_workspace_states" AS "workspace"
SET "selected_composition_id" = (
	SELECT "composition"."id"
	FROM "compositions" AS "composition"
	WHERE "composition"."episode_id" = "workspace"."episode_id"
	ORDER BY "composition"."created_at" DESC, "composition"."id" DESC
	LIMIT 1
);--> statement-breakpoint
CREATE INDEX "workspace_selected_voice_take" ON "episode_workspace_states" USING btree ("selected_voice_take_id");--> statement-breakpoint
CREATE INDEX "workspace_selected_caption_track" ON "episode_workspace_states" USING btree ("selected_caption_track_id");--> statement-breakpoint
CREATE INDEX "workspace_selected_composition" ON "episode_workspace_states" USING btree ("selected_composition_id");
