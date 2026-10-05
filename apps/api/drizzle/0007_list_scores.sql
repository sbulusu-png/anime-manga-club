ALTER TABLE "list_entries" ADD COLUMN "score" smallint;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_score_range" CHECK ("list_entries"."score" between 0 and 100);