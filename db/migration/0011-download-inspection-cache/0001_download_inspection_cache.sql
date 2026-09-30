-- Build outside a transaction so existing downloader writes can continue.
CREATE INDEX CONCURRENTLY IF NOT EXISTS download_jobs_inspection_cache_idx
  ON download_jobs(input_hash, updated_at DESC)
  WHERE state='ready' AND inspect=true AND selected_format IS NULL;
