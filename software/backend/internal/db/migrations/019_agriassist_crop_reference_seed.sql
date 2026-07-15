-- Starter crop reference data for the AgriAssist crop setup flow.
-- IDs are deterministic so this seed remains idempotent across environments.

WITH crop_seed AS (
    SELECT
        '11111111-1111-4111-8111-111111111111'::uuid AS id,
        'Paddy / Rice'::text AS name
)
INSERT INTO crops (id, name, created_at)
SELECT id, name, NOW()
FROM crop_seed
ON CONFLICT (name) DO NOTHING;

WITH rice AS (
    SELECT id
    FROM crops
    WHERE name = 'Paddy / Rice'
),
stage_seed AS (
    SELECT *
    FROM (VALUES
        ('11111111-1111-4111-8111-111111111201'::uuid, 'Seedling', 0, 20, 1, 'Small young plants with early leaves.'),
        ('11111111-1111-4111-8111-111111111202'::uuid, 'Tillering', 21, 45, 2, 'More shoots appear from the base.'),
        ('11111111-1111-4111-8111-111111111203'::uuid, 'Panicle initiation', 46, 65, 3, 'The plant prepares to form grain heads.'),
        ('11111111-1111-4111-8111-111111111204'::uuid, 'Flowering', 66, 85, 4, 'Grain heads flower and need close attention.'),
        ('11111111-1111-4111-8111-111111111205'::uuid, 'Grain filling', 86, 110, 5, 'Grains develop and fill.'),
        ('11111111-1111-4111-8111-111111111206'::uuid, 'Maturity', 111, 140, 6, 'Crop is nearing harvest.')
    ) AS seed(id, stage_name, days_after_plant_min, days_after_plant_max, display_order, visual_hint)
)
INSERT INTO growth_stages (
    id,
    crop_id,
    stage_name,
    days_after_plant_min,
    days_after_plant_max,
    display_order,
    visual_hint,
    created_at
)
SELECT
    stage_seed.id,
    rice.id,
    stage_seed.stage_name,
    stage_seed.days_after_plant_min,
    stage_seed.days_after_plant_max,
    stage_seed.display_order,
    stage_seed.visual_hint,
    NOW()
FROM rice
CROSS JOIN stage_seed
ON CONFLICT (crop_id, stage_name) DO UPDATE
SET days_after_plant_min = EXCLUDED.days_after_plant_min,
    days_after_plant_max = EXCLUDED.days_after_plant_max,
    display_order = EXCLUDED.display_order,
    visual_hint = EXCLUDED.visual_hint;
