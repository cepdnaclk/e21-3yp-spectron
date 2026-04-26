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
		SELECT account_id FROM controllers WHERE id = $1
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
		WHERE s.id = $1 AND c.account_id = $2
	`, sensorID, accountID))
	if err != nil {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(s)
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
	historyDays := 14
	if mergedContext != nil && mergedContext.HistoricalWindowDays != nil && *mergedContext.HistoricalWindowDays > 0 {
		historyDays = *mergedContext.HistoricalWindowDays
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
		log.Printf("hosted AI unavailable, using fallback: %v", hostedErr)
		suggestedConfig = h.generateAISuggestion(metadata.SensorType, req)
		explanation = fmt.Sprintf("Configuration suggested by local fallback logic (%v).", hostedErr)
	}

	validation := validateAndFinalizeConfig(metadata.SensorType, req.Purpose, mergedContext, suggestedConfig, metadata.ControllerCapability, metadata.CalibrationStatus)
	if validation.ValidationStatus == "adjusted" {
		explanation = strings.TrimSpace(explanation + " The backend safety validator adjusted one or more values before returning the final recommendation.")
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

func (h *SensorHandler) generateHostedAISuggestion(ctx context.Context, sensorType string, req models.AISuggestRequest, historySummary string) (models.SensorConfig, string, error) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))

	if apiKey == "" || (provider != "" && provider != "gemini") {
		return models.SensorConfig{}, "", fmt.Errorf("hosted AI not configured")
	}

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
		candidateRespBody, callErr := callGeminiGenerate(ctx, baseURL, apiKey, candidate, body)
		if callErr == nil {
			respBody = candidateRespBody
			selectedModel = candidate
			lastErr = nil
			break
		}

		lastErr = callErr
		errText := strings.ToLower(callErr.Error())
		if !(strings.Contains(errText, "404") || strings.Contains(errText, "429")) {
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
		if sensorType == "temperature_humidity" || sensorType == "temp_humidity" || sensorType == "dht11" || sensorType == "dht22" {
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
		"gemini-2.5-flash-latest",
		"gemini-2.5-flash-001",
		"gemini-2.0-flash",
		"gemini-2.0-flash-001",
		"gemini-2.0-flash-lite",
		"gemini-2.0-flash-lite-001",
		"gemini-1.5-flash",
		"gemini-1.5-flash-latest",
	}
}

func callGeminiGenerate(ctx context.Context, baseURL string, apiKey string, model string, requestBody []byte) ([]byte, error) {
	url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", strings.TrimRight(baseURL, "/"), normalizeGeminiModelName(model), apiKey)
	httpClient := &http.Client{Timeout: 20 * time.Second}

	maxAttempts := 6
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
	purposeToStore := strings.TrimSpace(saveReq.Purpose)
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
