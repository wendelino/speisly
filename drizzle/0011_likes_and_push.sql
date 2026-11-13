-- Likes an Kommentaren und Web-Push-Abos für Favoriten
CREATE TABLE "comment_like" (
	"rating_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_like_rating_id_user_id_pk" PRIMARY KEY("rating_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" varchar(255) NOT NULL,
	"auth" varchar(255) NOT NULL,
	"favorites" varchar(32)[] DEFAULT '{}' NOT NULL,
	"mensa_ids" varchar(32)[] DEFAULT '{}' NOT NULL,
	"last_notified_for" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_rating_id_meal_rating_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."meal_rating"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_like_user_id_idx" ON "comment_like" USING btree ("user_id");