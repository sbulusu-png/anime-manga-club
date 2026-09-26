ALTER TABLE "reviews" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "club_review_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "club_score_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "reviews_created_at_id_index" ON "reviews" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reviews_like_count_id_index" ON "reviews" USING btree ("like_count" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reviews_media_id_like_count_id_index" ON "reviews" USING btree ("media_id","like_count" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_like_count_non_negative" CHECK ("reviews"."like_count" >= 0);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_club_stats_non_negative" CHECK ("media"."club_review_count" >= 0 and "media"."club_score_sum" >= 0);