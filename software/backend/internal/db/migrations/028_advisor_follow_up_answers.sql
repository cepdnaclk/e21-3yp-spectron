-- Initial advisor observations require three characters, but problem follow-up
-- answers can legitimately be short values such as "No" or "1". The API
-- validates that follow-up answers are non-empty, so align the storage rule.
ALTER TABLE advisor_recommendations
    DROP CONSTRAINT IF EXISTS advisor_observation_not_blank;

ALTER TABLE advisor_recommendations
    ADD CONSTRAINT advisor_observation_not_blank
    CHECK (length(trim(observation)) >= 1);
