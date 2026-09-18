DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'managed_tools_app_sort_order_unique'
      AND conrelid = 'managed_tools'::regclass
  ) THEN
    WITH ranked_tools AS (
      SELECT
        tool_id,
        ROW_NUMBER() OVER (
          PARTITION BY app
          ORDER BY sort_order, tool_id
        ) - 1 AS new_sort_order
      FROM managed_tools
    )
    UPDATE managed_tools
    SET sort_order = ranked_tools.new_sort_order
    FROM ranked_tools
    WHERE managed_tools.tool_id = ranked_tools.tool_id;

    ALTER TABLE managed_tools
      ADD CONSTRAINT managed_tools_app_sort_order_unique
      UNIQUE (app, sort_order);
  END IF;
END
$$;
