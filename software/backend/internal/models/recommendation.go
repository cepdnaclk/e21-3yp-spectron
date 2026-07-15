package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type RecommendationRule struct {
	ID                   uuid.UUID  `json:"id"`
	AccountID            uuid.UUID  `json:"account_id"`
	ControllerID         *uuid.UUID `json:"controller_id,omitempty"`
	SensorID             *uuid.UUID `json:"sensor_id,omitempty"`
	MetricType           string     `json:"metric_type"`
	Operator             string     `json:"operator"`
	ThresholdMin         *float64   `json:"threshold_min,omitempty"`
	ThresholdMax         *float64   `json:"threshold_max,omitempty"`
	SustainedMinutes     int        `json:"sustained_minutes"`
	RiskLevel            string     `json:"risk_level"`
	ActionRecommendation string     `json:"action_recommendation"`
	Active               bool       `json:"active"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

func (r RecommendationRule) MarshalJSON() ([]byte, error) {
	type recommendationRuleJSON struct {
		ID                   *uuid.UUID `json:"id,omitempty"`
		AccountID            *uuid.UUID `json:"account_id,omitempty"`
		ControllerID         *uuid.UUID `json:"controller_id,omitempty"`
		SensorID             *uuid.UUID `json:"sensor_id,omitempty"`
		MetricType           string     `json:"metric_type"`
		Operator             string     `json:"operator"`
		ThresholdMin         *float64   `json:"threshold_min,omitempty"`
		ThresholdMax         *float64   `json:"threshold_max,omitempty"`
		SustainedMinutes     int        `json:"sustained_minutes"`
		RiskLevel            string     `json:"risk_level"`
		ActionRecommendation string     `json:"action_recommendation"`
		Active               *bool      `json:"active,omitempty"`
		CreatedAt            *time.Time `json:"created_at,omitempty"`
		UpdatedAt            *time.Time `json:"updated_at,omitempty"`
	}

	out := recommendationRuleJSON{
		ControllerID:         r.ControllerID,
		SensorID:             r.SensorID,
		MetricType:           r.MetricType,
		Operator:             r.Operator,
		ThresholdMin:         r.ThresholdMin,
		ThresholdMax:         r.ThresholdMax,
		SustainedMinutes:     r.SustainedMinutes,
		RiskLevel:            r.RiskLevel,
		ActionRecommendation: r.ActionRecommendation,
	}
	if r.ID != uuid.Nil {
		out.ID = &r.ID
	}
	if r.AccountID != uuid.Nil {
		out.AccountID = &r.AccountID
	}
	if r.Active || r.ID != uuid.Nil || r.AccountID != uuid.Nil || !r.CreatedAt.IsZero() || !r.UpdatedAt.IsZero() {
		out.Active = &r.Active
	}
	if !r.CreatedAt.IsZero() {
		out.CreatedAt = &r.CreatedAt
	}
	if !r.UpdatedAt.IsZero() {
		out.UpdatedAt = &r.UpdatedAt
	}
	return json.Marshal(out)
}

type RecommendationLearningState struct {
	ID           uuid.UUID      `json:"id"`
	AccountID    uuid.UUID      `json:"account_id"`
	ControllerID *uuid.UUID     `json:"controller_id,omitempty"`
	SensorID     *uuid.UUID     `json:"sensor_id,omitempty"`
	Phase        string         `json:"phase"`
	Status       string         `json:"status"`
	BaselineJSON map[string]any `json:"baseline_json,omitempty"`
	Feedback     *string        `json:"feedback,omitempty"`
	StartedAt    time.Time      `json:"started_at"`
	CompletedAt  *time.Time     `json:"completed_at,omitempty"`
	UpdatedAt    time.Time      `json:"updated_at"`
}
