ALTER TABLE "media" ADD COLUMN "country" text;--> statement-breakpoint
CREATE INDEX "media_type_country_popularity_index" ON "media" USING btree ("type","country","popularity" DESC NULLS LAST);