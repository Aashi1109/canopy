CREATE TABLE IF NOT EXISTS user_preferences (
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
