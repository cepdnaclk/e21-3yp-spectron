package iot

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type UploadRequest struct {
	DeviceID string         `json:"deviceId"`
	TS       int64          `json:"ts"`
	Sensors  []SensorUpload `json:"sensors"`
}

type SensorDiscoveryRequest struct {
	DeviceID string            `json:"deviceId"`
	TS       int64             `json:"ts,omitempty"`
	Sensors  []SensorDiscovery `json:"sensors"`
}

type ConfigPullRequest struct {
	DeviceID   string `json:"deviceId"`
	SensorID   string `json:"sensorId,omitempty"`
	SensorType string `json:"sensorType,omitempty"`
}

type SensorUpload struct {
	ID    string  `json:"id"`
	Type  string  `json:"type"`
	Value float64 `json:"v"`
}

type SensorDiscovery struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Name string `json:"name,omitempty"`
	Unit string `json:"unit,omitempty"`
}

type ConfigPullResponse struct {
	OK                      bool       `json:"ok"`
	DeviceID                string     `json:"deviceId"`
	SensorID                string     `json:"sensorId,omitempty"`
	SensorType              string     `json:"sensorType,omitempty"`
	ConfigID                string     `json:"configId"`
	HasActiveConfig         bool       `json:"hasActiveConfig"`
	SamplePeriodMs          uint32     `json:"samplePeriodMs"`
	TempThresholdHiX100     int16      `json:"tempThresholdHiX100"`
	HumidityThresholdHiX100 uint16     `json:"humidityThresholdHiX100"`
	ConfiguredAt            *time.Time `json:"configuredAt,omitempty"`
}

type RawReadingsEvent struct {
	EventID      string               `json:"event_id"`
	DeviceID     string               `json:"device_id"`
	TimestampRaw int64                `json:"timestamp_raw"`
	ReadingTime  time.Time            `json:"reading_time"`
	ReceivedAt   time.Time            `json:"received_at"`
	Source       string               `json:"source"`
	Sensors      []RawReadingsMessage `json:"sensors"`
}

type RawReadingsMessage struct {
	HWID  string  `json:"hw_id"`
	Type  string  `json:"type"`
	Value float64 `json:"value"`
}

func BuildRawReadingsEvent(req UploadRequest, receivedAt time.Time) RawReadingsEvent {
	return BuildRawReadingsEventWithSource(req, receivedAt, "controller-upload")
}

func BuildRawReadingsEventWithSource(req UploadRequest, receivedAt time.Time, source string) RawReadingsEvent {
	trimmedSource := strings.TrimSpace(source)
	if trimmedSource == "" {
		trimmedSource = "controller-upload"
	}

	readingTime := ResolveReadingTime(req.TS, receivedAt)
	sensors := make([]RawReadingsMessage, 0, len(req.Sensors))
	for _, sensor := range req.Sensors {
		sensors = append(sensors, RawReadingsMessage{
			HWID:  strings.TrimSpace(sensor.ID),
			Type:  strings.TrimSpace(sensor.Type),
			Value: sensor.Value,
		})
	}

	return RawReadingsEvent{
		EventID:      uuid.NewString(),
		DeviceID:     strings.TrimSpace(req.DeviceID),
		TimestampRaw: req.TS,
		ReadingTime:  readingTime,
		ReceivedAt:   receivedAt.UTC(),
		Source:       trimmedSource,
		Sensors:      sensors,
	}
}

func ResolveReadingTime(raw int64, fallback time.Time) time.Time {
	if raw <= 0 {
		return fallback.UTC()
	}

	switch {
	case raw >= 1_000_000_000_000_000_000:
		return time.Unix(0, raw).UTC()
	case raw >= 1_000_000_000_000_000:
		return time.UnixMicro(raw).UTC()
	case raw >= 1_000_000_000_000:
		return time.UnixMilli(raw).UTC()
	default:
		return time.Unix(raw, 0).UTC()
	}
}

func ValidateUploadRequest(req UploadRequest) error {
	if strings.TrimSpace(req.DeviceID) == "" {
		return fmt.Errorf("deviceId is required")
	}
	if len(req.Sensors) == 0 {
		return fmt.Errorf("at least one sensor reading is required")
	}

	for _, sensor := range req.Sensors {
		if strings.TrimSpace(sensor.ID) == "" {
			return fmt.Errorf("sensor id is required")
		}
		if strings.TrimSpace(sensor.Type) == "" {
			return fmt.Errorf("sensor type is required")
		}
	}

	return nil
}

func ValidateSensorDiscoveryRequest(req SensorDiscoveryRequest) error {
	if strings.TrimSpace(req.DeviceID) == "" {
		return fmt.Errorf("deviceId is required")
	}
	if len(req.Sensors) == 0 {
		return fmt.Errorf("at least one sensor is required")
	}

	for _, sensor := range req.Sensors {
		if strings.TrimSpace(sensor.ID) == "" {
			return fmt.Errorf("sensor id is required")
		}
		if strings.TrimSpace(sensor.Type) == "" {
			return fmt.Errorf("sensor type is required")
		}
	}

	return nil
}

func ValidateConfigPullRequest(req ConfigPullRequest) error {
	if strings.TrimSpace(req.DeviceID) == "" {
		return fmt.Errorf("deviceId is required")
	}

	return nil
}
