-- Farmer-confirmable stage choices for imported crops. Day ranges are left
-- unset until a locally verified crop calendar is available; this avoids a
-- false automatic estimate while still allowing the farmer to set the stage.
WITH stage_seed(crop_name, id, stage_name, display_order, visual_hint) AS (
    VALUES
      ('Chilli', '24111111-1111-4111-8111-111111111101'::uuid, 'Nursery', 1, 'Young plants are still in the nursery.'),
      ('Chilli', '24111111-1111-4111-8111-111111111102'::uuid, 'Establishment', 2, 'Recently transplanted plants are settling in.'),
      ('Chilli', '24111111-1111-4111-8111-111111111103'::uuid, 'Vegetative growth', 3, 'Leaves, branches and plant size are increasing.'),
      ('Chilli', '24111111-1111-4111-8111-111111111104'::uuid, 'Flowering', 4, 'Flowers are forming and opening.'),
      ('Chilli', '24111111-1111-4111-8111-111111111105'::uuid, 'Fruit development', 5, 'Chilli pods are forming and growing.'),
      ('Chilli', '24111111-1111-4111-8111-111111111106'::uuid, 'Harvesting', 6, 'Pods are reaching harvest condition.'),
      ('Maize', '24222222-2222-4222-8222-222222222201'::uuid, 'Germination', 1, 'Seedlings are emerging from the soil.'),
      ('Maize', '24222222-2222-4222-8222-222222222202'::uuid, 'Vegetative growth', 2, 'Leaves and stem are developing.'),
      ('Maize', '24222222-2222-4222-8222-222222222203'::uuid, 'Tasseling and silking', 3, 'Tassels and silks are visible.'),
      ('Maize', '24222222-2222-4222-8222-222222222204'::uuid, 'Grain filling', 4, 'Kernels are forming and filling.'),
      ('Maize', '24222222-2222-4222-8222-222222222205'::uuid, 'Maturity', 5, 'Cobs and plants are nearing harvest.'),
      ('Potato', '24333333-3333-4333-8333-333333333301'::uuid, 'Sprouting and emergence', 1, 'Shoots are emerging from planted tubers.'),
      ('Potato', '24333333-3333-4333-8333-333333333302'::uuid, 'Vegetative growth', 2, 'Leaves and stems are developing.'),
      ('Potato', '24333333-3333-4333-8333-333333333303'::uuid, 'Tuber initiation', 3, 'New tubers are beginning to form.'),
      ('Potato', '24333333-3333-4333-8333-333333333304'::uuid, 'Tuber bulking', 4, 'Tubers are increasing in size.'),
      ('Potato', '24333333-3333-4333-8333-333333333305'::uuid, 'Maturity', 5, 'The crop is nearing harvest.'),
      ('Tomato', '24444444-4444-4444-8444-444444444401'::uuid, 'Nursery', 1, 'Young plants are still in the nursery.'),
      ('Tomato', '24444444-4444-4444-8444-444444444402'::uuid, 'Establishment', 2, 'Recently transplanted plants are settling in.'),
      ('Tomato', '24444444-4444-4444-8444-444444444403'::uuid, 'Vegetative growth', 3, 'Leaves, branches and plant size are increasing.'),
      ('Tomato', '24444444-4444-4444-8444-444444444404'::uuid, 'Flowering', 4, 'Flowers are forming and opening.'),
      ('Tomato', '24444444-4444-4444-8444-444444444405'::uuid, 'Fruit development', 5, 'Tomatoes are forming and increasing in size.'),
      ('Tomato', '24444444-4444-4444-8444-444444444406'::uuid, 'Ripening and harvest', 6, 'Fruits are changing colour and reaching harvest condition.')
)
INSERT INTO growth_stages (id, crop_id, stage_name, days_after_plant_min, days_after_plant_max, display_order, visual_hint)
SELECT s.id, c.id, s.stage_name, NULL, NULL, s.display_order, s.visual_hint
FROM stage_seed s JOIN crops c ON c.name = s.crop_name
ON CONFLICT (crop_id, stage_name) DO UPDATE SET
    display_order = EXCLUDED.display_order,
    visual_hint = EXCLUDED.visual_hint;
