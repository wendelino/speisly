-- Rohe Antworten der Meine-Mensa-API je Abruf (src/server/sync/utils.ts).
CREATE TABLE "api_response" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"sync_run_id" varchar(32),
	"url" text NOT NULL,
	"status" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_response" ADD CONSTRAINT "api_response_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_response_sync_run_id_idx" ON "api_response" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "api_response_created_at_idx" ON "api_response" USING btree ("created_at");