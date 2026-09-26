-- Keeps reviews.like_count and media.club_review_count / club_score_sum in step with
-- the rows they summarise. Triggers (rather than app code) also cover cascading
-- deletes, e.g. a deleted account's likes and reviews.

CREATE OR REPLACE FUNCTION review_likes_maintain_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reviews SET like_count = like_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reviews SET like_count = like_count - 1 WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER review_likes_maintain_count
AFTER INSERT OR DELETE ON review_likes
FOR EACH ROW EXECUTE FUNCTION review_likes_maintain_count();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reviews_maintain_club_stats() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE media
    SET club_review_count = club_review_count - 1, club_score_sum = club_score_sum - OLD.score
    WHERE id = OLD.media_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE media
    SET club_review_count = club_review_count + 1, club_score_sum = club_score_sum + NEW.score
    WHERE id = NEW.media_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reviews_maintain_club_stats
AFTER INSERT OR DELETE OR UPDATE OF score, media_id ON reviews
FOR EACH ROW EXECUTE FUNCTION reviews_maintain_club_stats();
--> statement-breakpoint
-- Backfill from any rows that existed before the triggers.
UPDATE reviews r
SET like_count = (SELECT count(*) FROM review_likes l WHERE l.review_id = r.id);
--> statement-breakpoint
UPDATE media m
SET club_review_count = s.review_count, club_score_sum = s.score_sum
FROM (
  SELECT m2.id, count(r.id)::int AS review_count, coalesce(sum(r.score), 0)::int AS score_sum
  FROM media m2 LEFT JOIN reviews r ON r.media_id = m2.id
  GROUP BY m2.id
) s
WHERE s.id = m.id;
