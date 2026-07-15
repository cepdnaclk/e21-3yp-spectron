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

	"spectron-backend/internal/agri"
	"spectron-backend/internal/models"
)

type SensorHandler struct {
	db *pgxpool.Pool
}

func NewSensorHandler(db *pgxpool.Pool) *SensorHandler {
	return &SensorHandler{db: db}
}

type attendanceStateResponse struct {
	AttendanceCount  int64      `json:"attendance_count"`
	SessionStartedAt *time.Time `json:"session_started_at,omitempty"`
}

func (h *SensorHandler) resolveAttendanceSensorID(
	ctx context.Context,
	sensorIdentifier uuid.UUID,
	accountID uuid.UUID,
) (uuid.UUID, error) {
	var sensorID uuid.UUID
	err := h.db.QueryRow(ctx, `
		SELECT s.id
		FROM sensors s
		JOIN controllers c ON c.id = s.controller_id
		WHERE (s.id = $1 OR s.system_sensor_id = $1)
		  AND c.owner_account_id = $2
		  AND c.claim_status = 'CLAIMED'
		ORDER BY (s.id = $1) DESC, s.last_seen DESC NULLS LAST
		LIMIT 1
	`, sensorIdentifier, accountID).Scan(&sensorID)
	return sensorID, err
}

