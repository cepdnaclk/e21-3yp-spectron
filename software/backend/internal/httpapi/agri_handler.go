package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"spectron-backend/internal/agri"
	"spectron-backend/internal/models"
)

type AgriHandler struct{}

func NewAgriHandler() *AgriHandler {
	return &AgriHandler{}
}

type AgriAdvisoryResponse struct {
	Crop      string `json:"crop"`
	Stage     string `json:"stage"`
	Issue     string `json:"issue,omitempty"`
	Treatment string `json:"treatment,omitempty"`
	Text      string `json:"text"`
}

type AgriSummaryResponse struct {
	Crops      []string               `json:"crops"`
	Stages     []string               `json:"stages"`
	Issues     []string               `json:"issues"`
	Advisories []AgriAdvisoryResponse `json:"advisories,omitempty"`
}

type AgriConfigRequest struct {
	Crop         string `json:"crop"`
	Stage        string `json:"stage"`
	SensorType   string `json:"sensor_type"`
	FieldName    string `json:"field_name,omitempty"`
	Location     string `json:"location,omitempty"`
	UseHostedAI  bool   `json:"use_hosted_ai,omitempty"`
	ControllerID string `json:"controller_id,omitempty"`
	SensorID     string `json:"sensor_id,omitempty"`
}

type AgriConfigResponse struct {
	Purpose    string                 `json:"purpose"`
	Context    *models.SensorContext  `json:"context"`
	Config     models.SensorConfig    `json:"config"`
	Advisories []AgriAdvisoryResponse `json:"advisories"`
	Mode       string                 `json:"mode"`
}

func (h *AgriHandler) Summary(w http.ResponseWriter, r *http.Request) {
	advisories, err := agri.LoadEmbeddedAdvisories()
	if err != nil {
		http.Error(w, "failed to load agriculture dataset", http.StatusInternalServerError)
		return
	}

	summary := agri.Summarize(advisories)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AgriSummaryResponse{
		Crops:  summary.Crops,
		Stages: summary.Stages,
		Issues: summary.Issues,
	})
}

func (h *AgriHandler) Advisories(w http.ResponseWriter, r *http.Request) {
	advisories, err := agri.LoadEmbeddedAdvisories()
	if err != nil {
		http.Error(w, "failed to load agriculture dataset", http.StatusInternalServerError)
		return
	}

	crop := strings.TrimSpace(r.URL.Query().Get("crop"))
	stage := strings.TrimSpace(r.URL.Query().Get("stage"))
	matches := filterAgriAdvisories(advisories, crop, stage)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"advisories": agriAdvisoryResponses(matches),
	})
}

func (h *AgriHandler) BuildConfig(w http.ResponseWriter, r *http.Request) {
	var req AgriConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	req.Crop = strings.TrimSpace(req.Crop)
	req.Stage = strings.TrimSpace(req.Stage)
	req.SensorType = strings.TrimSpace(req.SensorType)
	if req.Crop == "" || req.Stage == "" || req.SensorType == "" {
		http.Error(w, "crop, stage, and sensor_type are required", http.StatusBadRequest)
		return
	}

	advisories, err := agri.LoadEmbeddedAdvisories()
	if err != nil {
		http.Error(w, "failed to load agriculture dataset", http.StatusInternalServerError)
		return
	}

	matches := filterAgriAdvisories(advisories, req.Crop, req.Stage)
	purpose := buildAgriPurpose(req)
	context := buildAgriContext(req)

	sensorHelper := &SensorHandler{}
	aiReq := models.AISuggestRequest{
		Purpose: purpose,
		Context: context,
	}

	config := sensorHelper.generateAISuggestion(req.SensorType, aiReq)
	mode := "deterministic"
	if req.UseHostedAI {
		if hostedConfig, _, err := sensorHelper.generateHostedAISuggestion(r.Context(), req.SensorType, aiReq, "No live sensor readings available yet. Use dataset advisories and agronomic defaults."); err == nil {
			config = hostedConfig
			mode = "hosted_ai"
		}
	}

	if strings.TrimSpace(req.FieldName) != "" {
		config.FriendlyName = strings.TrimSpace(req.FieldName)
	}
	if strings.TrimSpace(config.FriendlyName) == "" {
		config.FriendlyName = req.Crop + " Monitor"
	}

	validation := validateAndFinalizeConfig(req.SensorType, purpose, context, config, controllerCapability{MinReportingIntervalSec: 300}, "")

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AgriConfigResponse{
		Purpose:    purpose,
		Context:    context,
		Config:     validation.FinalConfig,
		Advisories: agriAdvisoryResponses(matches),
		Mode:       mode,
	})
}

func buildAgriPurpose(req AgriConfigRequest) string {
	parts := []string{
		"Monitor",
		req.Crop,
		"crop during",
		req.Stage,
		"for Sri Lankan disease, pest, and crop-condition risk",
	}
	if strings.TrimSpace(req.FieldName) != "" {
		parts = append(parts, "at", strings.TrimSpace(req.FieldName))
	}
	return strings.Join(parts, " ")
}

func buildAgriContext(req AgriConfigRequest) *models.SensorContext {
	locationLabel := strings.TrimSpace(req.Location)
	if locationLabel == "" {
		locationLabel = strings.TrimSpace(req.FieldName)
	}
	return &models.SensorContext{
		Domain:            "agriculture",
		EnvironmentType:   "farm",
		IndoorOutdoor:     "outdoor",
		AssetType:         req.Crop + " crop",
		InstallationNotes: "AgriAssist stage: " + req.Stage,
		Location: &models.LocationContext{
			Label:   locationLabel,
			Country: "Sri Lanka",
		},
	}
}

func filterAgriAdvisories(advisories []agri.Advisory, crop string, stage string) []agri.Advisory {
	crop = strings.ToLower(strings.TrimSpace(crop))
	stage = strings.ToLower(strings.TrimSpace(stage))
	matches := make([]agri.Advisory, 0)
	for _, advisory := range advisories {
		if crop != "" && !strings.EqualFold(strings.TrimSpace(advisory.Crop), strings.TrimSpace(crop)) {
			continue
		}
		if stage != "" && !strings.EqualFold(strings.TrimSpace(advisory.Stage), strings.TrimSpace(stage)) {
			continue
		}
		matches = append(matches, advisory)
	}
	return matches
}

func agriAdvisoryResponses(advisories []agri.Advisory) []AgriAdvisoryResponse {
	responses := make([]AgriAdvisoryResponse, 0, len(advisories))
	for _, advisory := range advisories {
		responses = append(responses, AgriAdvisoryResponse{
			Crop:      advisory.Crop,
			Stage:     advisory.Stage,
			Issue:     advisory.Issue,
			Treatment: advisory.Treatment,
			Text:      advisory.Text,
		})
	}
	return responses
}
