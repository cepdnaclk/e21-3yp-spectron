package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/models"
)

type SensorHandler struct {
	db *pgxpool.Pool
}

func NewSensorHandler(db *pgxpool.Pool) *SensorHandler {
	return &SensorHandler{db: db}
}

func (h *SensorHandler) List(w http.ResponseWriter, r *http.Request) {
	controllerID, err := uuid.Parse(chi.URLParam(r, "controllerId"))
	if err != nil {
		http.Error(w, "invalid controller id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	// Verify controller belongs to account
	var controllerAccountID uuid.UUID
	err = h.db.QueryRow(r.Context(), `
		SELECT owner_account_id
		FROM controllers
		WHERE id = $1
		  AND claim_status = 'CLAIMED'
	`, controllerID).Scan(&controllerAccountID)
	if err != nil {
		http.Error(w, "controller not found", http.StatusNotFound)
		return
	}
	if controllerAccountID != accountID {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT
			sensors.id,
			sensors.controller_id,
			sensors.hw_id,
			sensors.type,
			sensors.name,
			sensors.purpose,
			sensors.unit,
			sensors.status,
			(active_config.created_at IS NOT NULL) AS config_active,
			active_config.config_json,
			sensors.last_seen,
			COALESCE(sensors.context_json, '{}'::jsonb),
			active_config.created_at,
			active_config.report_interval_per_day,
			COALESCE(observation.readings_collected, 0),
			observation.last_reading_at,
			sensors.last_calibrated_at,
			sensors.calibration_due_at,
			COALESCE(sensors.calibration_status, 'UNKNOWN')
		FROM sensors
		LEFT JOIN LATERAL (
			SELECT
				sc.created_at,
				sc.config_json,
				NULLIF(sc.config_json->>'report_interval_per_day', '')::INTEGER AS report_interval_per_day
			FROM sensor_configs sc
			WHERE sc.sensor_id = sensors.id
			  AND sc.active = true
			ORDER BY sc.created_at DESC
			LIMIT 1
		) active_config ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*)::INTEGER AS readings_collected,
				MAX(sr.time) AS last_reading_at
			FROM sensor_readings sr
			WHERE sr.sensor_id = sensors.id
			  AND active_config.created_at IS NOT NULL
			  AND sr.time >= active_config.created_at
		) observation ON true
		WHERE controller_id = $1
		ORDER BY sensors.last_seen DESC NULLS LAST, sensors.hw_id ASC
	`, controllerID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var sensors []models.Sensor
	for rows.Next() {
		s, err := scanSensorRecord(rows)
		if err != nil {
			continue
		}
		sensors = append(sensors, s)
	}

	json.NewEncoder(w).Encode(sensors)
}

func (h *SensorHandler) Get(w http.ResponseWriter, r *http.Request) {
	sensorID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid sensor id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	s, err := scanSensorRecord(h.db.QueryRow(r.Context(), `
		SELECT
			s.id,
			s.controller_id,
			s.hw_id,
			s.type,
			s.name,
			s.purpose,
			s.unit,
			s.status,
			(active_config.created_at IS NOT NULL) AS config_active,
			active_config.config_json,
			s.last_seen,
			COALESCE(s.context_json, '{}'::jsonb),
			active_config.created_at,
			active_config.report_interval_per_day,
			COALESCE(observation.readings_collected, 0),
			observation.last_reading_at,
			s.last_calibrated_at,
			s.calibration_due_at,
			COALESCE(s.calibration_status, 'UNKNOWN')
		FROM sensors s
		JOIN controllers c ON s.controller_id = c.id
		LEFT JOIN LATERAL (
			SELECT
				sc.created_at,
				sc.config_json,
				NULLIF(sc.config_json->>'report_interval_per_day', '')::INTEGER AS report_interval_per_day
			FROM sensor_configs sc
			WHERE sc.sensor_id = s.id
			  AND sc.active = true
			ORDER BY sc.created_at DESC
			LIMIT 1
		) active_config ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*)::INTEGER AS readings_collected,
				MAX(sr.time) AS last_reading_at
			FROM sensor_readings sr
			WHERE sr.sensor_id = s.id
			  AND active_config.created_at IS NOT NULL
			  AND sr.time >= active_config.created_at
		) observation ON true
		WHERE s.id = $1 AND c.owner_account_id = $2
		  AND c.claim_status = 'CLAIMED'
	`, sensorID, accountID))
	if err != nil {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(s)
}

func (h *SensorHandler) Update(w http.ResponseWriter, r *http.Request) {
	sensorID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid sensor id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	var req models.UpdateSensorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if req.Name == nil {
		http.Error(w, "no fields to update", http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(*req.Name)
	if name == "" {
		http.Error(w, "sensor name required", http.StatusBadRequest)
		return
	}

	tag, err := h.db.Exec(r.Context(), `
		UPDATE sensors s
		SET name = $1
		FROM controllers c
		WHERE s.controller_id = c.id
		  AND s.id = $2
		  AND c.owner_account_id = $3
		  AND c.claim_status = 'CLAIMED'
	`, name, sensorID, accountID)
	if err != nil {
		http.Error(w, "failed to update sensor", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}

	h.Get(w, r)
}

func (h *SensorHandler) AISuggestConfig(w http.ResponseWriter, r *http.Request) {
	sensorID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid sensor id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	var req models.AISuggestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.Purpose = strings.TrimSpace(req.Purpose)
	req.Context = normalizeSensorContext(req.Context)
	req.FollowUpAnswers = normalizeFollowUpAnswers(req.FollowUpAnswers)
	if req.Purpose == "" {
		http.Error(w, "purpose is required", http.StatusBadRequest)
		return
	}

	metadata, err := h.lookupSensorMetadata(r.Context(), sensorID, accountID)
	if err != nil {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}

	mergedContext := mergeSensorContext(req.Context, metadata.StoredContext)
	req.Context = mergedContext
	req = enrichAISuggestRequest(req)
	historyDays := 14
	if req.Context != nil && req.Context.HistoricalWindowDays != nil && *req.Context.HistoricalWindowDays > 0 {
		historyDays = *req.Context.HistoricalWindowDays
	}
	historySummary := h.loadSensorHistorySummary(r.Context(), sensorID, historyDays)

	var suggestedConfig models.SensorConfig
	explanation := "Configuration suggested based on your purpose, context, and sensor type."

	hostedConfig, hostedExplanation, hostedErr := h.generateHostedAISuggestion(r.Context(), metadata.SensorType, req, historySummary)
	if hostedErr == nil {
		suggestedConfig = hostedConfig
		if hostedExplanation != "" {
			explanation = hostedExplanation
		} else {
			explanation = "Configuration suggested by hosted AI model."
		}
	} else {
		// Fallback to deterministic local suggestion if hosted AI is unavailable.
		log.Printf("hosted AI unavailable, using fallback: %s", sanitizeHostedAIError(hostedErr))
		suggestedConfig = h.generateAISuggestion(metadata.SensorType, req)
		explanation = hostedAIFallbackExplanation(hostedErr)
	}

	validation := validateAndFinalizeConfig(metadata.SensorType, req.Purpose, req.Context, suggestedConfig, metadata.ControllerCapability, metadata.CalibrationStatus)
	if validation.ValidationStatus == "adjusted" {
		explanation = strings.TrimSpace(explanation + " The backend safety validator adjusted one or more values before returning the final recommendation.")
	}
	followUpQuestions := buildAIFollowUpQuestions(metadata.SensorType, req, validation)
	if len(followUpQuestions) > 0 {
		explanation = "I need a bit more context before finalizing the configuration. Answer these quick questions and I can tighten the thresholds for your setup."
	}

	response := models.AISuggestResponse{
		SuggestedConfig:          suggestedConfig,
		ValidatedConfig:          validation.FinalConfig,
		Explanation:              explanation,
		ValidationStatus:         validation.ValidationStatus,
		Warnings:                 validation.Warnings,
		AppliedRules:             validation.AppliedRules,
		ConfidenceScore:          validation.ConfidenceScore,
		RequiresUserConfirmation: validation.RequiresUserConfirmation,
		NeedsFollowUp:            len(followUpQuestions) > 0,
		FollowUpQuestions:        followUpQuestions,
	}

	json.NewEncoder(w).Encode(response)
}

type geminiGenerateRequest struct {
	Contents []struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"contents"`
	GenerationConfig struct {
		ResponseMIMEType string  `json:"responseMimeType,omitempty"`
		Temperature      float64 `json:"temperature,omitempty"`
	} `json:"generationConfig,omitempty"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

type hostedAISuggestion struct {
	FriendlyName         string                            `json:"friendly_name"`
	UseCase              string                            `json:"use_case"`
	PresentationProfile  string                            `json:"presentation_profile"`
	PrimaryMetric        string                            `json:"primary_metric"`
	ReportIntervalPerDay int                               `json:"report_interval_per_day"`
	Thresholds           models.ThresholdConfig            `json:"thresholds"`
	MetricThresholds     map[string]models.ThresholdConfig `json:"metric_thresholds"`
	Explanation          string                            `json:"explanation"`
}

func normalizeFollowUpAnswers(answers map[string]string) map[string]string {
	if len(answers) == 0 {
		return nil
	}

	normalized := make(map[string]string, len(answers))
	for key, value := range answers {
		trimmedKey := strings.TrimSpace(key)
		trimmedValue := strings.TrimSpace(value)
		if trimmedKey == "" || trimmedValue == "" {
			continue
		}
		normalized[trimmedKey] = trimmedValue
	}

	if len(normalized) == 0 {
		return nil
	}

	return normalized
}

func enrichAISuggestRequest(req models.AISuggestRequest) models.AISuggestRequest {
	req.FollowUpAnswers = normalizeFollowUpAnswers(req.FollowUpAnswers)
	if len(req.FollowUpAnswers) == 0 {
		return req
	}

	orderedKeys := []string{
		"environment_details",
		"physical_scale",
		"normal_operating_range",
		"alert_trigger_point",
		"alert_timing",
		"capacity_limit",
	}

	details := make([]string, 0, len(req.FollowUpAnswers))
	for _, key := range orderedKeys {
		answer := req.FollowUpAnswers[key]
		if answer == "" {
			continue
		}
		details = append(details, fmt.Sprintf("%s: %s", humanizeFollowUpAnswerKey(key), answer))
	}
	for key, answer := range req.FollowUpAnswers {
		found := false
		for _, orderedKey := range orderedKeys {
			if orderedKey == key {
				found = true
				break
			}
		}
		if !found {
			details = append(details, fmt.Sprintf("%s: %s", humanizeFollowUpAnswerKey(key), answer))
		}
	}

	if len(details) == 0 {
		return req
	}

	followUpSummary := "Follow-up details: " + strings.Join(details, "; ")
	if !strings.Contains(strings.ToLower(req.Purpose), strings.ToLower(followUpSummary)) {
		req.Purpose = strings.TrimSpace(req.Purpose + ". " + followUpSummary)
	}

	if req.Context == nil {
		req.Context = &models.SensorContext{}
	}
	if req.Context.InstallationNotes == "" {
		req.Context.InstallationNotes = followUpSummary
	} else if !strings.Contains(strings.ToLower(req.Context.InstallationNotes), strings.ToLower(followUpSummary)) {
		req.Context.InstallationNotes = strings.TrimSpace(req.Context.InstallationNotes + " | " + followUpSummary)
	}

	return req
}

func humanizeFollowUpAnswerKey(key string) string {
	switch key {
	case "environment_details":
		return "Environment"
	case "physical_scale":
		return "Physical scale"
	case "normal_operating_range":
		return "Normal range"
	case "alert_trigger_point":
		return "Alert trigger"
	case "alert_timing":
		return "Alert timing"
	case "capacity_limit":
		return "Capacity limit"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}

func buildAIFollowUpQuestions(
	sensorType string,
	req models.AISuggestRequest,
	validation models.ConfigValidationResult,
) []models.AIFollowUpQuestion {
	useCase, _, primaryMetric, _ := inferUseCaseAndProfile(
		sensorType,
		req.Purpose,
		req.Context,
		validation.FinalConfig.UseCase,
		validation.FinalConfig.PresentationProfile,
		validation.FinalConfig.PrimaryMetric,
	)

	if validation.ConfidenceScore >= 0.92 && !validation.RequiresUserConfirmation {
		return nil
	}

	contextText := ""
	if req.Context != nil {
		contextText = strings.Join([]string{
			req.Context.Domain,
			req.Context.EnvironmentType,
			req.Context.IndoorOutdoor,
			req.Context.AssetType,
			req.Context.InstallationNotes,
			func() string {
				if req.Context.Location == nil {
					return ""
				}
				return strings.Join([]string{
					req.Context.Location.Label,
					req.Context.Location.Region,
					req.Context.Location.Country,
				}, " ")
			}(),
		}, " ")
	}

	combinedText := strings.ToLower(compactSuggestionText(req.Purpose, contextText))
	questions := make([]models.AIFollowUpQuestion, 0, 3)

	addQuestion := func(question models.AIFollowUpQuestion, shouldAsk bool) {
		if !shouldAsk || len(questions) >= 3 {
			return
		}
		for _, existing := range questions {
			if existing.ID == question.ID {
				return
			}
		}
		questions = append(questions, question)
	}

	addQuestion(models.AIFollowUpQuestion{
		ID:          "environment_details",
		Question:    "Where exactly is this sensor installed, and what is it monitoring there?",
		Placeholder: "Example: Indoor household water tank on the roof of my home",
	}, needsEnvironmentDetails(req.Context, combinedText))

	switch useCase {
	case useCaseFillLevel:
		addQuestion(models.AIFollowUpQuestion{
			ID:          "physical_scale",
			Question:    "What is the full tank or container height/depth when it is completely full?",
			Placeholder: "Example: 100 cm tall water tank",
		}, !hasPhysicalScaleHint(combinedText))
		addQuestion(models.AIFollowUpQuestion{
			ID:          "alert_trigger_point",
			Question:    "At what remaining level or percentage should Spectron warn you?",
			Placeholder: "Example: Alert at 10% remaining or when the level drops below 12 cm",
		}, !hasAlertTriggerHint(combinedText))
		addQuestion(models.AIFollowUpQuestion{
			ID:          "alert_timing",
			Question:    "Should the alert trigger immediately, or only if the level stays low for a while?",
			Placeholder: "Example: Alert immediately, or only after 10 minutes",
		}, !hasTimingHint(combinedText))
	case useCaseClimate, useCaseSafety:
		addQuestion(models.AIFollowUpQuestion{
			ID:          "normal_operating_range",
			Question:    "What is the normal safe range you want to maintain?",
			Placeholder: "Example: Temperature 18-25 C and humidity 40-60%",
		}, !hasRangeHint(combinedText))
		addQuestion(models.AIFollowUpQuestion{
			ID:          "alert_trigger_point",
			Question:    "What exact condition should trigger a warning or critical alert?",
			Placeholder: "Example: Warn below 15 C, critical below 10 C",
		}, !hasAlertTriggerHint(combinedText))
		addQuestion(models.AIFollowUpQuestion{
			ID:          "alert_timing",
			Question:    "How long should the condition stay unsafe before we alert you?",
			Placeholder: "Example: Only if it stays unsafe for 15 minutes",
		}, !hasTimingHint(combinedText))
	case useCaseOccupancy, useCaseAttendance:
		addQuestion(models.AIFollowUpQuestion{
			ID:          "capacity_limit",
			Question:    "What occupancy or count should be considered too high or too low?",
			Placeholder: "Example: Warn above 25 people, critical above 35",
		}, !hasCountHint(combinedText))
		addQuestion(models.AIFollowUpQuestion{
			ID:          "alert_timing",
			Question:    "Should the count alert immediately, or only after it stays high for some minutes?",
			Placeholder: "Example: Only if it stays above the limit for 5 minutes",
		}, !hasTimingHint(combinedText))
		addQuestion(models.AIFollowUpQuestion{
			ID:          "environment_details",
			Question:    "What kind of area is this monitoring, and what does a normal busy period look like?",
			Placeholder: "Example: Classroom entrance during school hours",
		}, needsEnvironmentDetails(req.Context, combinedText))
	default:
		addQuestion(models.AIFollowUpQuestion{
			ID:          "normal_operating_range",
			Question:    "What values should be considered normal before alerts begin?",
			Placeholder: "Example: Normal pressure should stay between 98 and 103 kPa",
		}, !hasRangeHint(combinedText) && primaryMetric != "")
		addQuestion(models.AIFollowUpQuestion{
			ID:          "alert_timing",
			Question:    "Should Spectron alert immediately, or only after the condition persists for some time?",
			Placeholder: "Example: Only if the issue lasts more than 10 minutes",
		}, !hasTimingHint(combinedText))
	}

	return questions
}

func needsEnvironmentDetails(ctx *models.SensorContext, combinedText string) bool {
	if ctx != nil {
		if strings.TrimSpace(ctx.EnvironmentType) != "" ||
			strings.TrimSpace(ctx.IndoorOutdoor) != "" ||
			strings.TrimSpace(ctx.AssetType) != "" {
			return false
		}
		if ctx.Location != nil && strings.TrimSpace(ctx.Location.Label) != "" {
			return false
		}
	}

	return !containsAnyKeyword(
		combinedText,
		"indoor", "outdoor", "home", "house", "roof", "rooftop", "room", "warehouse",
		"greenhouse", "factory", "classroom", "office", "tank", "bin", "silo", "cold room",
	)
}

var (
	physicalScalePattern = regexp.MustCompile(`\b\d+(?:\.\d+)?\s*(cm|mm|m|meter|meters|metre|metres|ft|feet|inch|inches|l|litre|litres|liter|liters|gallon|gallons)\b`)
	percentagePattern    = regexp.MustCompile(`\b\d+(?:\.\d+)?\s*%\b`)
	rangePattern         = regexp.MustCompile(`\b\d+(?:\.\d+)?\s*(?:to|-|–)\s*\d+(?:\.\d+)?\b`)
	timingPattern        = regexp.MustCompile(`\b\d+(?:\.\d+)?\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs)\b`)
	countPattern         = regexp.MustCompile(`\b\d+(?:\.\d+)?\s*(people|person|students|student|visitors|visitor|cars|car|vehicles|vehicle|items|item|seats|seat)\b`)
)

func hasPhysicalScaleHint(text string) bool {
	return physicalScalePattern.MatchString(text) ||
		containsAnyKeyword(text, "height", "depth", "deep", "tall", "capacity", "full tank", "full bin")
}

func hasAlertTriggerHint(text string) bool {
	return percentagePattern.MatchString(text) ||
		rangePattern.MatchString(text) ||
		containsAnyKeyword(text, "below", "above", "at ", "when it becomes", "when it reaches", "warn at", "alert at", "critical at")
}

func hasRangeHint(text string) bool {
	return rangePattern.MatchString(text) ||
		containsAnyKeyword(text, "between", "range", "minimum", "maximum", "min", "max")
}

func hasTimingHint(text string) bool {
	return timingPattern.MatchString(text) ||
		containsAnyKeyword(text, "immediately", "instant", "persistent", "sustained", "delay", "after")
}

func hasCountHint(text string) bool {
	return countPattern.MatchString(text) ||
		containsAnyKeyword(text, "occupancy", "attendance", "crowd", "capacity")
}

func (h *SensorHandler) generateHostedAISuggestion(ctx context.Context, sensorType string, req models.AISuggestRequest, historySummary string) (models.SensorConfig, string, error) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))

	if apiKey == "" || (provider != "" && provider != "gemini") {
		return models.SensorConfig{}, "", fmt.Errorf("hosted AI not configured")
	}

	hostedCtx, cancel := context.WithTimeout(ctx, hostedAITimeout())
	defer cancel()

	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.0-flash-lite"
	}

	baseURL := strings.TrimSpace(os.Getenv("GEMINI_API_BASE_URL"))
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com/v1beta"
	}
	baseURL = normalizeGeminiBaseURL(baseURL)

	prompt := fmt.Sprintf(`You are an IoT sensor configuration assistant.
