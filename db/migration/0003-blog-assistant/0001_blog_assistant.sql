BEGIN;
CREATE TABLE IF NOT EXISTS blog_threads (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES blog_posts(id),
  owner_id TEXT NOT NULL REFERENCES auth_users(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  settings JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(settings) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blog_threads_scope_unique UNIQUE(id, post_id, owner_id),
  CONSTRAINT blog_threads_owner_unique UNIQUE(id, owner_id)
);
CREATE INDEX IF NOT EXISTS blog_threads_owner_post_activity_idx ON blog_threads(owner_id,post_id,updated_at DESC,id);
CREATE TABLE IF NOT EXISTS blog_runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  post_id TEXT REFERENCES blog_posts(id),
  owner_id TEXT NOT NULL REFERENCES auth_users(id),
  client_request_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('generate','chat','rewrite','review','check_sources')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_response_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled','unknown')),
  request JSONB NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  snapshot_hash TEXT,
  response JSONB,
  continuation JSONB NOT NULL DEFAULT '{}',
  usage JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT blog_runs_request_unique UNIQUE(owner_id,client_request_id),
  CONSTRAINT blog_runs_thread_scope_fk FOREIGN KEY(thread_id,post_id,owner_id) REFERENCES blog_threads(id,post_id,owner_id),
  CONSTRAINT blog_runs_scope_check CHECK (
    (operation = 'generate' AND ((thread_id IS NULL AND post_id IS NULL AND status <> 'completed') OR (thread_id IS NOT NULL AND post_id IS NOT NULL))) OR
    (operation <> 'generate' AND thread_id IS NOT NULL AND post_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_runs_provider_response_unique ON blog_runs(provider,provider_response_id) WHERE provider_response_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS blog_runs_active_thread_unique ON blog_runs(thread_id) WHERE status IN ('queued','running','unknown') AND thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS blog_runs_thread_created_idx ON blog_runs(thread_id,created_at,id);
CREATE INDEX IF NOT EXISTS blog_runs_expiry_idx ON blog_runs(expires_at);
CREATE TABLE IF NOT EXISTS blog_attachments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES auth_users(id),
  provider TEXT NOT NULL,
  provider_file_id TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
  status TEXT NOT NULL CHECK(status IN ('uploading','ready','failed','deleting')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blog_attachments_thread_owner_fk FOREIGN KEY(thread_id,owner_id) REFERENCES blog_threads(id,owner_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_attachments_provider_file_unique ON blog_attachments(provider,provider_file_id) WHERE provider_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS blog_attachments_thread_idx ON blog_attachments(thread_id);
CREATE INDEX IF NOT EXISTS blog_attachments_expiry_idx ON blog_attachments(expires_at);
CREATE OR REPLACE FUNCTION protect_blog_run_provider() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider IS DISTINCT FROM OLD.provider OR NEW.model IS DISTINCT FROM OLD.model THEN
    RAISE EXCEPTION 'A run provider and model cannot change';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS blog_run_provider_immutable ON blog_runs;
CREATE TRIGGER blog_run_provider_immutable BEFORE UPDATE ON blog_runs FOR EACH ROW EXECUTE FUNCTION protect_blog_run_provider();
COMMIT;
