package models

import (
	"time"

	"github.com/google/uuid"
)

type Alert struct {
	ID            uuid.UUID  `json:"id"`
	AccountID     uuid.UUID  `json:"account_id"`
	ControllerID  *uuid.UUID `json:"controller_id,omitempty"`
	SensorID      *uuid.UUID `json:"sensor_id,omitempty"`
	Type          string     `json:"type"` // THRESHOLD_BREACH, SENSOR_OFFLINE, CONTROLLER_OFFLINE
	Severity      string     `json:"severity"` // INFO, WARN, CRITICAL
	Message       string     `json:"message"`
	CreatedAt     time.Time  `json:"created_at"`
	AcknowledgedAt *time.Time `json:"acknowledged_at,omitempty"`
}
