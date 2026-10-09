BEGIN;

ALTER TABLE managed_tools
  ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;

-- English copy is populated from the effective tool definition by db:seed.
-- Existing translations are retained when this migration is run again.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'managed_tools_translations_object_check'
      AND conrelid = 'managed_tools'::regclass
  ) THEN
    ALTER TABLE managed_tools ADD CONSTRAINT managed_tools_translations_object_check
      CHECK (jsonb_typeof(translations) = 'object');
  END IF;
END;
$$;

COMMIT;
