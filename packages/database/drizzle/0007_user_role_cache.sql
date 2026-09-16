-- Cache keys use the user's timestamp. Advance it in the same transaction as
-- every authorization change, including CLI writes and cascading deletes.
CREATE OR REPLACE FUNCTION advance_user_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := GREATEST(NEW.updated_at, clock_timestamp()::timestamp,
    date_trunc('milliseconds', OLD.updated_at) + INTERVAL '1 millisecond');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auth_users_cache_timestamp ON auth_users;
CREATE TRIGGER auth_users_cache_timestamp
BEFORE UPDATE ON auth_users
FOR EACH ROW EXECUTE FUNCTION advance_user_cache_timestamp();

CREATE OR REPLACE FUNCTION invalidate_assigned_user_cache()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    -- Serialize new assignments with permission edits so their fan-out cannot
    -- miss a user that caches the old role while the edit is still uncommitted.
    PERFORM id FROM roles WHERE id = NEW.role_id FOR SHARE;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE auth_users SET updated_at = clock_timestamp() WHERE id = OLD.user_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE auth_users SET updated_at = clock_timestamp() WHERE id = NEW.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_roles_invalidate_cache ON user_roles;
CREATE TRIGGER user_roles_invalidate_cache
AFTER INSERT OR UPDATE OR DELETE ON user_roles
FOR EACH ROW EXECUTE FUNCTION invalidate_assigned_user_cache();

CREATE OR REPLACE FUNCTION invalidate_role_users_cache()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth_users SET updated_at = clock_timestamp()
  WHERE id IN (SELECT user_id FROM user_roles WHERE role_id = NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roles_invalidate_user_cache ON roles;
CREATE TRIGGER roles_invalidate_user_cache
AFTER UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION invalidate_role_users_cache();
