BEGIN;

-- Match JavaScript encodeURIComponent, including UTF-8 public IDs.
CREATE OR REPLACE FUNCTION pg_temp.encode_icon_uri_component(value TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  bytes BYTEA := convert_to(value, 'UTF8');
  encoded TEXT := '';
  byte INTEGER;
BEGIN
  FOR i IN 0..octet_length(bytes) - 1 LOOP
    byte := get_byte(bytes, i);
    IF chr(byte) ~ '^[A-Za-z0-9_.!~*''()-]$' THEN
      encoded := encoded || chr(byte);
    ELSE
      encoded := encoded || '%' || upper(lpad(to_hex(byte), 2, '0'));
    END IF;
  END LOOP;
  RETURN encoded;
END;
$$;

ALTER TABLE managed_tools ADD COLUMN IF NOT EXISTS icon_url TEXT;

DO $$
DECLARE
  cloud_name TEXT := nullif(btrim(current_setting('canopy.cloudinary_cloud_name', true)), '');
BEGIN
  IF to_regclass('tool_icons') IS NULL THEN
    RETURN;
  END IF;

  -- Prevent writes racing the copy and subsequent table removal.
  LOCK TABLE tool_icons IN ACCESS EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1 FROM tool_icons AS icons
    JOIN managed_tools AS tools USING (tool_id)
    WHERE tools.icon_url IS NULL
  ) THEN
    IF cloud_name IS NULL THEN
      RAISE EXCEPTION 'Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or CLOUDINARY_CLOUD_NAME to backfill existing tool icons';
    END IF;

    UPDATE managed_tools AS tools
    SET icon_url = 'https://res.cloudinary.com/' || pg_temp.encode_icon_uri_component(cloud_name)
      || '/image/upload/f_png,c_fill,w_256,h_256,q_auto/v' || pg_temp.encode_icon_uri_component(icons.version)
      || '/' || (
        SELECT string_agg(pg_temp.encode_icon_uri_component(part), '/' ORDER BY position)
        FROM unnest(string_to_array(icons.public_id, '/')) WITH ORDINALITY AS segments(part, position)
      ) || '.png'
    FROM tool_icons AS icons
    WHERE tools.tool_id = icons.tool_id AND tools.icon_url IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM tool_icons AS icons
    LEFT JOIN managed_tools AS tools USING (tool_id)
    WHERE tools.icon_url IS NULL
  ) THEN
    RAISE EXCEPTION 'Tool icon backfill incomplete; legacy table retained';
  END IF;

  DROP TABLE tool_icons;
END;
$$;

DROP FUNCTION pg_temp.encode_icon_uri_component(TEXT);
COMMIT;
