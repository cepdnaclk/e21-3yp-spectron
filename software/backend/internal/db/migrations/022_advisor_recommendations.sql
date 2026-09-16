CREATE TABLE IF NOT EXISTS advisor_recommendations (
    id UUID PRIMARY KEY,
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    crop_instance_id UUID NOT NULL REFERENCES crop_instances(id) ON DELETE CASCADE,
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    observation TEXT NOT NULL,
    sensor_summary TEXT NOT NULL,
    weather_summary TEXT NOT NULL,
    knowledge_entry_ids UUID[] NOT NULL DEFAULT '{}',
    result_json JSONB NOT NULL,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT advisor_observation_not_blank CHECK (length(trim(observation)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_advisor_recommendations_field_created
    ON advisor_recommendations(field_id, created_at DESC);

CREATE TABLE IF NOT EXISTS advisor_feedback (
    recommendation_id UUID NOT NULL REFERENCES advisor_recommendations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    helpful BOOLEAN NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (recommendation_id, user_id)
);
