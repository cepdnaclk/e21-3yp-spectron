package models

import "encoding/json"

type HardwarePairRequest struct {
	ControllerID               string `json:"controllerId,omitempty"`
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
	ID           string                   `json:"id"`
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

type AdminOverviewResponse struct {
	TotalDevices        int `json:"totalDevices"`
	UnclaimedDevices    int `json:"unclaimedDevices"`
	PairedDevices       int `json:"pairedDevices"`
	OnlineDevices       int `json:"onlineDevices"`
	OfflineDevices      int `json:"offlineDevices"`
	ConfiguredSensors   int `json:"configuredSensors"`
	UnconfiguredSensors int `json:"unconfiguredSensors"`
}

type AdminDeviceResponse struct {
	ID                string `json:"id"`
	ControllerID      string `json:"controllerId"`
	Name              string `json:"name"`
	Location          string `json:"location,omitempty"`
	Status            string `json:"status"`
	OwnerEmail        string `json:"ownerEmail,omitempty"`
	SensorCount       int    `json:"sensorCount"`
	ConfiguredSensors int    `json:"configuredSensors"`
	LastSeen          string `json:"lastSeen,omitempty"`
	UpdatedAt         string `json:"updatedAt,omitempty"`
}

type AdminDevicesResponse struct {
	Devices []AdminDeviceResponse `json:"devices"`
}

type AdminCreateDeviceRequest struct {
	ControllerID         string `json:"controllerId"`
	Name                 string `json:"name"`
	Location             string `json:"location"`
	CreateDefaultSensors bool   `json:"createDefaultSensors"`
}

type AdminCreateDeviceResponse struct {
	Device    AdminDeviceResponse `json:"device"`
	QRPayload string              `json:"qrPayload"`
	ClaimURL  string              `json:"claimUrl"`
}

type AdminGeneratePairingTokenRequest struct {
	TokenExpiryHours int `json:"tokenExpiryHours"`
}

type AdminGeneratePairingTokenResponse struct {
	ControllerID string `json:"controllerId"`
	PairingToken string `json:"pairingToken"`
	PairingURL   string `json:"pairingUrl"`
	ExpiresAt    string `json:"expiresAt"`
}

type AdminPairingTokenResponse struct {
	ControllerID string `json:"controllerId"`
	Status       string `json:"status"`
	ExpiresAt    string `json:"expiresAt"`
	UsedAt       string `json:"usedAt,omitempty"`
	CreatedAt    string `json:"createdAt"`
}

type AdminPairingTokensResponse struct {
	Tokens []AdminPairingTokenResponse `json:"tokens"`
}

type AdminUserResponse struct {
	ID              string `json:"id"`
	Email           string `json:"email"`
	Name            string `json:"name,omitempty"`
	Role            string `json:"role"`
	ControllerCount int    `json:"controllerCount"`
	CreatedAt       string `json:"createdAt"`
}

type AdminUsersResponse struct {
	Users []AdminUserResponse `json:"users"`
}

type AdminSystemHealthResponse struct {
	APIStatus      string `json:"apiStatus"`
	DatabaseStatus string `json:"databaseStatus"`
	ServerTime     string `json:"serverTime"`
}
