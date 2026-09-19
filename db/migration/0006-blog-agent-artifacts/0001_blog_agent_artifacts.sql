BEGIN;
ALTER TABLE blog_attachments ADD COLUMN IF NOT EXISTS run_id TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_attachments_run_scope_fk') THEN
    ALTER TABLE blog_attachments ADD CONSTRAINT blog_attachments_run_scope_fk FOREIGN KEY (run_id, thread_id) REFERENCES blog_runs(id, thread_id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS blog_attachments_run_unique ON blog_attachments(run_id) WHERE run_id IS NOT NULL;
ALTER TABLE blog_runs DROP CONSTRAINT IF EXISTS blog_runs_operation_check;
ALTER TABLE blog_runs ADD CONSTRAINT blog_runs_operation_check CHECK (operation IN ('generate','chat','rewrite','review','check_sources','agent'));
ALTER TABLE blog_runs DROP CONSTRAINT IF EXISTS blog_runs_scope_check;
COMMIT;
