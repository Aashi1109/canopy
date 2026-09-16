BEGIN;

CREATE TABLE IF NOT EXISTS blog_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CONSTRAINT blog_categories_name_check CHECK (length(trim(name)) BETWEEN 1 AND 100),
  slug TEXT NOT NULL CONSTRAINT blog_categories_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 160),
  created_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_categories_slug_unique ON blog_categories(slug);
CREATE UNIQUE INDEX IF NOT EXISTS blog_categories_name_unique ON blog_categories(lower(name));

CREATE TABLE IF NOT EXISTS blog_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CONSTRAINT blog_tags_name_check CHECK (length(trim(name)) BETWEEN 1 AND 100),
  slug TEXT NOT NULL CONSTRAINT blog_tags_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 160),
  created_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_tags_slug_unique ON blog_tags(slug);
CREATE UNIQUE INDEX IF NOT EXISTS blog_tags_name_unique ON blog_tags(lower(name));

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL CONSTRAINT blog_posts_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 160),
  draft_document JSONB NOT NULL CONSTRAINT blog_posts_document_check CHECK (jsonb_typeof(draft_document) = 'object'),
  draft_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  revision_sequence INTEGER NOT NULL DEFAULT 0,
  draft_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  draft_updated_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  last_checkpoint_at TIMESTAMPTZ,
  published_revision_id TEXT,
  first_published_at TIMESTAMPTZ,
  published_updated_at TIMESTAMPTZ,
  published_category_id TEXT REFERENCES blog_categories(id),
  published_search TSVECTOR,
  created_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trashed_at TIMESTAMPTZ,
  CONSTRAINT blog_posts_version_check CHECK (version > 0 AND revision_sequence >= 0),
  CONSTRAINT blog_posts_trash_check CHECK (trashed_at IS NULL OR published_revision_id IS NULL),
  CONSTRAINT blog_posts_publication_check CHECK (
    published_revision_id IS NULL OR (
      published_category_id IS NOT NULL AND first_published_at IS NOT NULL AND published_updated_at IS NOT NULL
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_unique ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON blog_posts(first_published_at DESC, id DESC)
  WHERE published_revision_id IS NOT NULL AND trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS blog_posts_category_published_idx ON blog_posts(published_category_id, first_published_at DESC, id DESC)
  WHERE published_revision_id IS NOT NULL AND trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS blog_posts_search_idx ON blog_posts USING GIN(published_search)
  WHERE published_revision_id IS NOT NULL AND trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS blog_posts_admin_idx ON blog_posts(updated_at DESC, id DESC) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS blog_posts_trash_idx ON blog_posts(trashed_at DESC, id DESC) WHERE trashed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS blog_revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES blog_posts(id),
  revision_number INTEGER NOT NULL CONSTRAINT blog_revisions_number_check CHECK (revision_number > 0),
  document JSONB NOT NULL CONSTRAINT blog_revisions_document_check CHECK (jsonb_typeof(document) = 'object'),
  content_hash TEXT NOT NULL,
  reason TEXT NOT NULL CONSTRAINT blog_revisions_reason_check CHECK (reason IN ('create', 'autosave', 'manual_save', 'publish', 'schedule', 'restore_backup', 'restore')),
  source_revision_id TEXT,
  created_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blog_revisions_post_number_unique UNIQUE(post_id, revision_number),
  CONSTRAINT blog_revisions_post_id_unique UNIQUE(post_id, id),
  CONSTRAINT blog_revisions_source_revision_fk FOREIGN KEY(post_id, source_revision_id) REFERENCES blog_revisions(post_id, id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'blog_posts'::regclass AND conname = 'blog_posts_published_revision_fk'
  ) THEN
    ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_published_revision_fk
      FOREIGN KEY(id, published_revision_id) REFERENCES blog_revisions(post_id, id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS blog_published_post_tags (
  post_id TEXT NOT NULL REFERENCES blog_posts(id),
  tag_id TEXT NOT NULL REFERENCES blog_tags(id),
  PRIMARY KEY(post_id, tag_id)
);
CREATE INDEX IF NOT EXISTS blog_published_post_tags_tag_idx ON blog_published_post_tags(tag_id, post_id);

CREATE TABLE IF NOT EXISTS blog_post_schedules (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES blog_posts(id),
  revision_id TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  scheduled_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  CONSTRAINT blog_post_schedules_post_unique UNIQUE(post_id),
  CONSTRAINT blog_post_schedules_revision_fk FOREIGN KEY(post_id, revision_id) REFERENCES blog_revisions(post_id, id)
);
CREATE INDEX IF NOT EXISTS blog_post_schedules_due_idx ON blog_post_schedules(scheduled_at, id);

CREATE OR REPLACE FUNCTION prevent_blog_slug_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Blog slug is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_posts_immutable_slug ON blog_posts;
CREATE TRIGGER blog_posts_immutable_slug
BEFORE UPDATE OF slug ON blog_posts
FOR EACH ROW EXECUTE FUNCTION prevent_blog_slug_change();

-- The table lock from ALTER TABLE lasts until COMMIT, so other sessions cannot
-- modify protected roles while this migration temporarily disables the trigger.
ALTER TABLE roles DISABLE TRIGGER roles_protect_system_update;
UPDATE roles
SET access = jsonb_set(
    access,
    '{blog}',
    COALESCE(access->'blog', '{}'::jsonb) || '{"view":true,"create":true,"edit":true,"publish":true,"archive":true}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'admin'
  AND NOT (access @> '{"blog":{"view":true,"create":true,"edit":true,"publish":true,"archive":true}}'::jsonb);
ALTER TABLE roles ENABLE TRIGGER roles_protect_system_update;

COMMIT;
