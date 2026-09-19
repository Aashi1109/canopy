BEGIN;
ALTER TABLE blog_runs DROP CONSTRAINT blog_runs_scope_check;
ALTER TABLE blog_runs ADD CONSTRAINT blog_runs_scope_check CHECK (
  (operation = 'generate' AND ((thread_id IS NULL AND post_id IS NULL AND status <> 'completed') OR (thread_id IS NOT NULL AND post_id IS NOT NULL))) OR
  (operation = 'rewrite' AND post_id IS NOT NULL) OR
  (operation IN ('chat','review','check_sources') AND thread_id IS NOT NULL AND post_id IS NOT NULL)
);
COMMIT;
