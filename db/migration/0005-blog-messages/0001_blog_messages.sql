BEGIN;
-- Additive migration: previous assistant migrations may already be applied.
ALTER TABLE blog_threads ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE blog_threads DROP CONSTRAINT IF EXISTS blog_threads_type_check;
ALTER TABLE blog_threads ADD CONSTRAINT blog_threads_type_check CHECK (type IN ('chat','inline'));
DROP INDEX IF EXISTS blog_runs_active_thread_unique;
CREATE INDEX IF NOT EXISTS blog_runs_post_generation_idx ON blog_runs(post_id,created_at DESC) WHERE operation='generate';
DROP TRIGGER IF EXISTS blog_run_provider_immutable ON blog_runs;
DROP FUNCTION IF EXISTS protect_blog_run_provider();
ALTER TABLE blog_runs ADD COLUMN IF NOT EXISTS input_message_id TEXT;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='blog_runs'::regclass AND conname='blog_runs_thread_unique') THEN
    ALTER TABLE blog_runs ADD CONSTRAINT blog_runs_thread_unique UNIQUE (id,thread_id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS blog_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES blog_threads(id),
  run_id TEXT,
  role TEXT NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]',
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blog_messages_thread_unique UNIQUE(id,thread_id),
  CONSTRAINT blog_messages_role_check CHECK(role IN ('user','assistant') AND (run_id IS NULL OR role = 'assistant')),
  CONSTRAINT blog_messages_parts_check CHECK(jsonb_typeof(parts) = 'array'),
  CONSTRAINT blog_messages_meta_check CHECK(jsonb_typeof(meta) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_messages_run_unique ON blog_messages(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS blog_messages_thread_updated_idx ON blog_messages(thread_id,updated_at);
ALTER TABLE blog_messages DROP CONSTRAINT IF EXISTS blog_messages_run_scope_fk;
ALTER TABLE blog_messages ADD CONSTRAINT blog_messages_run_scope_fk FOREIGN KEY(run_id,thread_id) REFERENCES blog_runs(id,thread_id);
ALTER TABLE blog_runs DROP CONSTRAINT IF EXISTS blog_runs_input_message_scope_fk;
ALTER TABLE blog_runs ADD CONSTRAINT blog_runs_input_message_scope_fk FOREIGN KEY(input_message_id,thread_id) REFERENCES blog_messages(id,thread_id);

-- This development-only schema migration deliberately has no data backfill.
-- Required attachment columns below fail safely if old attachment rows remain.
ALTER TABLE blog_attachments ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE blog_attachments ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE blog_attachments ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE blog_attachments ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE blog_attachments DROP CONSTRAINT IF EXISTS blog_attachments_status_check;
ALTER TABLE blog_attachments ADD CONSTRAINT blog_attachments_status_check CHECK(status IN ('processing','ready','failed','deleting'));
ALTER TABLE blog_attachments ALTER COLUMN type SET NOT NULL;
ALTER TABLE blog_attachments ALTER COLUMN label SET NOT NULL;
ALTER TABLE blog_attachments ALTER COLUMN data SET NOT NULL;
ALTER TABLE blog_attachments ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE blog_attachments DROP CONSTRAINT IF EXISTS blog_attachments_data_check;
ALTER TABLE blog_attachments ADD CONSTRAINT blog_attachments_data_check CHECK(jsonb_typeof(data)='object');
ALTER TABLE blog_attachments DROP CONSTRAINT IF EXISTS blog_attachments_message_scope_fk;
ALTER TABLE blog_attachments ADD CONSTRAINT blog_attachments_message_scope_fk FOREIGN KEY(message_id,thread_id) REFERENCES blog_messages(id,thread_id);
DROP INDEX IF EXISTS blog_attachments_provider_file_unique;
ALTER TABLE blog_attachments DROP COLUMN IF EXISTS provider;
ALTER TABLE blog_attachments DROP COLUMN IF EXISTS provider_file_id;
ALTER TABLE blog_attachments DROP COLUMN IF EXISTS filename;
ALTER TABLE blog_attachments DROP COLUMN IF EXISTS mime_type;
ALTER TABLE blog_attachments DROP COLUMN IF EXISTS size_bytes;
DROP INDEX IF EXISTS blog_attachments_thread_idx;
CREATE INDEX blog_attachments_thread_idx ON blog_attachments(owner_id,thread_id);
CREATE INDEX IF NOT EXISTS blog_attachments_message_idx ON blog_attachments(message_id);
DROP INDEX IF EXISTS blog_attachments_expiry_idx;
CREATE INDEX blog_attachments_expiry_idx ON blog_attachments(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS blog_attachments_deleting_idx ON blog_attachments(updated_at) WHERE status='deleting';
ALTER TABLE blog_runs DROP COLUMN IF EXISTS snapshot_hash;

-- Input-message roles are checked by the application; composite FKs enforce thread scope.
COMMIT;
