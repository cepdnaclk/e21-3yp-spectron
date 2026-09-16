-- Normalized, versioned crop knowledge used by the AgriAssist advisor.
CREATE TABLE IF NOT EXISTS crop_knowledge_sources (
    id UUID PRIMARY KEY,
    crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    source_name TEXT,
    source_url TEXT,
    dataset_version TEXT NOT NULL DEFAULT 'initial',
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (crop_id, category, dataset_version)
);

CREATE TABLE IF NOT EXISTS crop_knowledge_entries (
    id UUID PRIMARY KEY,
    source_id UUID NOT NULL REFERENCES crop_knowledge_sources(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    topic TEXT,
    growth_stage TEXT,
    content TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, content)
);

CREATE INDEX IF NOT EXISTS idx_crop_knowledge_entries_crop_category
    ON crop_knowledge_entries(crop_id, category, active);
CREATE INDEX IF NOT EXISTS idx_crop_knowledge_entries_search
    ON crop_knowledge_entries USING gin (to_tsvector('simple', coalesce(content, '') || ' ' || coalesce(topic, '') || ' ' || coalesce(growth_stage, '')));

INSERT INTO crops (id, name) VALUES
 ('11111111-1111-4111-8111-111111111101', 'Chilli'),
 ('11111111-1111-4111-8111-111111111102', 'Maize'),
 ('11111111-1111-4111-8111-111111111103', 'Potato'),
 ('11111111-1111-4111-8111-111111111104', 'Tomato')
ON CONFLICT (name) DO NOTHING;
