-- Neue Gerichte, Ausgaben und Mensen merken sich den Sync-Lauf, der sie
-- angelegt hat (src/server/sync/db.ts). Bestehende Zeilen bleiben ohne Lauf.
ALTER TABLE "meal" ADD COLUMN "sync_run_id" varchar(32);--> statement-breakpoint
ALTER TABLE "mensa" ADD COLUMN "sync_run_id" varchar(32);--> statement-breakpoint
ALTER TABLE "mensa_meal" ADD COLUMN "sync_run_id" varchar(32);--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensa" ADD CONSTRAINT "mensa_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensa_meal" ADD CONSTRAINT "mensa_meal_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_sync_run_id_idx" ON "meal" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "mensa_meal_sync_run_id_idx" ON "mensa_meal" USING btree ("sync_run_id");