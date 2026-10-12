CREATE INDEX "mensa_meal_meal_id_date_idx" ON "mensa_meal" USING btree ("meal_id","date");--> statement-breakpoint
CREATE INDEX "user_ip_hash_idx" ON "user" USING btree ("ip_hash");