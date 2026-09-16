CREATE TABLE IF NOT EXISTS field_problems (
    id UUID PRIMARY KEY,
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    crop_instance_id UUID NOT NULL REFERENCES crop_instances(id) ON DELETE CASCADE,
    reported_by_user_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    observation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'needs_information', 'advice_ready', 'monitoring', 'resolved', 'reopened')),
    advisor_turn_count INTEGER NOT NULL DEFAULT 0
        CHECK (advisor_turn_count >= 0 AND advisor_turn_count <= 3),
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES users(id),
    resolution_helpful BOOLEAN,
    resolution_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT field_problem_title_not_blank CHECK (length(trim(title)) BETWEEN 3 AND 120),
    CONSTRAINT field_problem_observation_not_blank CHECK (length(trim(observation)) BETWEEN 3 AND 1000),
    CONSTRAINT field_problem_resolution_consistent CHECK (
        (status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL)
        OR (status <> 'resolved')
    )
);

CREATE INDEX IF NOT EXISTS idx_field_problems_field_status_created
    ON field_problems(field_id, status, created_at DESC);

ALTER TABLE advisor_recommendations
    ADD COLUMN IF NOT EXISTS problem_id UUID REFERENCES field_problems(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS turn_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_advisor_recommendations_problem_turn
    ON advisor_recommendations(problem_id, turn_number)
    WHERE problem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_advisor_recommendations_problem_created
    ON advisor_recommendations(problem_id, created_at)
    WHERE problem_id IS NOT NULL;
