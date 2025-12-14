ALTER TABLE "mensa_meal" ADD COLUMN "ingredients" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mensa_meal" ADD COLUMN "extras" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mensa_meal" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "meal" DROP COLUMN "ingredients";--> statement-breakpoint
ALTER TABLE "meal" DROP COLUMN "extras";--> statement-breakpoint
ALTER TABLE "mensa_meal" DROP COLUMN "meal_hash";