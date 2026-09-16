package httpapi

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"spectron-backend/internal/models"
	"spectron-backend/internal/weather"
)

type sensorFarmAIContext struct {
	FarmName    string
	FieldName   string
	CropName    string
	GrowthStage string
	Latitude    *float64
	Longitude   *float64
}

func (h *SensorHandler) enrichAISuggestWithFarmData(
	ctx context.Context,
	sensorID uuid.UUID,
	req models.AISuggestRequest,
) models.AISuggestRequest {
	farmData, err := h.loadSensorFarmAIContext(ctx, sensorID)
	if err != nil {
		return req
	}

	parts := make([]string, 0, 4)
	if farmData.FarmName != "" {
		parts = append(parts, "Farm: "+farmData.FarmName)
	}
	if farmData.FieldName != "" {
		parts = append(parts, "Field: "+farmData.FieldName)
	}
	if farmData.CropName != "" {
		parts = append(parts, "Crop: "+farmData.CropName)
	}
	if farmData.GrowthStage != "" {
		parts = append(parts, "Growth stage: "+farmData.GrowthStage)
	}
	req.FarmContext = strings.Join(parts, "; ")

	if farmData.Latitude != nil && farmData.Longitude != nil {
		if summary, weatherErr := weather.NewClient().CurrentSummary(
			ctx,
			*farmData.Latitude,
			*farmData.Longitude,
		); weatherErr == nil {
			req.WeatherSummary = summary
		} else {
			req.WeatherSummary = "Current farm weather is temporarily unavailable; do not infer weather conditions."
		}
	} else {
		req.WeatherSummary = "Farm coordinates are not available; do not infer weather conditions."
	}

	if farmData.FieldName != "" || farmData.CropName != "" {
		inferred := &models.SensorContext{
			Domain:          "agriculture",
			EnvironmentType: "field",
			IndoorOutdoor:   "outdoor",
			AssetType:       strings.ToLower(strings.TrimSpace(farmData.CropName)),
			Location: &models.LocationContext{
				Mode:      "farm_assignment",
				Label:     firstNonBlank(farmData.FieldName, farmData.FarmName),
				Latitude:  farmData.Latitude,
				Longitude: farmData.Longitude,
			},
		}
		req.Context = mergeSensorContext(req.Context, inferred)
	}

	return req
}

func (h *SensorHandler) loadSensorFarmAIContext(
	ctx context.Context,
	sensorID uuid.UUID,
) (sensorFarmAIContext, error) {
	var result sensorFarmAIContext
	err := h.db.QueryRow(ctx, `
		SELECT
			COALESCE(f.name, ''),
			COALESCE(fi.name, ''),
			COALESCE(active_crop.crop_name, ''),
			COALESCE(active_crop.stage_name, ''),
			COALESCE(fi.latitude, f.latitude),
			COALESCE(fi.longitude, f.longitude)
		FROM sensors s
		JOIN sensor_bases sb ON sb.id = s.sensor_base_id
		JOIN gateways g ON g.id = sb.gateway_id
		JOIN farms f ON f.id = g.farm_id
		LEFT JOIN sensor_base_assignments sba
		  ON sba.base_id = sb.id
		 AND sba.unassigned_at IS NULL
		LEFT JOIN fields fi ON fi.id = sba.field_id
		LEFT JOIN LATERAL (
			SELECT c.name AS crop_name, COALESCE(gs.stage_name, '') AS stage_name
			FROM crop_instances ci
			JOIN crops c ON c.id = ci.crop_id
			LEFT JOIN growth_stages gs ON gs.id = ci.current_stage_id
			WHERE ci.field_id = fi.id
			  AND ci.active = true
			ORDER BY ci.created_at DESC
			LIMIT 1
		) active_crop ON true
		WHERE s.id = $1
		ORDER BY sba.assigned_at DESC NULLS LAST
		LIMIT 1
	`, sensorID).Scan(
		&result.FarmName,
		&result.FieldName,
		&result.CropName,
		&result.GrowthStage,
		&result.Latitude,
		&result.Longitude,
	)
	if err == nil {
		return result, nil
	}
	if err != pgx.ErrNoRows {
		return sensorFarmAIContext{}, err
	}

	err = h.db.QueryRow(ctx, `
		SELECT
			COALESCE(f.name, ''),
			f.latitude,
			f.longitude
		FROM sensors s
		JOIN gateways g ON g.legacy_controller_id = s.controller_id
		JOIN farms f ON f.id = g.farm_id
		WHERE s.id = $1
		ORDER BY g.created_at DESC
		LIMIT 1
	`, sensorID).Scan(&result.FarmName, &result.Latitude, &result.Longitude)
	if err != nil {
		return sensorFarmAIContext{}, err
	}
	return result, nil
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return "Farm field"
}
