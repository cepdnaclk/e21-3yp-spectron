CREATE TABLE IF NOT EXISTS recommendation_rules (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    controller_id UUID REFERENCES controllers(id) ON DELETE CASCADE,
    sensor_id UUID REFERENCES sensors(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    operator TEXT NOT NULL,
    threshold_min DOUBLE PRECISION,
    threshold_max DOUBLE PRECISION,
    sustained_minutes INTEGER NOT NULL DEFAULT 60,
    risk_level TEXT NOT NULL DEFAULT 'MODERATE',
    action_recommendation TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_learning_state (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    controller_id UUID REFERENCES controllers(id) ON DELETE CASCADE,
    sensor_id UUID REFERENCES sensors(id) ON DELETE CASCADE,
    phase TEXT NOT NULL DEFAULT 'LEARNING',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    baseline_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    feedback TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_rules_account_active ON recommendation_rules(account_id, active);
CREATE INDEX IF NOT EXISTS idx_recommendation_rules_controller ON recommendation_rules(controller_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_learning_state_account ON recommendation_learning_state(account_id);
