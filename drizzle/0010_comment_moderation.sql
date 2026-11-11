-- Kommentare zu Bewertungen werden moderiert (/admin/comments). Bestehende
-- Kommentare landen als "pending" in der Warteschlange.
CREATE TYPE "public"."comment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "meal_rating" ADD COLUMN "comment_status" "comment_status";--> statement-breakpoint
ALTER TABLE "meal_rating" ADD COLUMN "comment_moderated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "meal_rating_comment_status_idx" ON "meal_rating" USING btree ("comment_status");--> statement-breakpoint
UPDATE "meal_rating" SET "comment_status" = 'pending' WHERE "comment" IS NOT NULL AND btrim("comment") <> '';
