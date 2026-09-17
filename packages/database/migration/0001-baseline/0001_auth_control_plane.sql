CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS key_value_pairs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, key)
);

CREATE TABLE IF NOT EXISTS vendor_profiles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  entity_type TEXT NOT NULL DEFAULT 'Unknown',
  w9_status TEXT NOT NULL DEFAULT 'Not Requested',
  notes TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, id)
);

CREATE TABLE IF NOT EXISTS invoice_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  layout_family TEXT NOT NULL,
  config JSONB NOT NULL,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  required_plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, account_id)
);
CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON auth_accounts(user_id);

CREATE TABLE IF NOT EXISTS auth_verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON auth_verifications(identifier);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  access JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS managed_tools (
  tool_id TEXT PRIMARY KEY,
  app TEXT NOT NULL CHECK (app IN ('paperwork', 'devtools')),
  slug TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(app, slug)
);

CREATE TABLE IF NOT EXISTS feature_overrides (
  key TEXT NOT NULL,
  app TEXT NOT NULL CHECK (app IN ('paperwork', 'devtools')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY(app, key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);

INSERT INTO roles (id, name, description, access, is_system)
VALUES
  (
    'user',
    'User',
    'Default role assigned to every account. Does not grant access to the Admin application.',
    '{}'::jsonb,
    TRUE
  ),
  (
    'admin',
    'Admin',
    'Protected operational role for managing SmartTools, users, roles, templates, features, and audit history.',
    '{"admin":{"enter":true},"tools":{"view":true,"edit":true,"toggle":true,"archive":true},"templates":{"view":true,"create":true,"edit":true,"publish":true,"archive":true},"features":{"view":true,"edit":true,"toggle":true},"users":{"view":true,"suspend":true,"assignRoles":true},"roles":{"view":true,"create":true,"edit":true,"delete":true},"audit":{"view":true}}'::jsonb,
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT id, 'user' FROM auth_users
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION assign_default_user_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_roles (user_id, role_id)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auth_users_assign_default_role ON auth_users;
CREATE TRIGGER auth_users_assign_default_role
AFTER INSERT ON auth_users
FOR EACH ROW
EXECUTE FUNCTION assign_default_user_role();

INSERT INTO managed_tools (tool_id, app, slug, name, description, sort_order, enabled, archived)
VALUES
  ('paperwork.invoice-generator', 'paperwork', 'invoice-generator', 'Invoice Generator', 'Create printable invoices with reusable business details and themes.', 0, TRUE, FALSE),
  ('paperwork.receipt-generator', 'paperwork', 'receipt-generator', 'Receipt Generator', 'Create clean receipts for payments and completed invoices.', 1, TRUE, FALSE),
  ('paperwork.expense-report', 'paperwork', 'expense-report', 'Expense Report Generator', 'Organize expenses into a printable reimbursement report.', 2, TRUE, FALSE),
  ('paperwork.mileage-log', 'paperwork', 'mileage-log', 'Mileage Log Tracker', 'Track business mileage and calculate deductible amounts.', 3, TRUE, FALSE),
  ('paperwork.quarterly-tax-estimator', 'paperwork', 'quarterly-tax-estimator', 'Quarterly Tax Estimator', 'Estimate quarterly US self-employment and income taxes.', 4, TRUE, FALSE),
  ('paperwork.w9-request', 'paperwork', 'w9-request', 'W-9 Request Template', 'Collect contractor details and prepare W-9 requests.', 5, TRUE, FALSE),
  ('paperwork.1099-nec-tracker', 'paperwork', '1099-nec-tracker', '1099-NEC Tracker', 'Track contractor payments and year-end reporting thresholds.', 6, TRUE, FALSE),
  ('devtools.json-formatter', 'devtools', 'json-formatter', 'JSON Formatter', 'Format, minify, validate, and inspect JSON locally.', 0, TRUE, FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_templates_slug_unique
  ON invoice_templates(slug);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_templates_published_default_unique
  ON invoice_templates(document_type)
  WHERE is_default = TRUE AND status = 'published';

CREATE OR REPLACE FUNCTION prevent_system_role_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System roles are protected';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roles_protect_system_update ON roles;
CREATE TRIGGER roles_protect_system_update
BEFORE UPDATE ON roles
FOR EACH ROW
WHEN (OLD.is_system)
EXECUTE FUNCTION prevent_system_role_changes();

DROP TRIGGER IF EXISTS roles_protect_system_delete ON roles;
CREATE TRIGGER roles_protect_system_delete
BEFORE DELETE ON roles
FOR EACH ROW
WHEN (OLD.is_system)
EXECUTE FUNCTION prevent_system_role_changes();

CREATE OR REPLACE FUNCTION prevent_saved_tool_slug_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.slug IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Tool slug is immutable after setup';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS managed_tools_immutable_slug ON managed_tools;
CREATE TRIGGER managed_tools_immutable_slug
BEFORE UPDATE ON managed_tools
FOR EACH ROW
EXECUTE FUNCTION prevent_saved_tool_slug_change();

CREATE OR REPLACE FUNCTION prevent_final_admin_assignment_removal()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role_id = 'admin'
    AND (
      (SELECT COUNT(*) FROM user_roles WHERE role_id = 'admin') <= 1
      OR (
        EXISTS (
          SELECT 1 FROM auth_users
          WHERE id = OLD.user_id AND status = 'active'
        )
        AND (
          SELECT COUNT(*)
          FROM auth_users au
          JOIN user_roles ur ON ur.user_id = au.id
          WHERE ur.role_id = 'admin' AND au.status = 'active'
        ) <= 1
      )
    ) THEN
    RAISE EXCEPTION 'The final Admin cannot be removed';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_roles_keep_final_admin ON user_roles;
CREATE TRIGGER user_roles_keep_final_admin
BEFORE DELETE ON user_roles
FOR EACH ROW
EXECUTE FUNCTION prevent_final_admin_assignment_removal();

CREATE OR REPLACE FUNCTION prevent_final_active_admin_suspension()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'active'
    AND NEW.status = 'suspended'
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = OLD.id AND role_id = 'admin'
    )
    AND (
      SELECT COUNT(*)
      FROM auth_users au
      JOIN user_roles ur ON ur.user_id = au.id
      WHERE ur.role_id = 'admin' AND au.status = 'active'
    ) <= 1 THEN
    RAISE EXCEPTION 'The final Admin cannot be suspended';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auth_users_keep_final_active_admin ON auth_users;
CREATE TRIGGER auth_users_keep_final_active_admin
BEFORE UPDATE OF status ON auth_users
FOR EACH ROW
EXECUTE FUNCTION prevent_final_active_admin_suspension();
