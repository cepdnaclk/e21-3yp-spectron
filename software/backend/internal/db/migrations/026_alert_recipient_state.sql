-- Alerts are shared Farm events, while read/dismiss state belongs to each
-- customer. Backfill active Farm members so existing alerts follow the same
-- recipient model as newly generated events.
INSERT INTO alert_recipients (alert_id,user_id,read_at,created_at)
SELECT a.id,fa.user_id,a.acknowledged_at,a.created_at
FROM alerts a
JOIN farm_access fa ON fa.farm_id=a.farm_id AND fa.revoked_at IS NULL
WHERE a.farm_id IS NOT NULL
ON CONFLICT (alert_id,user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_alerts_source_ref
    ON alerts(source_ref)
    WHERE source_ref IS NOT NULL;
