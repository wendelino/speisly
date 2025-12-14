ALTER TABLE "push_subscription" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "push_subscription" CASCADE;--> statement-breakpoint
ALTER TABLE "meal" ALTER COLUMN "img_path" DROP NOT NULL;