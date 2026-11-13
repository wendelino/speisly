-- Bewertungen von Ausgaben entkoppeln: Mensa und Tag stehen in der Bewertung,
-- entfernt der Sync die Ausgabe, wird mensa_meal_id NULL statt die Bewertung
-- zu löschen.
ALTER TABLE "meal_rating" DROP CONSTRAINT "meal_rating_mensa_meal_id_mensa_meal_id_fk";
--> statement-breakpoint
ALTER TABLE "meal_rating" ALTER COLUMN "mensa_meal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rating" ADD COLUMN "mensa_id" varchar(32);--> statement-breakpoint
ALTER TABLE "meal_rating" ADD COLUMN "serving_date" timestamp;--> statement-breakpoint
-- bisher hing jede Bewertung an einer bestehenden Ausgabe (Cascade)
UPDATE "meal_rating" AS r
SET "mensa_id" = mm."mensa_id", "serving_date" = mm."date"
FROM "mensa_meal" AS mm
WHERE mm."id" = r."mensa_meal_id";--> statement-breakpoint
-- Sicherheitsnetz für Zeilen ohne Ausgabe (sollte es nicht geben)
UPDATE "meal_rating" SET "serving_date" = date_trunc('day', "created_at")
WHERE "serving_date" IS NULL;--> statement-breakpoint
ALTER TABLE "meal_rating" ALTER COLUMN "serving_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rating" ADD CONSTRAINT "meal_rating_mensa_id_mensa_id_fk" FOREIGN KEY ("mensa_id") REFERENCES "public"."mensa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rating" ADD CONSTRAINT "meal_rating_mensa_meal_id_mensa_meal_id_fk" FOREIGN KEY ("mensa_meal_id") REFERENCES "public"."mensa_meal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_rating_mensa_meal_id_idx" ON "meal_rating" USING btree ("mensa_meal_id");
