CREATE TABLE IF NOT EXISTS tool_content (
  tool_id         TEXT PRIMARY KEY REFERENCES managed_tools(tool_id) ON DELETE CASCADE,
  category        TEXT,
  keywords        TEXT[],
  seo_title       TEXT,
  seo_description TEXT,
  content_doc     JSONB,
  doc_version     INTEGER NOT NULL DEFAULT 1,
  published_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_icons (
  tool_id    TEXT PRIMARY KEY REFERENCES managed_tools(tool_id) ON DELETE CASCADE,
  public_id  TEXT        NOT NULL,
  version    TEXT        NOT NULL,
  format     TEXT        NOT NULL,
  width      INTEGER     NOT NULL,
  height     INTEGER     NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
