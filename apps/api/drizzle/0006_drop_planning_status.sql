-- "Plan to watch" is gone: the list is now Watching, Completed, Paused or Dropped.
DELETE FROM "list_entries" WHERE "status" = 'planning';--> statement-breakpoint
ALTER TABLE "list_entries" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."list_status";--> statement-breakpoint
CREATE TYPE "public"."list_status" AS ENUM('current', 'completed', 'paused', 'dropped');--> statement-breakpoint
ALTER TABLE "list_entries" ALTER COLUMN "status" SET DATA TYPE "public"."list_status" USING "status"::"public"."list_status";