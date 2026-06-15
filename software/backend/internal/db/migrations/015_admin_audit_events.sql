-- Immutable operational audit trail for system-administrator actions.

CREATE TABLE IF NOT EXISTS admin_audit_events (
    id UUID PRIMARY KEY,
    actor_user_id UUID,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    target_label TEXT,
    outcome TEXT NOT NULL DEFAULT 'SUCCESS',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created_at
    ON admin_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_action_created_at
    ON admin_audit_events(action, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_admin_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'admin audit events are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_events_immutable ON admin_audit_events;
CREATE TRIGGER admin_audit_events_immutable
BEFORE UPDATE OR DELETE ON admin_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_event_mutation();
