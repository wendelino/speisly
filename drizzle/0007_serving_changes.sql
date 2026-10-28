-- Zutaten und Extras bestehender Ausgaben gleicht der Sync jetzt ab; Änderungen
-- landen in meal_change mit Bezug zur Ausgabe (src/server/sync/plan.ts).
ALTER TYPE "public"."meal_change_field" ADD VALUE 'ingredients';--> statement-breakpoint
ALTER TYPE "public"."meal_change_field" ADD VALUE 'extras';--> statement-breakpoint
ALTER TABLE "meal_change" ADD COLUMN "mensa_meal_id" varchar(32);--> statement-breakpoint
ALTER TABLE "sync_run" ADD COLUMN "changed_servings" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_change" ADD CONSTRAINT "meal_change_mensa_meal_id_mensa_meal_id_fk" FOREIGN KEY ("mensa_meal_id") REFERENCES "public"."mensa_meal"("id") ON DELETE set null ON UPDATE no action;