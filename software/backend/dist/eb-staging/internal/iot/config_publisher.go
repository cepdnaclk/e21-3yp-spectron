package iot

import (
	"context"
	"encoding/json"
	"log"
)

type SensorConfigPublishPayload struct {
	ControllerID string                 `json:"controllerId"`
	SensorID     string                 `json:"sensorId"`
	SensorType   string                 `json:"sensorType"`
	Config       map[string]interface{} `json:"config"`
}

func PublishSensorConfiguration(ctx context.Context, controllerID string, sensorID string, sensorType string, config map[string]interface{}) error {
	payload := SensorConfigPublishPayload{
		ControllerID: controllerID,
		SensorID:     sensorID,
		SensorType:   sensorType,
		Config:       config,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	topic := "spectron/" + controllerID + "/sensors/" + sensorID + "/config"
	log.Printf("MQTT config publish placeholder topic=%q payload=%s", topic, string(body))

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return nil
	}
}
