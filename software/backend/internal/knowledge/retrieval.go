package knowledge

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Match struct {
	ID       uuid.UUID      `json:"id"`
	Category string         `json:"category"`
	Topic    string         `json:"topic,omitempty"`
	Stage    string         `json:"growth_stage,omitempty"`
	Content  string         `json:"content"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// Retrieve returns only active entries for the selected crop. The crop ID is
// resolved by the caller from the authenticated field/crop instance, so a
// farmer cannot request another crop's knowledge by changing a browser value.
func Retrieve(ctx context.Context, db *pgxpool.Pool, cropID uuid.UUID, stage, query string, limit int) ([]Match, error) {
	if limit < 1 || limit > 30 {
		limit = 12
	}
	stage = strings.TrimSpace(stage)
	query = strings.TrimSpace(query)
	rows, err := db.Query(ctx, `
		WITH search_query AS (
			SELECT CASE WHEN $3 = '' THEN NULL::tsquery ELSE to_tsquery(
				'simple', array_to_string(tsvector_to_array(to_tsvector('simple', $3)), ' | ')
			) END AS value
		)
		SELECT id, category, COALESCE(topic, ''), COALESCE(growth_stage, ''), content, metadata_json
		FROM crop_knowledge_entries, search_query
		WHERE crop_id = $1 AND active = true
		  AND ($2 = '' OR growth_stage IS NULL OR lower(growth_stage) LIKE '%' || lower($2) || '%')
		  AND (search_query.value IS NULL OR to_tsvector('simple', coalesce(content,'') || ' ' || coalesce(topic,'') || ' ' || coalesce(growth_stage,'') || ' ' || metadata_json::text) @@ search_query.value)
		ORDER BY CASE WHEN search_query.value IS NULL THEN 0 ELSE ts_rank(to_tsvector('simple', coalesce(content,'') || ' ' || coalesce(topic,'') || ' ' || coalesce(growth_stage,'') || ' ' || metadata_json::text), search_query.value) END DESC, category, id
		LIMIT $4`, cropID, stage, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	matches := make([]Match, 0)
	for rows.Next() {
		var item Match
		if err := rows.Scan(&item.ID, &item.Category, &item.Topic, &item.Stage, &item.Content, &item.Metadata); err != nil {
			return nil, err
		}
		matches = append(matches, item)
	}
	return matches, rows.Err()
}

// RetrieveAll returns the complete imported reference for one crop so wording
// differences in a farmer's observation cannot hide useful guidance.
func RetrieveAll(ctx context.Context, db *pgxpool.Pool, cropID uuid.UUID, limit int) ([]Match, error) {
	if limit < 1 || limit > 200 {
		limit = 120
	}
	rows, err := db.Query(ctx, `
		SELECT id, category, COALESCE(topic, ''), COALESCE(growth_stage, ''), content, metadata_json
		FROM crop_knowledge_entries WHERE crop_id = $1 AND active = true
		ORDER BY category, topic, id LIMIT $2`, cropID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	matches := make([]Match, 0)
	for rows.Next() {
		var item Match
		if err := rows.Scan(&item.ID, &item.Category, &item.Topic, &item.Stage, &item.Content, &item.Metadata); err != nil {
			return nil, err
		}
		matches = append(matches, item)
	}
	return matches, rows.Err()
}
