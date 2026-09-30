BEGIN;
CREATE TABLE IF NOT EXISTS download_policies (
  id TEXT PRIMARY KEY CHECK (id = 'default'), version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  guest_daily INTEGER NOT NULL CHECK (guest_daily BETWEEN 1 AND 1000000),
  guest_active INTEGER NOT NULL CHECK (guest_active BETWEEN 1 AND 250),
  guest_queued INTEGER NOT NULL CHECK (guest_queued BETWEEN 1 AND 10000),
  account_daily INTEGER NOT NULL CHECK (account_daily BETWEEN 1 AND 1000000),
  account_active INTEGER NOT NULL CHECK (account_active BETWEEN 1 AND 250),
  account_queued INTEGER NOT NULL CHECK (account_queued BETWEEN 1 AND 10000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO download_policies (id,guest_daily,guest_active,guest_queued,account_daily,account_active,account_queued)
VALUES ('default',10,1,2,10,1,2) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS download_jobs (
  id TEXT PRIMARY KEY, owner_kind TEXT NOT NULL CHECK (owner_kind IN ('guest','account')), owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL, input_hash TEXT NOT NULL, platform TEXT NOT NULL,
  source_url TEXT, quality TEXT NOT NULL CHECK (quality IN ('720','1080')), network_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','running','cancelling','succeeded','failed','cancelled','expired')),
  phase TEXT, generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  dispatch_version INTEGER NOT NULL DEFAULT 1 CHECK (dispatch_version > 0), dispatch_due_at TIMESTAMPTZ,
  next_eligible_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), queue_expires_at TIMESTAMPTZ NOT NULL,
  admission_policy_version INTEGER NOT NULL, budget JSONB NOT NULL, admission_day TEXT NOT NULL, admission_month TEXT NOT NULL,
  work_ms BIGINT NOT NULL DEFAULT 0 CHECK (work_ms >= 0), source_bytes BIGINT NOT NULL DEFAULT 0 CHECK (source_bytes >= 0),
  cost_micros BIGINT NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  engine_starts INTEGER NOT NULL DEFAULT 0 CHECK (engine_starts >= 0), error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ,
  CONSTRAINT download_jobs_owner_request_unique UNIQUE(owner_kind,owner_id,request_id)
);
CREATE INDEX IF NOT EXISTS download_jobs_dispatch_idx ON download_jobs(dispatch_due_at,next_eligible_at) WHERE state='queued';
CREATE INDEX IF NOT EXISTS download_jobs_owner_idx ON download_jobs(owner_kind,owner_id,created_at);
CREATE INDEX IF NOT EXISTS download_jobs_expiry_idx ON download_jobs(expires_at) WHERE state='succeeded';
CREATE TABLE IF NOT EXISTS download_quota_buckets (
  scope TEXT NOT NULL, period TEXT NOT NULL, admitted INTEGER NOT NULL DEFAULT 0 CHECK (admitted >= 0),
  queued INTEGER NOT NULL DEFAULT 0 CHECK (queued >= 0), active INTEGER NOT NULL DEFAULT 0 CHECK (active >= 0),
  reserved_bytes BIGINT NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0), reserved_cost_micros BIGINT NOT NULL DEFAULT 0 CHECK (reserved_cost_micros >= 0),
  PRIMARY KEY(scope,period)
);
CREATE TABLE IF NOT EXISTS download_slots (
  id TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  state TEXT NOT NULL DEFAULT 'idle' CHECK (state IN ('idle','busy','quarantined','draining')),
  attempt_id TEXT, lease_expires_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS download_attempts (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES download_jobs(id), generation INTEGER NOT NULL,
  slot_id TEXT NOT NULL REFERENCES download_slots(id), slot_generation INTEGER NOT NULL,
  execution_policy_version INTEGER NOT NULL, phase TEXT NOT NULL, deadline TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), stopped_at TIMESTAMPTZ,
  work_ms BIGINT NOT NULL DEFAULT 0 CHECK (work_ms >= 0), source_bytes BIGINT NOT NULL DEFAULT 0 CHECK (source_bytes >= 0),
  cost_micros BIGINT NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT download_attempts_job_generation_unique UNIQUE(job_id,generation)
);
CREATE UNIQUE INDEX IF NOT EXISTS download_attempts_live_slot_idx ON download_attempts(slot_id) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS download_attempts_stale_idx ON download_attempts(heartbeat_at) WHERE stopped_at IS NULL;
CREATE TABLE IF NOT EXISTS download_artifacts (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES download_jobs(id), attempt_id TEXT NOT NULL REFERENCES download_attempts(id),
  storage_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0), etag TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS download_artifacts_cleanup_idx ON download_artifacts(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS download_artifacts_job_idx ON download_artifacts(job_id);
-- Preserve saved policy and non-administrator grants on repeated deployment.
ALTER TABLE roles DISABLE TRIGGER roles_protect_system_update;
UPDATE roles SET access = access || '{"downloaders":{"view":true,"edit":true}}'::jsonb
WHERE id='admin' AND is_system=true AND NOT (access ? 'downloaders');
ALTER TABLE roles ENABLE TRIGGER roles_protect_system_update;
COMMIT;
