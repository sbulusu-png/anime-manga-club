ALTER TABLE "media" ADD COLUMN "club_verdict" smallint;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "club_verdict_by_id" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "club_verdict_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_club_verdict_by_id_users_id_fk" FOREIGN KEY ("club_verdict_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_club_verdict_range" CHECK ("media"."club_verdict" between 1 and 4);