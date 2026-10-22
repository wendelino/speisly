-- Sync-Läufe, gruppierte Fehler, typisierte Gerichtsänderungen, Feedback mit
-- Typ und Status. Von drizzle-kit erzeugt und um die Übernahme der Altdaten
-- (meal_update, error_log) ergänzt.
CREATE TYPE "public"."feedback_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('contact', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('error', 'warn');--> statement-breakpoint
CREATE TYPE "public"."meal_change_field" AS ENUM('name', 'subtitle', 'img_path', 'price');--> statement-breakpoint
CREATE TYPE "public"."sync_scope" AS ENUM('today', 'week', 'midnight', 'warm');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"scope" "sync_scope" NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"range_from" date,
	"range_to" date,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"new_meals" integer DEFAULT 0 NOT NULL,
	"changed_meals" integer DEFAULT 0 NOT NULL,
	"new_servings" integer DEFAULT 0 NOT NULL,
	"removed_servings" integer DEFAULT 0 NOT NULL,
	"kept_servings" integer DEFAULT 0 NOT NULL,
	"images_created" integer DEFAULT 0 NOT NULL,
	"images_failed" integer DEFAULT 0 NOT NULL,
	"mass_removal" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "sync_run_started_at_idx" ON "sync_run" USING btree ("started_at");--> statement-breakpoint
CREATE TABLE "meal_change" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"meal_id" varchar(32) NOT NULL,
	"sync_run_id" varchar(32),
	"field" "meal_change_field" NOT NULL,
	"prev" jsonb NOT NULL,
	"next" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serving_removal" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"meal_id" varchar(32) NOT NULL,
	"mensa_id" varchar(32),
	"date" date NOT NULL,
	"sync_run_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_change" ADD CONSTRAINT "meal_change_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_change" ADD CONSTRAINT "meal_change_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_removal" ADD CONSTRAINT "serving_removal_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_removal" ADD CONSTRAINT "serving_removal_mensa_id_mensa_id_fk" FOREIGN KEY ("mensa_id") REFERENCES "public"."mensa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serving_removal" ADD CONSTRAINT "serving_removal_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_change_meal_id_idx" ON "meal_change" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "meal_change_sync_run_id_idx" ON "meal_change" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "serving_removal_meal_id_idx" ON "serving_removal" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "serving_removal_sync_run_id_idx" ON "serving_removal" USING btree ("sync_run_id");--> statement-breakpoint

-- Altdaten: meal_update → meal_change. Preise standen als "stud / work / guest"
-- (Cent) im Text, entfernte Ausgaben als key = 'remove' mit dem Tag in prev.
INSERT INTO "meal_change" ("id", "meal_id", "field", "prev", "next", "created_at")
SELECT
	u."id",
	u."meal_id",
	CASE u."key" WHEN 'imgPath' THEN 'img_path' ELSE u."key" END::"meal_change_field",
	CASE WHEN u."key" = 'price' THEN jsonb_build_object(
		'stud', split_part(u."prev", ' / ', 1)::integer,
		'work', split_part(u."prev", ' / ', 2)::integer,
		'guest', split_part(u."prev", ' / ', 3)::integer
	) ELSE to_jsonb(u."prev") END,
	CASE WHEN u."key" = 'price' THEN jsonb_build_object(
		'stud', split_part(u."new", ' / ', 1)::integer,
		'work', split_part(u."new", ' / ', 2)::integer,
		'guest', split_part(u."new", ' / ', 3)::integer
	) ELSE to_jsonb(u."new") END,
	u."created_at"
FROM "meal_update" u
WHERE u."key" IN ('name', 'subtitle', 'imgPath')
	OR (
		u."key" = 'price'
		AND u."prev" ~ '^\d+ / \d+ / \d+$'
		AND u."new" ~ '^\d+ / \d+ / \d+$'
	);--> statement-breakpoint
INSERT INTO "serving_removal" ("id", "meal_id", "date", "created_at")
SELECT u."id", u."meal_id", u."prev"::date, u."created_at"
FROM "meal_update" u
WHERE u."key" = 'remove' AND u."prev" ~ '^\d{4}-\d{2}-\d{2}$';--> statement-breakpoint
DROP TABLE "meal_update" CASCADE;--> statement-breakpoint

-- Altdaten: error_log wird zu einer Zeile je Meldung (Quelle "legacy").
-- ctx war Text; was kein gültiges JSON ist, wird als JSON-String übernommen.
ALTER TABLE "error_log" RENAME TO "error_log_legacy";--> statement-breakpoint
ALTER TABLE "error_log_legacy" RENAME CONSTRAINT "error_log_pkey" TO "error_log_legacy_pkey";--> statement-breakpoint
CREATE TABLE "error_log" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"fingerprint" varchar(32) NOT NULL,
	"level" "log_level" DEFAULT 'error' NOT NULL,
	"source" varchar(32) NOT NULL,
	"message" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ctx" jsonb,
	"last_sync_run_id" varchar(32),
	"notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "error_log_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_last_sync_run_id_sync_run_id_fk" FOREIGN KEY ("last_sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_log_last_seen_at_idx" ON "error_log" USING btree ("last_seen_at");--> statement-breakpoint
CREATE FUNCTION pg_temp.speisly_try_jsonb(value text) RETURNS jsonb
	LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
	RETURN value::jsonb;
EXCEPTION WHEN others THEN
	RETURN to_jsonb(value);
END;
$$;--> statement-breakpoint
INSERT INTO "error_log" ("id", "fingerprint", "source", "message", "count", "first_seen_at", "last_seen_at", "last_ctx")
SELECT
	md5('legacy:' || g."message"),
	md5('legacy:' || g."message"),
	'legacy',
	g."message",
	g."count",
	g."first_seen_at",
	g."last_seen_at",
	pg_temp.speisly_try_jsonb(g."last_ctx")
FROM (
	SELECT
		l."message",
		count(*)::integer AS "count",
		min(l."created_at") AS "first_seen_at",
		max(l."created_at") AS "last_seen_at",
		(array_agg(l."ctx" ORDER BY l."created_at" DESC))[1] AS "last_ctx"
	FROM "error_log_legacy" l
	GROUP BY l."message"
) g;--> statement-breakpoint
DROP TABLE "error_log_legacy";--> statement-breakpoint

-- Feedback: Typ und Status; created_at war ohne Zeitzone (Server in UTC)
ALTER TABLE "feedback" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "type" "feedback_type" DEFAULT 'feedback' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "status" "feedback_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "handled_at" timestamp with time zone;--> statement-breakpoint

-- Einzige Datenquelle (src/server/sync/types.ts: DATA_SOURCE_SLUG); der Sync
-- schlägt sie nicht mehr nach
INSERT INTO "data_source" ("id", "name", "slug")
VALUES (md5('meine-mensa-api'), 'Meine Mensa API', 'meine-mensa-api')
ON CONFLICT DO NOTHING;
