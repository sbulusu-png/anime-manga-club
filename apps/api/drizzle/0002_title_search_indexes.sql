CREATE INDEX "media_title_romaji_trgm_index" ON "media" USING gin ("title_romaji" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_title_english_trgm_index" ON "media" USING gin ("title_english" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_title_native_trgm_index" ON "media" USING gin ("title_native" gin_trgm_ops);