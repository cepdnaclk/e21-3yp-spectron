-- Persist distance-trigger attendance state so cooldown and counts survive restarts.

CREATE TABLE IF NOT EXISTS distance_attendance_state (
    sensor_id UUID PRIMARY KEY REFERENCES sensors(id) ON DELETE CASCADE,
    attendance_count BIGINT NOT NULL DEFAULT 0 CHECK (attendance_count >= 0),
    passage_active BOOLEAN NOT NULL DEFAULT false,
    last_counted_at TIMESTAMPTZ,
    session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE distance_attendance_state
    ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_distance_attendance_state_updated_at
    ON distance_attendance_state(updated_at DESC);
