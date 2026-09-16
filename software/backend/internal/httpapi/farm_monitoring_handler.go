package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

func (h *FarmHandler) ListFarmMonitoringReadings(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, false)
	if !ok {
		return
	}
	hours := 24
	if raw := r.URL.Query().Get("hours"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 && parsed <= 720 {
			hours = parsed
		}
	}
	cutoff := time.Now().UTC().Add(-time.Duration(hours) * time.Hour)
	maxPointsPerSensor := 240
	switch {
	case hours > 168:
		maxPointsPerSensor = 360
	case hours > 24:
		maxPointsPerSensor = 300
	}
	rows, err := h.db.Query(r.Context(), `
		WITH scoped AS (
			SELECT
				sr.time,
				s.id AS sensor_id,
				s.name AS sensor_name,
				COALESCE(sc.measurement_type,s.type) AS measurement_type,
				COALESCE(NULLIF(sc.unit,''),NULLIF(s.unit,'')) AS unit,
				sr.value,
				COALESCE(sr.meta->>'quality','legacy') AS quality,
				f.id AS field_id,
				f.name AS field_name,
				c.id AS controller_id,
				COALESCE(c.name,c.hw_id) AS controller_name,
				sm.base_id AS sensor_base_id,
				ROW_NUMBER() OVER (
					PARTITION BY s.id
					ORDER BY sr.time DESC
				) AS recency_rank
			FROM gateways g
			JOIN controllers c ON c.id=g.legacy_controller_id
			JOIN sensors s ON s.controller_id=c.id
			JOIN sensor_readings sr ON sr.sensor_id=s.id
			LEFT JOIN sensor_channels sc ON sc.id=sr.sensor_channel_id
			LEFT JOIN sensor_modules sm ON sm.id=sc.module_id
			LEFT JOIN LATERAL (
				SELECT sba.field_id
				FROM sensor_base_assignments sba
				WHERE sba.base_id=sm.base_id
				  AND sba.assigned_at <= sr.time
				  AND (sba.unassigned_at IS NULL OR sba.unassigned_at > sr.time)
				ORDER BY sba.assigned_at DESC
				LIMIT 1
			) historical_assignment ON true
			LEFT JOIN fields f ON f.id=COALESCE(
				CASE
				  WHEN COALESCE(sr.meta->>'field_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
				  THEN (sr.meta->>'field_id')::uuid
				END,
				historical_assignment.field_id
			)
			WHERE g.farm_id=$1
			  AND sr.time >= $2
		)
		SELECT
			time,
			sensor_id,
			sensor_name,
			measurement_type,
			unit,
			value,
			quality,
			field_id,
			field_name,
			controller_id,
			controller_name,
			sensor_base_id
		FROM scoped
		WHERE recency_rank <= $3
		ORDER BY field_name NULLS LAST,time ASC
	`, access.farmID, cutoff, maxPointsPerSensor)
	if err != nil {
		http.Error(w, "failed to load monitoring readings", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var at time.Time
		var sensorID uuid.UUID
		var name, typ, quality string
		var unit *string
		var value float64
		var fieldID, controllerID, sensorBaseID *uuid.UUID
		var fieldName *string
		var controllerName string
		if err := rows.Scan(
			&at,
			&sensorID,
			&name,
			&typ,
			&unit,
			&value,
			&quality,
			&fieldID,
			&fieldName,
			&controllerID,
			&controllerName,
			&sensorBaseID,
		); err != nil {
			http.Error(w, "failed to read monitoring readings", http.StatusInternalServerError)
			return
		}
		items = append(items, map[string]any{
			"time": at, "sensor_id": sensorID, "sensor_name": name, "type": typ,
			"unit": unit, "value": value, "quality": quality,
			"field_id": fieldID, "field_name": fieldName,
			"controller_id": controllerID, "controller_name": controllerName,
			"sensor_base_id": sensorBaseID,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"readings": items, "hours": hours})
}
