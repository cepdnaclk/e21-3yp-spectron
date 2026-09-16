package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ListFarmAdvisorSummary returns only the latest few field-scoped results so
// the farm overview stays useful without becoming a second advisor screen.
func (h *FarmHandler) ListFarmAdvisorSummary(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, false)
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `
		SELECT ar.id, ar.field_id, f.name, c.name, ar.observation, ar.result_json, ar.created_at
		FROM advisor_recommendations ar
		JOIN fields f ON f.id=ar.field_id
		JOIN crop_instances ci ON ci.id=ar.crop_instance_id
		JOIN crops c ON c.id=ci.crop_id
		WHERE f.farm_id=$1
		ORDER BY ar.created_at DESC
		LIMIT 3`, access.farmID)
	if err != nil {
		http.Error(w, "failed to load farm advisor summary", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, fieldID uuid.UUID
		var fieldName, cropName, observation string
		var result json.RawMessage
		var createdAt time.Time
		if err := rows.Scan(&id, &fieldID, &fieldName, &cropName, &observation, &result, &createdAt); err != nil {
			http.Error(w, "failed to read farm advisor summary", http.StatusInternalServerError)
			return
		}
		items = append(items, map[string]any{"id": id, "field_id": fieldID, "field_name": fieldName, "crop_name": cropName, "observation": observation, "advice": result, "created_at": createdAt})
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "failed to read farm advisor summary", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recommendations": items})
}
