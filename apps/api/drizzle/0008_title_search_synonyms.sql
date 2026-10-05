ALTER TABLE "media" ADD COLUMN "synonyms" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "search_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "media_search_key_trgm_index" ON "media" USING gin ("search_key" gin_trgm_ops);