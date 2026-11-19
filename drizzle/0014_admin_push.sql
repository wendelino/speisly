-- Web-Push-Abos der Admins (Fehlermeldungen, neue Kommentare)
CREATE TABLE "admin_push_subscription" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" varchar(255) NOT NULL,
	"auth" varchar(255) NOT NULL,
	"admin_sub" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_push_subscription_endpoint_unique" UNIQUE("endpoint")
);
