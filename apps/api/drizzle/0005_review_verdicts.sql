ALTER TABLE "reviews" DROP CONSTRAINT "reviews_score_range";--> statement-breakpoint
-- Reviews move from a 1-10 score to four verdicts stored as 1-4 (see src/lib/rating.ts):
-- 1-3 Skip, 4-6 Timepass, 7-8 Go for it, 9-10 Perfection. The review counter trigger
-- (0004) keeps media.club_score_sum in step with this update.
UPDATE "reviews" SET "score" = CASE
  WHEN "score" <= 3 THEN 1
  WHEN "score" <= 6 THEN 2
  WHEN "score" <= 8 THEN 3
  ELSE 4
END;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_score_range" CHECK ("reviews"."score" between 1 and 4);
