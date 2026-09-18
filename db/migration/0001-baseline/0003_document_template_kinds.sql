DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_templates_document_type_check'
      AND conrelid = 'invoice_templates'::regclass
  ) THEN
    ALTER TABLE invoice_templates
      ADD CONSTRAINT invoice_templates_document_type_check
      CHECK (
        document_type IN (
          'invoice',
          'receipt',
          'expense-report',
          'mileage-log',
          'quarterly-tax-estimator',
          'w9-request',
          '1099-nec-tracker'
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_templates_advanced_document_type_check'
      AND conrelid = 'invoice_templates'::regclass
  ) THEN
    ALTER TABLE invoice_templates
      ADD CONSTRAINT invoice_templates_advanced_document_type_check
      CHECK (layout_family = 'advanced' OR document_type = 'invoice') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_templates_default_published_check'
      AND conrelid = 'invoice_templates'::regclass
  ) THEN
    ALTER TABLE invoice_templates
      ADD CONSTRAINT invoice_templates_default_published_check
      CHECK (is_default = FALSE OR status = 'published') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM invoice_templates
    WHERE document_type NOT IN (
      'invoice',
      'receipt',
      'expense-report',
      'mileage-log',
      'quarterly-tax-estimator',
      'w9-request',
      '1099-nec-tracker'
    )
  ) THEN
    RAISE EXCEPTION 'invoice_templates contains an unsupported document_type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM invoice_templates
    WHERE layout_family <> 'advanced' AND document_type <> 'invoice'
  ) THEN
    RAISE EXCEPTION 'non-advanced templates must be invoice templates';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM invoice_templates
    WHERE is_default = TRUE AND status <> 'published'
  ) THEN
    RAISE EXCEPTION 'default templates must be published';
  END IF;
END
$$;

ALTER TABLE invoice_templates
  VALIDATE CONSTRAINT invoice_templates_document_type_check;
ALTER TABLE invoice_templates
  VALIDATE CONSTRAINT invoice_templates_advanced_document_type_check;
ALTER TABLE invoice_templates
  VALIDATE CONSTRAINT invoice_templates_default_published_check;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_templates_published_default_by_document_type_unique
  ON invoice_templates(document_type)
  WHERE is_default = TRUE AND status = 'published';

DROP INDEX IF EXISTS invoice_templates_published_default_unique;

CREATE INDEX IF NOT EXISTS invoice_templates_published_document_type_updated_idx
  ON invoice_templates(document_type, updated_at DESC)
  WHERE status = 'published';
