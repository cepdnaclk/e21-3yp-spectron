package models

import "encoding/json"

type HardwarePairRequest struct {
	PairingTokenOrControllerID string `json:"pairingTokenOrControllerId"`
	QRToken                    string `json:"qr_token,omitempty"`
}

type HardwareSensorResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Status     string `json:"status"`
	Configured bool   `json:"configured"`
}

type HardwarePairResponse struct {
	ControllerID string                   `json:"controllerId"`
	Status       string                   `json:"status"`
	Sensors      []HardwareSensorResponse `json:"sensors"`
}

type UserHardwareControllerResponse struct {
	ControllerID string                   `json:"controllerId"`
	Name         string                   `json:"name"`
	Status       string                   `json:"status"`
	Sensors      []HardwareSensorResponse `json:"sensors"`
}

type UserHardwareControllersResponse struct {
	Controllers []UserHardwareControllerResponse `json:"controllers"`
}

type ControllerSensorsResponse struct {
	ControllerID string                   `json:"controllerId"`
	Sensors      []HardwareSensorResponse `json:"sensors"`
}

type SaveHardwareSensorConfigRequest struct {
	SensorType    string                 `json:"sensorType"`
	SensorName    string                 `json:"sensorName"`
	UsedFor       string                 `json:"usedFor"`
	DashboardView string                 `json:"dashboardView"`
	Config        map[string]interface{} `json:"config"`
}

type SaveHardwareSensorConfigResponse struct {
	Message      string `json:"message"`
	ControllerID string `json:"controllerId"`
	SensorID     string `json:"sensorId"`
	Configured   bool   `json:"configured"`
}

type HardwareSensorConfigResponse struct {
	ControllerID  string          `json:"controllerId"`
	SensorID      string          `json:"sensorId"`
	SensorType    string          `json:"sensorType"`
	SensorName    string          `json:"sensorName"`
	UsedFor       string          `json:"usedFor,omitempty"`
	DashboardView string          `json:"dashboardView,omitempty"`
	Config        json.RawMessage `json:"config"`
}

type DemoCreateControllerRequest struct {
	ControllerID string `json:"controllerId"`
	PairingToken string `json:"pairingToken"`
}

type DemoCreateControllerResponse struct {
	ControllerID string `json:"controllerId"`
	PairingToken string `json:"pairingToken"`
	PairingURL   string `json:"pairingUrl"`
}
