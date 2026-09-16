-- Preserve crop history while preventing multiple active crop instances
-- for the same field.

WITH ranked_active AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY field_id
            ORDER BY created_at DESC, updated_at DESC, id DESC
        ) AS active_rank
    FROM crop_instances
    WHERE active = true
)
UPDATE crop_instances ci
SET active = false,
    updated_at = NOW()
FROM ranked_active ranked
WHERE ci.id = ranked.id
  AND ranked.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crop_instances_one_active_per_field
    ON crop_instances(field_id)
    WHERE active = true;
