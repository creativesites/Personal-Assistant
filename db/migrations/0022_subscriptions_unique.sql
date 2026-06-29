-- Each user has exactly one subscription row; add unique constraint so
-- ON CONFLICT (user_id) in clerk-sync upserts is valid.
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
