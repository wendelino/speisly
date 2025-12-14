CREATE TABLE "error_log" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"ctx" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "meal_unique";--> statement-breakpoint
ALTER TABLE "meal" ADD COLUMN "src_id" varchar(32) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_src_id_unique" ON "meal" USING btree ("src_id","data_source_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_unique" ON "meal" USING btree ("name","data_source_slug","subtitle","img_path");