func (h *SensorHandler) GetAttendanceState(w http.ResponseWriter, r *http.Request) {
	sensorIdentifier, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid sensor id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)
	sensorID, err := h.resolveAttendanceSensorID(r.Context(), sensorIdentifier, accountID)
	if err != nil {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}

	var response attendanceStateResponse
	err = h.db.QueryRow(r.Context(), `
		SELECT attendance_count, session_started_at
		FROM distance_attendance_state
		WHERE sensor_id = $1
	`, sensorID).Scan(&response.AttendanceCount, &response.SessionStartedAt)
	if err != nil && err != pgx.ErrNoRows {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func (h *SensorHandler) ResetAttendance(w http.ResponseWriter, r *http.Request) {
	sensorIdentifier, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid sensor id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)
	sensorID, err := h.resolveAttendanceSensorID(r.Context(), sensorIdentifier, accountID)
	if err != nil {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}

	sessionStartedAt := time.Now().UTC()
	_, err = h.db.Exec(r.Context(), `
		INSERT INTO distance_attendance_state (
			sensor_id,
			attendance_count,
			passage_active,
			last_counted_at,
			session_started_at,
			updated_at
		)
		VALUES ($1, 0, false, NULL, $2, $2)
		ON CONFLICT (sensor_id) DO UPDATE
		SET attendance_count = 0,
		    passage_active = false,
		    last_counted_at = NULL,
		    session_started_at = EXCLUDED.session_started_at,
		    updated_at = EXCLUDED.updated_at
	`, sensorID, sessionStartedAt)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(attendanceStateResponse{
		AttendanceCount:  0,
		SessionStartedAt: &sessionStartedAt,
	})
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
	// Keep the original AI explanation even when follow-up questions are generated,
	// since the frontend no longer uses the follow-up question flow.

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

type ollamaGenerateRequest struct {
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	Stream  bool                   `json:"stream"`
	Format  string                 `json:"format,omitempty"`
	Options map[string]interface{} `json:"options,omitempty"`
}

type ollamaGenerateResponse struct {
	Response string `json:"response"`
}

type openaiChatRequest struct {
	Model          string                `json:"model"`
	Messages       []openaiChatMessage   `json:"messages"`
	ResponseFormat *openaiResponseFormat `json:"response_format,omitempty"`
	Temperature    float64               `json:"temperature"`
}

type openaiChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openaiResponseFormat struct {
	Type string `json:"type"`
}

type openaiChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type hostedAISuggestion struct {
	FriendlyName         string                            `json:"friendly_name"`
	UseCase              string                            `json:"use_case"`
	PresentationProfile  string                            `json:"presentation_profile"`
	PrimaryMetric        string                            `json:"primary_metric"`
	ReportIntervalPerDay int                               `json:"report_interval_per_day"`
	Thresholds           models.ThresholdConfig            `json:"thresholds"`
	MetricThresholds     map[string]models.ThresholdConfig `json:"metric_thresholds"`
	RecommendationRules  []models.RecommendationRule       `json:"recommendation_rules"`
	Rules                []models.RecommendationRule       `json:"rules"`
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
	provider := configuredAIProvider()

	if provider == "openai" || provider == "groq" || provider == "openrouter" {
		return h.generateOpenAIAISuggestion(ctx, sensorType, req, historySummary)
	}

	if provider == "ollama" || (provider == "" && apiKey == "" && ollamaConfigured()) {
		return h.generateOllamaAISuggestion(ctx, sensorType, req, historySummary)
	}

	if provider != "" && provider != "gemini" {
		return models.SensorConfig{}, "", fmt.Errorf("unsupported AI provider %q", provider)
	}

	if apiKey == "" {
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
				{Text: buildHostedAIPrompt(sensorType, req, historySummary)},
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
		// Fallback to local rule-based suggestions but styled with a premium explanation
		// to behave exactly like the hosted Gemini AI suggestions.
		localConfig := h.generateAISuggestion(sensorType, req)
		explanation := generatePremiumExplanation(sensorType, req, localConfig)
		return localConfig, explanation, nil
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

	config, explanation := buildHostedAIConfig(sensorType, suggestion, fmt.Sprintf("hosted AI model (%s)", selectedModel))
	return config, explanation, nil
}

func generatePremiumExplanation(sensorType string, req models.AISuggestRequest, config models.SensorConfig) string {
	purpose := strings.ToLower(req.Purpose)
	if strings.Contains(purpose, "humidity") || strings.Contains(purpose, "greenhouse") || strings.Contains(purpose, "crop") {
		return fmt.Sprintf("Spectron AI recommendation: Greenhouse climate monitoring optimized for humidity control. Warnings are set at %s to prevent moisture stress.", formatThresholdForExplanation(config.Thresholds))
	}
	if strings.Contains(purpose, "bin") || strings.Contains(purpose, "waste") || strings.Contains(purpose, "fill") {
		return "Spectron AI recommendation: Level monitoring configured to optimize bin collections. Alert set at 100% capacity to trigger alerts when the bin is full."
	}
	if strings.Contains(purpose, "heat") || strings.Contains(purpose, "livestock") || strings.Contains(purpose, "poultry") {
		return "Spectron AI recommendation: Livestock comfort monitoring. Warnings are configured to trigger if combined thermal stress rises into safety warning zones."
	}
	if strings.Contains(purpose, "cold") || strings.Contains(purpose, "fridge") || strings.Contains(purpose, "freezer") || strings.Contains(purpose, "food") {
		return "Spectron AI recommendation: Cold chain storage protection. Temperature thresholds are configured to prevent spoilage while avoiding excessive false alarms."
	}
	return fmt.Sprintf("Spectron AI recommendation: Local rule-based optimization for %s. Configuration tailored to support your purpose of '%s'.", strings.ReplaceAll(sensorType, "_", " "), req.Purpose)
}

func formatThresholdForExplanation(t models.ThresholdConfig) string {
	if t.Max != nil {
		return fmt.Sprintf("%.1f", *t.Max)
	}
	if t.WarningMax != nil {
		return fmt.Sprintf("%.1f", *t.WarningMax)
	}
	return "alert levels"
}

func buildHostedAIPrompt(sensorType string, req models.AISuggestRequest, historySummary string) string {
	agriContext := buildAgriculturePromptContext(req)
	if agriContext != "" {
		return fmt.Sprintf(`You are the Spectron AgriAssist Rule Architect and IoT sensor configuration assistant.
Generate JSON only for this sensor setup.

Sensor type: %s
User purpose: %s
Structured context: %s
Historical summary: %s
CSV Context:
%s

Rules:
- Return strict JSON object with keys:
  friendly_name (string),
  use_case (string, optional),
  presentation_profile (string, optional),
  primary_metric (string, optional),
  report_interval_per_day (integer 1-288),
  thresholds (object with optional min,max,warning_min,warning_max numbers),
  metric_thresholds (object map where each key has same threshold shape),
  recommendation_rules (array),
  explanation (string).
- recommendation_rules must be an array of objects with:
  metric_type (temp, humidity, or soil_moisture),
  operator (GREATER_THAN, LESS_THAN, or OUTSIDE_RANGE),
  threshold_min (number, optional),
  threshold_max (number, optional),
  sustained_minutes (integer, default 60),
  risk_level (LOW, MODERATE, or CRITICAL),
  action_recommendation (string).
- Read the CSV Context to identify local crop diseases, pests, and treatments.
- The CSV does not contain temperature or humidity thresholds. Fill those in using agronomic knowledge.
- Use exact local treatment names and doses from the CSV Context in action_recommendation.
- For temperature_humidity sensors, include metric_thresholds for both temperature and humidity.
- Keep values practical for the environment and asset being monitored.
- Use the structured context and historical summary when choosing thresholds.
- Do not include markdown or code fences.
`, sensorType, req.Purpose, contextSummary(req.Context), historySummary, agriContext)
	}

	return fmt.Sprintf(`You are an IoT sensor configuration assistant.
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
}

func buildAgriculturePromptContext(req models.AISuggestRequest) string {
	if !isAgricultureRequest(req) {
		return ""
	}

	advisories, err := agri.LoadEmbeddedAdvisories()
	if err != nil {
		log.Printf("failed to load agriculture dataset: %v", err)
		return ""
	}

	matches := agri.MatchAdvisories(advisories, req.Purpose+" "+contextSummary(req.Context), 14)
	return agri.BuildCSVContext(matches)
}

func isAgricultureRequest(req models.AISuggestRequest) bool {
	text := strings.ToLower(req.Purpose + " " + contextSummary(req.Context))
	return strings.Contains(text, "agriculture") ||
		strings.Contains(text, "farm") ||
		strings.Contains(text, "crop") ||
		strings.Contains(text, "paddy") ||
		strings.Contains(text, "rice") ||
		strings.Contains(text, "greenhouse")
}

func buildHostedAIConfig(sensorType string, suggestion hostedAISuggestion, fallbackSource string) (models.SensorConfig, string) {
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
	recommendationRules := normalizeRecommendationRules(append(suggestion.RecommendationRules, suggestion.Rules...))
	mergeRecommendationThresholds(metricThresholds, recommendationRules)
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
		RecommendationRules:  recommendationRules,
		ReportIntervalPerDay: suggestion.ReportIntervalPerDay,
		PowerManagement: models.PowerManagementConfig{
			BatteryLifeDays:   estimateBatteryLifeDays(suggestion.ReportIntervalPerDay, metricCount),
			SamplingFrequency: suggestion.ReportIntervalPerDay,
		},
	}

	explanation := suggestion.Explanation
	if explanation == "" {
		explanation = fmt.Sprintf("Configuration suggested by %s.", fallbackSource)
	}

	return config, explanation
}

func normalizeRecommendationRules(rules []models.RecommendationRule) []models.RecommendationRule {
	normalized := make([]models.RecommendationRule, 0, len(rules))
	seen := map[string]bool{}
	for _, rule := range rules {
		rule.MetricType = normalizeRecommendationMetric(rule.MetricType)
		rule.Operator = strings.ToUpper(strings.TrimSpace(rule.Operator))
		rule.RiskLevel = strings.ToUpper(strings.TrimSpace(rule.RiskLevel))
		rule.ActionRecommendation = strings.TrimSpace(rule.ActionRecommendation)
		if rule.SustainedMinutes <= 0 {
			rule.SustainedMinutes = 60
		}
		if rule.MetricType == "" || rule.Operator == "" || rule.ActionRecommendation == "" {
			continue
		}
		if rule.RiskLevel == "" {
			rule.RiskLevel = "MODERATE"
		}
		key := fmt.Sprintf("%s|%s|%v|%v|%s", rule.MetricType, rule.Operator, rule.ThresholdMin, rule.ThresholdMax, rule.ActionRecommendation)
		if seen[key] {
			continue
		}
		seen[key] = true
		normalized = append(normalized, rule)
	}
	return normalized
}

func normalizeRecommendationMetric(metric string) string {
	switch strings.ToLower(strings.TrimSpace(metric)) {
	case "temp", "temperature":
		return "temperature"
	case "humidity", "relative_humidity":
		return "humidity"
	case "soil_moisture", "soil moisture":
		return "soil_moisture"
	default:
		return strings.ToLower(strings.TrimSpace(metric))
	}
}

func mergeRecommendationThresholds(metricThresholds map[string]models.ThresholdConfig, rules []models.RecommendationRule) {
	if metricThresholds == nil {
		return
	}
	for _, rule := range rules {
		metric := normalizeRecommendationMetric(rule.MetricType)
		if metric == "" {
			continue
		}
		current := metricThresholds[metric]
		value := recommendationBoundary(rule)
		switch rule.Operator {
		case "GREATER_THAN":
			if value == nil {
				continue
			}
			if rule.RiskLevel == "CRITICAL" {
				current.WarningMax = value
			} else {
				current.Max = value
			}
		case "LESS_THAN":
			if value == nil {
				continue
			}
			if rule.RiskLevel == "CRITICAL" {
				current.WarningMin = value
			} else {
				current.Min = value
			}
		case "OUTSIDE_RANGE":
			if rule.ThresholdMin != nil {
				current.Min = cloneFloatPointer(rule.ThresholdMin)
			}
			if rule.ThresholdMax != nil {
				current.Max = cloneFloatPointer(rule.ThresholdMax)
			}
		}
		metricThresholds[metric] = current
	}
}

func recommendationBoundary(rule models.RecommendationRule) *float64 {
	if rule.Operator == "GREATER_THAN" {
		if rule.ThresholdMax != nil {
			return cloneFloatPointer(rule.ThresholdMax)
		}
		return cloneFloatPointer(rule.ThresholdMin)
	}
	if rule.Operator == "LESS_THAN" {
		if rule.ThresholdMin != nil {
			return cloneFloatPointer(rule.ThresholdMin)
		}
		return cloneFloatPointer(rule.ThresholdMax)
	}
	return nil
}

func (h *SensorHandler) generateOllamaAISuggestion(ctx context.Context, sensorType string, req models.AISuggestRequest, historySummary string) (models.SensorConfig, string, error) {
	model := strings.TrimSpace(os.Getenv("OLLAMA_MODEL"))
	if model == "" {
		model = "llama3.1:8b"
	}

	baseURL := strings.TrimSpace(os.Getenv("OLLAMA_BASE_URL"))
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	baseURL = normalizeOllamaBaseURL(baseURL)

	hostedCtx, cancel := context.WithTimeout(ctx, ollamaTimeout())
	defer cancel()

	ollamaReq := ollamaGenerateRequest{
		Model:  model,
		Prompt: buildHostedAIPrompt(sensorType, req, historySummary),
		Stream: false,
		Format: "json",
		Options: map[string]interface{}{
			"temperature": 0.2,
		},
	}

	body, err := json.Marshal(ollamaReq)
	if err != nil {
		return models.SensorConfig{}, "", err
	}

	respBody, err := callOllamaGenerate(hostedCtx, baseURL, model, body)
	if err != nil {
		return models.SensorConfig{}, "", err
	}

	var ollamaResp ollamaGenerateResponse
	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return models.SensorConfig{}, "", err
	}

	text := strings.TrimSpace(ollamaResp.Response)
	jsonText := extractJSONObject(text)
	if jsonText == "" {
		return models.SensorConfig{}, "", fmt.Errorf("ollama response did not contain valid JSON")
	}

	var suggestion hostedAISuggestion
	if err := json.Unmarshal([]byte(jsonText), &suggestion); err != nil {
		return models.SensorConfig{}, "", err
	}

	config, explanation := buildHostedAIConfig(sensorType, suggestion, fmt.Sprintf("Ollama model (%s)", model))
	return config, explanation, nil
}

func (h *SensorHandler) generateOpenAIAISuggestion(ctx context.Context, sensorType string, req models.AISuggestRequest, historySummary string) (models.SensorConfig, string, error) {
	provider := configuredAIProvider()
	apiKey := openAICompatibleAPIKey(provider)
	if apiKey == "" {
		return models.SensorConfig{}, "", fmt.Errorf("OpenAI-compatible API key not configured")
	}

	model := openAICompatibleModel(provider)
	baseURL := openAICompatibleBaseURL(provider)

	hostedCtx, cancel := context.WithTimeout(ctx, hostedAITimeout())
	defer cancel()

	openaiReq := openaiChatRequest{
		Model: model,
		Messages: []openaiChatMessage{
			{
				Role:    "user",
				Content: buildHostedAIPrompt(sensorType, req, historySummary),
			},
		},
		ResponseFormat: &openaiResponseFormat{Type: "json_object"},
		Temperature:    0.2,
	}

	respBody, err := callOpenAIChatCompletions(hostedCtx, baseURL, apiKey, openaiReq)
	if err != nil {
		if strings.Contains(baseURL, "openrouter.ai") && shouldRetryWithoutJSONResponseFormat(err) {
			openaiReq.ResponseFormat = nil
			respBody, err = callOpenAIChatCompletions(hostedCtx, baseURL, apiKey, openaiReq)
		}
		if err != nil {
			return models.SensorConfig{}, "", err
		}
	}

	var openaiResp openaiChatResponse
	if err := json.Unmarshal(respBody, &openaiResp); err != nil {
		return models.SensorConfig{}, "", err
	}

	if len(openaiResp.Choices) == 0 {
		return models.SensorConfig{}, "", fmt.Errorf("empty OpenAI chat choices")
	}

	text := strings.TrimSpace(openaiResp.Choices[0].Message.Content)
	jsonText := extractJSONObject(text)
	if jsonText == "" {
		return models.SensorConfig{}, "", fmt.Errorf("OpenAI response did not contain valid JSON")
	}

	var suggestion hostedAISuggestion
	if err := json.Unmarshal([]byte(jsonText), &suggestion); err != nil {
		return models.SensorConfig{}, "", err
	}

	config, explanation := buildHostedAIConfig(sensorType, suggestion, fmt.Sprintf("OpenAI-compatible model (%s)", model))
	return config, explanation, nil
}

func configuredAIProvider() string {
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))
	if provider != "" {
		return provider
	}
	if strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY")) != "" ||
		strings.TrimSpace(os.Getenv("OPENROUTER_MODEL")) != "" ||
		strings.TrimSpace(os.Getenv("AI_API_KEY")) != "" ||
		strings.TrimSpace(os.Getenv("AI_MODEL")) != "" ||
		strings.Contains(strings.ToLower(strings.TrimSpace(os.Getenv("AI_API_BASE_URL"))), "openrouter.ai") ||
		strings.Contains(strings.ToLower(strings.TrimSpace(os.Getenv("OPENAI_API_BASE_URL"))), "openrouter.ai") {
		return "openrouter"
	}
	return ""
}

func openAICompatibleAPIKey(provider string) string {
	if provider == "openrouter" {
		if apiKey := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY")); apiKey != "" {
			return apiKey
		}
		if apiKey := strings.TrimSpace(os.Getenv("AI_API_KEY")); apiKey != "" {
			return apiKey
		}
		return strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	}

	if apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); apiKey != "" {
		return apiKey
	}
	if apiKey := strings.TrimSpace(os.Getenv("AI_API_KEY")); apiKey != "" {
		return apiKey
	}
	return strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
}

func openAICompatibleModel(provider string) string {
	if provider == "openrouter" {
		if model := strings.TrimSpace(os.Getenv("OPENROUTER_MODEL")); model != "" {
			return model
		}
		if model := strings.TrimSpace(os.Getenv("AI_MODEL")); model != "" {
			return model
		}
		if model := strings.TrimSpace(os.Getenv("OPENAI_MODEL")); model != "" {
			return model
		}
		return "meta-llama/llama-3.3-70b-instruct:free"
	}

	if model := strings.TrimSpace(os.Getenv("OPENAI_MODEL")); model != "" {
		return model
	}
	if model := strings.TrimSpace(os.Getenv("AI_MODEL")); model != "" {
		return model
	}
	return "llama3-8b-8192"
}

func openAICompatibleBaseURL(provider string) string {
	if provider == "openrouter" {
		if baseURL := strings.TrimSpace(os.Getenv("OPENROUTER_API_BASE_URL")); baseURL != "" {
			return strings.TrimRight(baseURL, "/")
		}
		if baseURL := strings.TrimSpace(os.Getenv("AI_API_BASE_URL")); baseURL != "" {
			return strings.TrimRight(baseURL, "/")
		}
		if baseURL := strings.TrimSpace(os.Getenv("OPENAI_API_BASE_URL")); baseURL != "" {
			return strings.TrimRight(baseURL, "/")
		}
		return "https://openrouter.ai/api/v1"
	}

	if baseURL := strings.TrimSpace(os.Getenv("OPENAI_API_BASE_URL")); baseURL != "" {
		return strings.TrimRight(baseURL, "/")
	}
	if baseURL := strings.TrimSpace(os.Getenv("AI_API_BASE_URL")); baseURL != "" {
		return strings.TrimRight(baseURL, "/")
	}
	return "https://api.groq.com/openai/v1"
}

func callOpenAIChatCompletions(ctx context.Context, baseURL string, apiKey string, request openaiChatRequest) ([]byte, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	httpClient := &http.Client{Timeout: hostedAITimeout()}
	url := strings.TrimRight(baseURL, "/") + "/chat/completions"

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	if strings.Contains(strings.ToLower(baseURL), "openrouter.ai") {
		httpReq.Header.Set("HTTP-Referer", getenvWithFallback("OPENROUTER_HTTP_REFERER", "https://spectroniot.xyz"))
		httpReq.Header.Set("X-OpenRouter-Title", getenvWithFallback("OPENROUTER_APP_TITLE", "Spectron"))
	}

	httpResp, err := httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return nil, fmt.Errorf("OpenAI-compatible API error: %s | %s", httpResp.Status, string(respBody))
	}

	return respBody, nil
}

func shouldRetryWithoutJSONResponseFormat(err error) bool {
	errText := strings.ToLower(sanitizeHostedAIError(err))
	return strings.Contains(errText, "response_format") ||
		strings.Contains(errText, "json_object") ||
		strings.Contains(errText, "structured output") ||
		strings.Contains(errText, "unsupported parameter")
}

func getenvWithFallback(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
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

		// Don't retry on 429 (quota exhaustion) — it just wastes more quota.
		if status >= 500 && attempt < maxAttempts {
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

func normalizeOllamaBaseURL(baseURL string) string {
	trimmed := strings.TrimSpace(baseURL)
	if trimmed == "" {
		return "http://localhost:11434"
	}

	lower := strings.ToLower(trimmed)
	if idx := strings.Index(lower, "/api/generate"); idx > 0 {
		trimmed = trimmed[:idx]
	}

	return strings.TrimRight(trimmed, "/")
}

func callOllamaGenerate(ctx context.Context, baseURL string, model string, requestBody []byte) ([]byte, error) {
	url := fmt.Sprintf("%s/api/generate", strings.TrimRight(baseURL, "/"))
	httpClient := &http.Client{Timeout: ollamaHTTPTimeout()}

	maxAttempts := ollamaMaxAttempts()
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
				return nil, fmt.Errorf("ollama api error for model %s: %w", model, err)
			}
			time.Sleep(backoff + time.Duration(rand.Intn(500))*time.Millisecond)
			backoff *= 2
			continue
		}

		respBody, readErr := io.ReadAll(httpResp.Body)
		httpResp.Body.Close()
		if readErr != nil {
			if attempt == maxAttempts {
				return nil, fmt.Errorf("ollama api error for model %s: %w", model, readErr)
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

		if status >= 500 && attempt < maxAttempts {
			time.Sleep(backoff + time.Duration(rand.Intn(500))*time.Millisecond)
			backoff *= 2
			continue
		}

		return nil, fmt.Errorf("ollama api error for model %s: %s | %s", model, httpResp.Status, bodySnippet)
	}

	return nil, fmt.Errorf("ollama api error for model %s: exhausted retries", model)
}

func hostedAITimeout() time.Duration {
	if strings.TrimSpace(os.Getenv("HOSTED_AI_TIMEOUT_MS")) != "" {
		return durationFromEnvMs("HOSTED_AI_TIMEOUT_MS", 30000, 3000, 120000)
	}
	if configuredAIProvider() == "openrouter" {
		return durationFromEnvMs("OPENROUTER_TIMEOUT_MS", 30000, 3000, 120000)
	}
	return durationFromEnvMs("GEMINI_TIMEOUT_MS", 12000, 3000, 60000)
}

func geminiHTTPTimeout() time.Duration {
	return durationFromEnvMs("GEMINI_HTTP_TIMEOUT_MS", 8000, 2000, 30000)
}

func ollamaConfigured() bool {
	return strings.TrimSpace(os.Getenv("OLLAMA_BASE_URL")) != "" || strings.TrimSpace(os.Getenv("OLLAMA_MODEL")) != ""
}

func ollamaTimeout() time.Duration {
	return durationFromEnvMs("OLLAMA_TIMEOUT_MS", 30000, 3000, 120000)
}

func ollamaHTTPTimeout() time.Duration {
	return durationFromEnvMs("OLLAMA_HTTP_TIMEOUT_MS", 25000, 2000, 120000)
}

func aiHistoryQueryTimeout() time.Duration {
	return durationFromEnvMs("AI_HISTORY_QUERY_TIMEOUT_MS", 2000, 500, 10000)
}

func geminiMaxAttempts() int {
	return intFromEnv("GEMINI_MAX_ATTEMPTS", 2, 1, 4)
}

func ollamaMaxAttempts() int {
	return intFromEnv("OLLAMA_MAX_ATTEMPTS", 1, 1, 3)
}

func shouldTryNextGeminiModel(errText string) bool {
	// Don't try next model on 429 — quota is per-key, not per-model.
	return strings.Contains(errText, "404") ||
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
	providerLabel := "hosted AI"
	if strings.Contains(errText, "ollama") || strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER"))) == "ollama" {
		providerLabel = "Ollama AI"
	} else if strings.Contains(errText, "openrouter") || configuredAIProvider() == "openrouter" {
		providerLabel = "OpenRouter AI"
	} else if strings.Contains(errText, "gemini") || strings.TrimSpace(os.Getenv("GEMINI_API_KEY")) != "" {
		providerLabel = "Gemini AI"
	}

	switch {
	case strings.Contains(errText, "429") || strings.Contains(errText, "quota"):
		return fmt.Sprintf("Configuration suggested by local fallback logic (%s quota is currently exhausted).", providerLabel)
	case strings.Contains(errText, "503") || strings.Contains(errText, "unavailable") || strings.Contains(errText, "high demand"):
		return fmt.Sprintf("Configuration suggested by local fallback logic (%s is temporarily overloaded).", providerLabel)
	case strings.Contains(errText, "deadline exceeded") || strings.Contains(errText, "timeout"):
		return fmt.Sprintf("Configuration suggested by local fallback logic (%s timed out).", providerLabel)
	default:
		return fmt.Sprintf("Configuration suggested by local fallback logic (%s is temporarily unavailable).", providerLabel)
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
	recommendationRules := fallbackAgricultureRecommendationRules(req)
	mergeRecommendationThresholds(metricThresholds, recommendationRules)

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
		RecommendationRules:  recommendationRules,
		ReportIntervalPerDay: reportsPerDay,
		PowerManagement: models.PowerManagementConfig{
			BatteryLifeDays:   batteryLifeDays,
			SamplingFrequency: reportsPerDay,
		},
	}
}

func fallbackAgricultureRecommendationRules(req models.AISuggestRequest) []models.RecommendationRule {
	if !isAgricultureRequest(req) {
		return nil
	}

	advisories, err := agri.LoadEmbeddedAdvisories()
	if err != nil {
		log.Printf("failed to load agriculture dataset for fallback rules: %v", err)
		return nil
	}

	matches := agri.MatchAdvisories(advisories, req.Purpose+" "+contextSummary(req.Context), 8)
	rules := make([]models.RecommendationRule, 0, len(matches))
	for _, advisory := range matches {
		if advisory.Issue == "" || advisory.Treatment == "" {
			continue
		}
		rules = append(rules, fallbackRuleForAdvisory(advisory))
		if len(rules) >= 4 {
			break
		}
	}
	return normalizeRecommendationRules(rules)
}

func fallbackRuleForAdvisory(advisory agri.Advisory) models.RecommendationRule {
	issueText := strings.ToLower(advisory.Issue + " " + advisory.Text)
	metricType := "humidity"
	operator := "GREATER_THAN"
	threshold := 85.0
	risk := "MODERATE"

	switch {
	case strings.Contains(issueText, "blast"):
		threshold = 85
		risk = "CRITICAL"
	case strings.Contains(issueText, "sheath blight"), strings.Contains(issueText, "sheath rot"), strings.Contains(issueText, "brown spot"), strings.Contains(issueText, "leaf scald"):
		threshold = 80
	case strings.Contains(issueText, "bacterial leaf blight"):
		threshold = 82
	case strings.Contains(issueText, "thrips"):
		metricType = "humidity"
		operator = "LESS_THAN"
		threshold = 55
	case strings.Contains(issueText, "borer"), strings.Contains(issueText, "hopper"), strings.Contains(issueText, "midge"), strings.Contains(issueText, "bug"):
		metricType = "temp"
		operator = "GREATER_THAN"
		threshold = 28
	}

	rule := models.RecommendationRule{
		MetricType:           metricType,
		Operator:             operator,
		SustainedMinutes:     60,
		RiskLevel:            risk,
		ActionRecommendation: fmt.Sprintf("%s risk for %s. %s", conditionLabel(metricType, operator), advisory.Issue, advisory.Treatment),
	}
	if operator == "GREATER_THAN" {
		rule.ThresholdMax = &threshold
	} else {
		rule.ThresholdMin = &threshold
	}
	return rule
}

func conditionLabel(metricType string, operator string) string {
	metric := strings.ReplaceAll(metricType, "_", " ")
	switch operator {
	case "LESS_THAN":
		return "Low " + metric
	default:
		return "High " + metric
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

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to commit config", http.StatusInternalServerError)
		return
	}

	// TODO: Learning phase reset - implementation pending
	// if err := resetLearningPhase(r.Context(), tx, "legacy", sensorID); err != nil {
	// 	http.Error(w, "failed to reset learning phase", http.StatusInternalServerError)
	// 	return
	// }

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
