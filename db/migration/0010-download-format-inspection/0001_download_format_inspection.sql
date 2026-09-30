BEGIN;
ALTER TABLE download_jobs ADD COLUMN IF NOT EXISTS inspect BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE download_jobs ADD COLUMN IF NOT EXISTS inspection JSONB;
ALTER TABLE download_jobs ADD COLUMN IF NOT EXISTS selected_format TEXT;
ALTER TABLE download_jobs DROP CONSTRAINT IF EXISTS download_jobs_state_check;
ALTER TABLE download_jobs ADD CONSTRAINT download_jobs_state_check
  CHECK (state IN ('queued','running','ready','cancelling','succeeded','failed','cancelled','expired'));
ALTER TABLE download_jobs DROP CONSTRAINT IF EXISTS download_jobs_inspection_check;
ALTER TABLE download_jobs ADD CONSTRAINT download_jobs_inspection_check
  CHECK (inspection IS NULL OR (jsonb_typeof(inspection)='object' AND octet_length(inspection::text)<=65536));
ALTER TABLE download_jobs DROP CONSTRAINT IF EXISTS download_jobs_selected_format_check;
ALTER TABLE download_jobs ADD CONSTRAINT download_jobs_selected_format_check
  CHECK (selected_format IS NULL OR (inspect AND selected_format ~ '^[A-Za-z0-9._-]{1,80}([+][A-Za-z0-9._-]{1,80})?$'));
ALTER TABLE download_jobs DROP CONSTRAINT IF EXISTS download_jobs_ready_check;
ALTER TABLE download_jobs ADD CONSTRAINT download_jobs_ready_check
  CHECK (state<>'ready' OR (inspect AND inspection IS NOT NULL AND expires_at IS NOT NULL AND selected_format IS NULL));
CREATE INDEX IF NOT EXISTS download_jobs_ready_expiry_idx ON download_jobs(expires_at) WHERE state='ready';
COMMIT;
