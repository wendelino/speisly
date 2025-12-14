CREATE TABLE "data_source" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_source_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"data_source_slug" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"subtitle" varchar(255) DEFAULT '' NOT NULL,
	"img_path" varchar(500) NOT NULL,
	"ingredients" json,
	"extras" json,
	"price_stud" integer NOT NULL,
	"price_work" integer NOT NULL,
	"price_guest" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_rating" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"meal_id" varchar(32) NOT NULL,
	"mensa_meal_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"value" integer NOT NULL,
	"value_price" integer,
	"value_quantity" integer,
	"value_taste" integer,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_update" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"meal_id" varchar(32) NOT NULL,
	"prev" text NOT NULL,
	"new" text NOT NULL,
	"key" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensa" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensa_slug_unique" UNIQUE("slug"),
	CONSTRAINT "mensa_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "mensa_meal" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"mensa_id" varchar(32) NOT NULL,
	"meal_id" varchar(32) NOT NULL,
	"date" timestamp NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"auth" varchar(255) NOT NULL,
	"p256dh" varchar(255) NOT NULL,
	"user_id" varchar(32),
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"ip_hash" varchar(255) NOT NULL,
	"cookie_hash" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_data_source_slug_data_source_slug_fk" FOREIGN KEY ("data_source_slug") REFERENCES "public"."data_source"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rating" ADD CONSTRAINT "meal_rating_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rating" ADD CONSTRAINT "meal_rating_mensa_meal_id_mensa_meal_id_fk" FOREIGN KEY ("mensa_meal_id") REFERENCES "public"."mensa_meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rating" ADD CONSTRAINT "meal_rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_update" ADD CONSTRAINT "meal_update_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensa_meal" ADD CONSTRAINT "mensa_meal_mensa_id_mensa_id_fk" FOREIGN KEY ("mensa_id") REFERENCES "public"."mensa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensa_meal" ADD CONSTRAINT "mensa_meal_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_unique" ON "meal" USING btree ("name","data_source_slug","subtitle");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_rating_meal_user_idx" ON "meal_rating" USING btree ("meal_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mensa_meal_unique_idx" ON "mensa_meal" USING btree ("mensa_id","meal_id","date");--> statement-breakpoint
CREATE INDEX "mensa_meal_date_idx" ON "mensa_meal" USING btree ("date");--> statement-breakpoint
CREATE INDEX "mensa_meal_mensa_id_idx" ON "mensa_meal" USING btree ("mensa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_idx" ON "push_subscription" USING btree ("endpoint");