Generate JSON only for this sensor setup.

Sensor type: %s
User purpose: %s
Structured context: %s
Historical summary: %s

Rules:
- Return strict JSON object with keys:
  friendly_name (string),
  use_case (string, optional),
  presentation_profile (string, optional),
  primary_metric (string, optional),
  report_interval_per_day (integer 1-288),
  thresholds (object with optional min,max,warning_min,warning_max numbers),
  metric_thresholds (object map where each key has same threshold shape),
  explanation (string).
- For temperature_humidity sensors, include metric_thresholds for both temperature and humidity.
- Keep values practical for the environment and asset being monitored.
- Use the structured context and historical summary when choosing thresholds.
- Do not include markdown or code fences.
`, sensorType, req.Purpose, contextSummary(req.Context), historySummary)

	geminiReq := geminiGenerateRequest{}
	geminiReq.Contents = []struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	}{
		{
			Parts: []struct {
				Text string `json:"text"`
			}{
				{Text: prompt},
			},
		},
	}
	geminiReq.GenerationConfig.ResponseMIMEType = "application/json"
	geminiReq.GenerationConfig.Temperature = 0.2

	body, err := json.Marshal(geminiReq)
	if err != nil {
		return models.SensorConfig{}, "", err
	}

	candidateModels := buildGeminiCandidateModels(model)
	seen := map[string]bool{}
	orderedModels := make([]string, 0, len(candidateModels))
	for _, m := range candidateModels {
		m = normalizeGeminiModelName(m)
		if m == "" || seen[m] {
			continue
		}
		seen[m] = true
		orderedModels = append(orderedModels, m)
	}

	var respBody []byte
	var selectedModel string
	var lastErr error
	for _, candidate := range orderedModels {
		if hostedCtx.Err() != nil {
			lastErr = hostedCtx.Err()
			break
		}

		candidateRespBody, callErr := callGeminiGenerate(hostedCtx, baseURL, apiKey, candidate, body)
		if callErr == nil {
			respBody = candidateRespBody
			selectedModel = candidate
			lastErr = nil
			break
		}

		lastErr = callErr
		errText := strings.ToLower(callErr.Error())
		if !shouldTryNextGeminiModel(errText) {
			break
		}
	}

	if lastErr != nil {
		return models.SensorConfig{}, "", lastErr
	}

	var geminiResp geminiGenerateResponse
	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return models.SensorConfig{}, "", err
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return models.SensorConfig{}, "", fmt.Errorf("empty gemini response")
	}

	text := strings.TrimSpace(geminiResp.Candidates[0].Content.Parts[0].Text)
	jsonText := extractJSONObject(text)
	if jsonText == "" {
		return models.SensorConfig{}, "", fmt.Errorf("gemini response did not contain valid JSON")
	}
	var suggestion hostedAISuggestion
	if err := json.Unmarshal([]byte(jsonText), &suggestion); err != nil {
		return models.SensorConfig{}, "", err
	}

	if suggestion.ReportIntervalPerDay < 1 {
		suggestion.ReportIntervalPerDay = 1
	}
	if suggestion.ReportIntervalPerDay > 288 {
		suggestion.ReportIntervalPerDay = 288
	}

	if strings.TrimSpace(suggestion.FriendlyName) == "" {
		suggestion.FriendlyName = "Sensor"
	}

	metricThresholds := suggestion.MetricThresholds
	if metricThresholds == nil {
		metricThresholds = map[string]models.ThresholdConfig{}
	}

	metricCount := len(metricThresholds)
	if metricCount == 0 {
		if sensorType == "temperature_humidity" || sensorType == "temp_humidity" || sensorType == "dht11" || sensorType == "dht22" || sensorType == "bme280" || sensorType == "bmp280" {
			metricCount = 2
		} else {
			metricCount = 1
		}
	}

	thresholds := suggestion.Thresholds
	if thresholds == (models.ThresholdConfig{}) {
		for _, cfg := range metricThresholds {
			thresholds = cfg
			break
		}
	}

	config := models.SensorConfig{
		FriendlyName:         suggestion.FriendlyName,
		UseCase:              strings.TrimSpace(suggestion.UseCase),
		PresentationProfile:  strings.TrimSpace(suggestion.PresentationProfile),
		PrimaryMetric:        strings.TrimSpace(suggestion.PrimaryMetric),
		Thresholds:           thresholds,
		MetricThresholds:     metricThresholds,
		ReportIntervalPerDay: suggestion.ReportIntervalPerDay,
		PowerManagement: models.PowerManagementConfig{
			BatteryLifeDays:   estimateBatteryLifeDays(suggestion.ReportIntervalPerDay, metricCount),
			SamplingFrequency: suggestion.ReportIntervalPerDay,
		},
	}

	explanation := suggestion.Explanation
	if explanation == "" {
		explanation = fmt.Sprintf("Configuration suggested by hosted AI model (%s).", selectedModel)
	}

	return config, explanation, nil
}

func normalizeGeminiModelName(model string) string {
	trimmed := strings.TrimSpace(model)
	trimmed = strings.TrimPrefix(trimmed, "models/")
	trimmed = strings.TrimPrefix(trimmed, "/models/")
	trimmed = strings.TrimPrefix(trimmed, "v1beta/models/")
	trimmed = strings.TrimPrefix(trimmed, "/v1beta/models/")
	if idx := strings.Index(trimmed, ":"); idx > 0 {
		trimmed = trimmed[:idx]
	}
	return strings.TrimSpace(trimmed)
}

func normalizeGeminiBaseURL(baseURL string) string {
	trimmed := strings.TrimSpace(baseURL)
	if trimmed == "" {
		return "https://generativelanguage.googleapis.com/v1beta"
	}

	if idx := strings.Index(strings.ToLower(trimmed), "/models/"); idx > 0 {
		trimmed = trimmed[:idx]
	}

	if idx := strings.Index(trimmed, "?"); idx > 0 {
		trimmed = trimmed[:idx]
	}

	return strings.TrimRight(trimmed, "/")
}

func buildGeminiCandidateModels(envModel string) []string {
	normalizedEnv := normalizeGeminiModelName(envModel)
	return []string{
		normalizedEnv,
		"gemini-2.5-flash",
		"gemini-2.0-flash-lite",
	}
}

func callGeminiGenerate(ctx context.Context, baseURL string, apiKey string, model string, requestBody []byte) ([]byte, error) {
	url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", strings.TrimRight(baseURL, "/"), normalizeGeminiModelName(model), apiKey)
	httpClient := &http.Client{Timeout: geminiHTTPTimeout()}

	maxAttempts := geminiMaxAttempts()
	backoff := 1 * time.Second

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(requestBody))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")

		httpResp, err := httpClient.Do(httpReq)
		if err != nil {
			if attempt == maxAttempts {
				return nil, err
			}
			time.Sleep(backoff + time.Duration(rand.Intn(500))*time.Millisecond)
			backoff *= 2
			continue
		}

		respBody, readErr := io.ReadAll(httpResp.Body)
		httpResp.Body.Close()
		if readErr != nil {
			if attempt == maxAttempts {
				return nil, readErr
			}
			time.Sleep(backoff + time.Duration(rand.Intn(500))*time.Millisecond)
			backoff *= 2
			continue
		}

		if httpResp.StatusCode >= 200 && httpResp.StatusCode < 300 {
			return respBody, nil
		}

		status := httpResp.StatusCode
		bodySnippet := strings.TrimSpace(string(respBody))
		if len(bodySnippet) > 300 {
			bodySnippet = bodySnippet[:300]
		}

		if (status == http.StatusTooManyRequests || status >= 500) && attempt < maxAttempts {
			retryAfter := retryAfterDuration(httpResp.Header.Get("Retry-After"))
			if retryAfter <= 0 {
				retryAfter = backoff + time.Duration(rand.Intn(500))*time.Millisecond
				backoff *= 2
			}
			time.Sleep(retryAfter)
			continue
		}

		return nil, fmt.Errorf("gemini api error for model %s: %s | %s", model, httpResp.Status, bodySnippet)
	}

	return nil, fmt.Errorf("gemini api error for model %s: exhausted retries", model)
}

func hostedAITimeout() time.Duration {
	return durationFromEnvMs("GEMINI_TIMEOUT_MS", 12000, 3000, 60000)
}

func geminiHTTPTimeout() time.Duration {
	return durationFromEnvMs("GEMINI_HTTP_TIMEOUT_MS", 8000, 2000, 30000)
}

func aiHistoryQueryTimeout() time.Duration {
	return durationFromEnvMs("AI_HISTORY_QUERY_TIMEOUT_MS", 2000, 500, 10000)
}

func geminiMaxAttempts() int {
	return intFromEnv("GEMINI_MAX_ATTEMPTS", 2, 1, 4)
}

func shouldTryNextGeminiModel(errText string) bool {
	return strings.Contains(errText, "404") ||
		strings.Contains(errText, "429") ||
		strings.Contains(errText, "500") ||
		strings.Contains(errText, "502") ||
		strings.Contains(errText, "503") ||
		strings.Contains(errText, "504") ||
		strings.Contains(errText, "unavailable") ||
		strings.Contains(errText, "high demand")
}

var geminiAPIKeyPattern = regexp.MustCompile(`([?&]key=)[^&\s]+`)

func sanitizeHostedAIError(err error) string {
	if err == nil {
		return ""
	}

	sanitized := geminiAPIKeyPattern.ReplaceAllString(err.Error(), "${1}[redacted]")
	return strings.TrimSpace(sanitized)
}

func hostedAIFallbackExplanation(err error) string {
	errText := strings.ToLower(sanitizeHostedAIError(err))

	switch {
	case strings.Contains(errText, "429") || strings.Contains(errText, "quota"):
		return "Configuration suggested by local fallback logic (hosted Gemini AI quota is currently exhausted)."
	case strings.Contains(errText, "503") || strings.Contains(errText, "unavailable") || strings.Contains(errText, "high demand"):
		return "Configuration suggested by local fallback logic (hosted Gemini AI is temporarily overloaded)."
	case strings.Contains(errText, "deadline exceeded") || strings.Contains(errText, "timeout"):
		return "Configuration suggested by local fallback logic (hosted Gemini AI timed out)."
	default:
		return "Configuration suggested by local fallback logic (hosted Gemini AI is temporarily unavailable)."
	}
}

func durationFromEnvMs(envKey string, fallbackMs int, minMs int, maxMs int) time.Duration {
	valueMs := intFromEnv(envKey, fallbackMs, minMs, maxMs)
	return time.Duration(valueMs) * time.Millisecond
}

func intFromEnv(envKey string, fallback int, min int, max int) int {
	raw := strings.TrimSpace(os.Getenv(envKey))
	if raw == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if parsed < min {
		return min
	}
	if parsed > max {
		return max
	}
	return parsed
}

func retryAfterDuration(value string) time.Duration {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0
	}

	if seconds, err := strconv.Atoi(trimmed); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}

	return 0
}

func extractJSONObject(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}

	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)

	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start == -1 || end == -1 || end <= start {
		return ""
	}

	return strings.TrimSpace(trimmed[start : end+1])
}

func (h *SensorHandler) generateAISuggestion(sensorType string, req models.AISuggestRequest) models.SensorConfig {
	// Default values
	reportsPerDay := 24

	if req.DesiredBatteryLifeDays != nil {
		desired := *req.DesiredBatteryLifeDays
		if desired > 0 {
			reportsPerDay = 720 / desired // 720 = 30 days * 24 reports
		}
	}

	if reportsPerDay < 1 {
		reportsPerDay = 1
	}
	if reportsPerDay > 288 {
		reportsPerDay = 288 // Max 288 reports per day (every 5 minutes)
	}

	// Generate friendly name from purpose
	friendlyName := "Sensor"
	if len(req.Purpose) > 0 {
		// Simple extraction: take first few words
		words := strings.Fields(req.Purpose)
		if len(words) > 0 {
			friendlyName = strings.Join(words[:min(3, len(words))], " ")
		}
	}

	primaryMetric, specs, _ := metricSpecsForSensor(sensorType, req.Context)
	useCase, presentationProfile, normalizedPrimaryMetric, _ := inferUseCaseAndProfile(
		sensorType,
		req.Purpose,
		req.Context,
		"",
		"",
		primaryMetric,
	)
	metricThresholds := map[string]models.ThresholdConfig{}
	for key, spec := range specs {
		metricThresholds[key] = cloneThreshold(spec.Default)
	}

	metricCount := len(metricThresholds)
	thresholds := metricThresholds[primaryMetric]

	batteryLifeDays := estimateBatteryLifeDays(reportsPerDay, metricCount)

	return models.SensorConfig{
		FriendlyName:         friendlyName,
		UseCase:              useCase,
		PresentationProfile:  presentationProfile,
		PrimaryMetric:        normalizedPrimaryMetric,
		Thresholds:           thresholds,
		MetricThresholds:     metricThresholds,
		ReportIntervalPerDay: reportsPerDay,
		PowerManagement: models.PowerManagementConfig{
			BatteryLifeDays:   batteryLifeDays,
			SamplingFrequency: reportsPerDay,
		},
	}
}

func estimateBatteryLifeDays(reportsPerDay int, metricCount int) int {
	if reportsPerDay < 1 {
		reportsPerDay = 1
	}
	if metricCount < 1 {
		metricCount = 1
	}

	const batteryCapacityMah = 2400.0
	const standbyMahPerDay = 2.0
	const txMahPerReportPerMetric = 0.6

	dailyConsumption := standbyMahPerDay + (float64(reportsPerDay) * float64(metricCount) * txMahPerReportPerMetric)
	if dailyConsumption <= 0 {
		return 365
	}

	batteryDays := int(batteryCapacityMah / dailyConsumption)
	if batteryDays < 1 {
		return 1
	}
	if batteryDays > 730 {
		return 730
	}

	return batteryDays
}

func (h *SensorHandler) SaveConfig(w http.ResponseWriter, r *http.Request) {
	sensorID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid sensor id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	metadata, err := h.lookupSensorMetadata(r.Context(), sensorID, accountID)
	if err != nil {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}

	saveReq, err := decodeSaveSensorConfigRequest(r)
	if err != nil || saveReq.Config == nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	contextToStore := mergeSensorContext(saveReq.Context, metadata.StoredContext)
	if contextToStore == nil && saveReq.Config != nil && saveReq.Config.Interpretation != nil {
		contextToStore = mergeSensorContext(saveReq.Config.Interpretation.Context, metadata.StoredContext)
	}

	purposeToStore := strings.TrimSpace(saveReq.Purpose)
	if purposeToStore == "" && saveReq.Config != nil && saveReq.Config.Interpretation != nil {
		purposeToStore = strings.TrimSpace(saveReq.Config.Interpretation.Purpose)
	}
	if purposeToStore == "" {
		purposeToStore = strings.TrimSpace(metadata.StoredPurpose)
	}

	validation := validateAndFinalizeConfig(metadata.SensorType, purposeToStore, contextToStore, *saveReq.Config, metadata.ControllerCapability, metadata.CalibrationStatus)
	configJSON, err := json.Marshal(validation.FinalConfig)
	if err != nil {
		http.Error(w, "failed to marshal config", http.StatusInternalServerError)
		return
	}

	warningsJSON, err := json.Marshal(validation.Warnings)
	if err != nil {
		http.Error(w, "failed to marshal validation warnings", http.StatusInternalServerError)
		return
	}

	appliedRulesJSON, err := json.Marshal(validation.AppliedRules)
	if err != nil {
		http.Error(w, "failed to marshal applied rules", http.StatusInternalServerError)
		return
	}

	contextPayload := contextJSON(contextToStore)
	configuredAt := time.Now().UTC()

	tx, err := h.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		http.Error(w, "failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), `
		UPDATE sensor_configs
		SET active = false
		WHERE sensor_id = $1 AND active = true
	`, sensorID)
	if err != nil {
		http.Error(w, "failed to archive previous config", http.StatusInternalServerError)
		return
	}

	configID := uuid.New()
	_, err = tx.Exec(r.Context(), `
		INSERT INTO sensor_configs (
			id,
			sensor_id,
			config_json,
			active,
			purpose,
			context_json,
			validation_status,
			validation_warnings,
			applied_rules,
			confidence_score,
			created_at
		)
		VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10)
	`, configID, sensorID, configJSON, purposeToStore, contextPayload, validation.ValidationStatus, warningsJSON, appliedRulesJSON, validation.ConfidenceScore, configuredAt)
	if err != nil {
		http.Error(w, "failed to save config", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE sensors
		SET name = $1, purpose = $2, context_json = $3
		WHERE id = $4
	`, validation.FinalConfig.FriendlyName, purposeToStore, contextPayload, sensorID)
	if err != nil {
		http.Error(w, "failed to update sensor metadata", http.StatusInternalServerError)
		return
	}

	if err := resetLearningPhase(r.Context(), tx, "legacy", sensorID); err != nil {
		http.Error(w, "failed to reset learning phase", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to commit config", http.StatusInternalServerError)
		return
	}

	observation := buildSensorObservation(
		true,
		contextToStore,
		&configuredAt,
		&validation.FinalConfig.ReportIntervalPerDay,
		0,
		nil,
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.SaveSensorConfigResponse{
		Status:                   "ok",
		ValidatedConfig:          validation.FinalConfig,
		ValidationStatus:         validation.ValidationStatus,
		Warnings:                 validation.Warnings,
		AppliedRules:             validation.AppliedRules,
		ConfidenceScore:          validation.ConfidenceScore,
		RequiresUserConfirmation: validation.RequiresUserConfirmation,
		ConfigActive:             true,
		Observation:              observation,
	})
}

func floatPtr(f float64) *float64 {
	return &f
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
