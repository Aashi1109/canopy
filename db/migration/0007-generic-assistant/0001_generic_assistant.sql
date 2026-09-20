BEGIN;
-- Create fresh Assistant storage without copying legacy Blog Assistant data.
SELECT pg_advisory_xact_lock(hashtext(current_schema()), hashtext('0007-generic-assistant'));

CREATE TABLE IF NOT EXISTS assistant_threads (
  id TEXT PRIMARY KEY,
  integration_key TEXT NOT NULL,
  resource_id TEXT,
  owner_id TEXT NOT NULL REFERENCES auth_users(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'chat',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assistant_threads_type_check CHECK(type IN ('chat','inline')),
  CONSTRAINT assistant_threads_scope_unique UNIQUE(id, owner_id, integration_key),
  CONSTRAINT assistant_threads_resource_scope_unique UNIQUE(id, resource_id, owner_id, integration_key),
  CONSTRAINT assistant_threads_owner_unique UNIQUE(id, owner_id)
);
CREATE INDEX IF NOT EXISTS assistant_threads_owner_resource_activity_idx
  ON assistant_threads(owner_id, integration_key, resource_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS assistant_runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  integration_key TEXT NOT NULL,
  resource_id TEXT,
  owner_id TEXT NOT NULL REFERENCES auth_users(id),
  client_request_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_response_id TEXT,
  status TEXT NOT NULL,
  request JSONB NOT NULL,
  input_message_id TEXT,
  response JSONB,
  continuation JSONB NOT NULL DEFAULT '{}',
  usage JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT assistant_runs_request_unique UNIQUE(owner_id, integration_key, client_request_id),
  CONSTRAINT assistant_runs_thread_unique UNIQUE(id, thread_id),
  CONSTRAINT assistant_runs_thread_scope_fk
    FOREIGN KEY(thread_id, owner_id, integration_key) REFERENCES assistant_threads(id, owner_id, integration_key),
  CONSTRAINT assistant_runs_thread_resource_scope_fk
    FOREIGN KEY(thread_id, resource_id, owner_id, integration_key) REFERENCES assistant_threads(id, resource_id, owner_id, integration_key),
  CONSTRAINT assistant_runs_execution_mode_check CHECK(execution_mode IN ('conversational','standalone')),
  CONSTRAINT assistant_runs_status_check CHECK(status IN ('queued','running','completed','failed','cancelled','unknown'))
);
CREATE UNIQUE INDEX IF NOT EXISTS assistant_runs_provider_response_unique
  ON assistant_runs(provider, provider_response_id) WHERE provider_response_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assistant_runs_thread_created_idx ON assistant_runs(thread_id, created_at, id);
CREATE INDEX IF NOT EXISTS assistant_runs_resource_operation_idx ON assistant_runs(integration_key, resource_id, operation, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_runs_expiry_idx ON assistant_runs(expires_at);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES assistant_threads(id),
  run_id TEXT,
  role TEXT NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]',
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assistant_messages_thread_unique UNIQUE(id, thread_id),
  CONSTRAINT assistant_messages_run_scope_fk FOREIGN KEY(run_id, thread_id) REFERENCES assistant_runs(id, thread_id),
  CONSTRAINT assistant_messages_role_check CHECK(role IN ('user','assistant') AND (run_id IS NULL OR role = 'assistant')),
  CONSTRAINT assistant_messages_parts_check CHECK(jsonb_typeof(parts) = 'array'),
  CONSTRAINT assistant_messages_meta_check CHECK(jsonb_typeof(meta) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS assistant_messages_run_unique ON assistant_messages(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assistant_messages_thread_updated_idx ON assistant_messages(thread_id, updated_at);

-- Add the cyclic input-message relationship after both tables exist.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'assistant_runs'::regclass AND conname = 'assistant_runs_input_message_scope_fk') THEN
    ALTER TABLE assistant_runs ADD CONSTRAINT assistant_runs_input_message_scope_fk
      FOREIGN KEY(input_message_id, thread_id) REFERENCES assistant_messages(id, thread_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS assistant_attachments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  run_id TEXT,
  owner_id TEXT NOT NULL REFERENCES auth_users(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  data JSONB NOT NULL,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assistant_attachments_run_scope_fk FOREIGN KEY(run_id, thread_id) REFERENCES assistant_runs(id, thread_id),
  CONSTRAINT assistant_attachments_thread_owner_fk FOREIGN KEY(thread_id, owner_id) REFERENCES assistant_threads(id, owner_id),
  CONSTRAINT assistant_attachments_message_scope_fk FOREIGN KEY(message_id, thread_id) REFERENCES assistant_messages(id, thread_id),
  CONSTRAINT assistant_attachments_data_check CHECK(jsonb_typeof(data) = 'object'),
  CONSTRAINT assistant_attachments_status_check CHECK(status IN ('processing','ready','failed','deleting'))
);
CREATE UNIQUE INDEX IF NOT EXISTS assistant_attachments_run_unique ON assistant_attachments(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assistant_attachments_thread_idx ON assistant_attachments(owner_id, thread_id);
CREATE INDEX IF NOT EXISTS assistant_attachments_message_idx ON assistant_attachments(message_id);
CREATE INDEX IF NOT EXISTS assistant_attachments_expiry_idx ON assistant_attachments(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS assistant_attachments_deleting_idx ON assistant_attachments(updated_at) WHERE status = 'deleting';

-- Retire only the old private Assistant storage. Listing the tables together
-- handles their cyclic foreign keys without cascading to unrelated tables.
DROP TABLE IF EXISTS blog_attachments, blog_messages, blog_runs, blog_threads;
DROP FUNCTION IF EXISTS protect_blog_run_provider();
COMMIT;
