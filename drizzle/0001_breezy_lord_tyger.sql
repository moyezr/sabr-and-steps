CREATE TABLE "source_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"resource_id" integer NOT NULL,
	"name" text NOT NULL,
	"author" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"expected_chapters" integer NOT NULL,
	"expected_verses" integer NOT NULL,
	"completed_chapters" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"metadata" jsonb NOT NULL,
	"rights_status" text DEFAULT 'not_cleared' NOT NULL,
	"rights_notes" text NOT NULL,
	"checksum" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_environment" CHECK ("source_imports"."environment" IN ('prelive','production')),
	CONSTRAINT "source_status" CHECK ("source_imports"."status" IN ('running','failed','completed')),
	CONSTRAINT "source_rights" CHECK ("source_imports"."rights_status" IN ('not_cleared','cleared')),
	CONSTRAINT "source_counts" CHECK ("source_imports"."expected_chapters" BETWEEN 1 AND 114 AND "source_imports"."expected_verses" BETWEEN 1 AND 6236)
);
--> statement-breakpoint
CREATE TABLE "source_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"reference" text NOT NULL,
	"chapter_name" text NOT NULL,
	"text" text NOT NULL,
	"arabic" text NOT NULL,
	"raw" jsonb NOT NULL,
	"checksum" text NOT NULL,
	CONSTRAINT "passage_reference" CHECK ("source_passages"."chapter" BETWEEN 1 AND 114 AND "source_passages"."verse" BETWEEN 1 AND 286 AND "source_passages"."reference" = "source_passages"."chapter"::text || ':' || "source_passages"."verse"::text)
);
--> statement-breakpoint
ALTER TABLE "source_passages" ADD CONSTRAINT "source_passages_import_id_source_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."source_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passage_import_reference" ON "source_passages" USING btree ("import_id","reference");--> statement-breakpoint
CREATE INDEX "passage_chapter" ON "source_passages" USING btree ("import_id","chapter","verse");