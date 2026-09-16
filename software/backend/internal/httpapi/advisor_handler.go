package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"spectron-backend/internal/advisor"
	"spectron-backend/internal/knowledge"
	"spectron-backend/internal/weather"
)

type advisorRequest struct {
	Observation string `json:"observation"`
}

func (h *FarmHandler) GenerateFieldAdvice(w http.ResponseWriter, r *http.Request) {
	access, fieldID, ok := h.requireFieldAccess(w, r, true)
	if !ok {
		return
	}
	var req advisorRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Observation = strings.TrimSpace(req.Observation)
	if len(req.Observation) < 3 || len(req.Observation) > 1000 {
		http.Error(w, "observation must be between 3 and 1000 characters", http.StatusBadRequest)
		return
	}

	var cropInstanceID, cropID uuid.UUID
	var cropName string
	var stage *string
	err := h.db.QueryRow(r.Context(), `SELECT ci.id, ci.crop_id, c.name, gs.stage_name FROM crop_instances ci JOIN crops c ON c.id=ci.crop_id LEFT JOIN growth_stages gs ON gs.id=ci.current_stage_id WHERE ci.field_id=$1 AND ci.active=true ORDER BY ci.created_at DESC LIMIT 1`, fieldID).Scan(&cropInstanceID, &cropID, &cropName, &stage)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "set up the field crop before asking for advice", http.StatusConflict)
		return
	}
	if err != nil {
		http.Error(w, "failed to load field crop", http.StatusInternalServerError)
		return
	}
	stageName := "Unknown"
	if stage != nil && strings.TrimSpace(*stage) != "" {
		stageName = strings.TrimSpace(*stage)
	}

	matchedContext, contextErr := h.loadAdviceKnowledge(
		r,
		cropID,
		stageName,
		req.Observation,
	)
	if contextErr != nil {
		log.Printf("advisor knowledge retrieval failed for field %s: %v", fieldID, contextErr)
		http.Error(w, "crop guidance is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	sensorSummary := h.fieldSensorSummary(r, fieldID)
	weatherSummary := h.fieldWeatherSummary(r, fieldID)
	recentProblems, err := h.loadRecentFieldProblemHistory(r, fieldID, cropInstanceID, uuid.Nil)
	if err != nil {
		log.Printf("advisor problem history failed for field %s: %v", fieldID, err)
		http.Error(w, "recent field history is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	provider := advisor.NewProvider()
	result, err := provider.Generate(r.Context(), advisor.Request{
		Crop: cropName, Stage: stageName, Observation: req.Observation,
		SensorSummary: sensorSummary, WeatherSummary: weatherSummary,
		CropContext: matchedContext,
	})
	if err != nil {
		log.Printf("advisor provider fallback for field %s: %v", fieldID, err)
		result = fallbackDirectFieldAdvice(cropName, stageName, req.Observation, sensorSummary, weatherSummary, recentProblems, matchedContext)
	}
	resultJSON, err := json.Marshal(result)
	if err != nil {
		http.Error(w, "failed to save advice", http.StatusInternalServerError)
		return
	}
	ids := make([]uuid.UUID, 0, len(matchedContext))
	for _, match := range matchedContext {
		ids = append(ids, match.ID)
	}
	id := uuid.New()
	_, err = h.db.Exec(r.Context(), `INSERT INTO advisor_recommendations (id,field_id,crop_instance_id,requested_by_user_id,observation,sensor_summary,weather_summary,knowledge_entry_ids,result_json,model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, id, fieldID, cropInstanceID, access.userID, req.Observation, sensorSummary, weatherSummary, ids, resultJSON, strings.TrimSpace(os.Getenv("GROQ_MODEL")))
	if err != nil {
		http.Error(w, "failed to save advice", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "crop": cropName, "stage": stageName, "observation": req.Observation, "advice": result, "created": true})
}

func fallbackDirectFieldAdvice(
	cropName string,
	stageName string,
	observation string,
	sensorSummary string,
	weatherSummary string,
	recentProblems []map[string]any,
	matches []knowledge.Match,
) advisor.Result {
	focus, action, question, specificCheck := fallbackAdviceFocus(observation)
	headline := fmt.Sprintf("Check %s in the %s Field before treatment.", focus, cropName)
	evidence := make([]string, 0, 3)
	if text := strings.TrimSpace(observation); text != "" {
		evidence = append(evidence, fmt.Sprintf("Farmer reported: %s", text))
	}
	if text := strings.TrimSpace(sensorSummary); text != "" {
		evidence = append(evidence, summarizeAdvisorFallbackText(text))
	}
	if text := strings.TrimSpace(weatherSummary); text != "" {
		evidence = append(evidence, summarizeAdvisorFallbackText(text))
	}
	if len(evidence) > 3 {
		evidence = evidence[:3]
	}

	checkNext := []string{
		specificCheck,
		"Check 5 to 10 representative plants and note whether the symptom is spreading, stable, or limited to one patch.",
		"Compare affected plants with healthy plants of the same stage before changing irrigation or applying treatment.",
	}
	if len(matches) > 0 {
		topic := strings.TrimSpace(matches[0].Topic)
		if topic == "" {
			topic = strings.TrimSpace(matches[0].Content)
		}
		if topic != "" {
			checkNext = append([]string{fmt.Sprintf("Compare the symptom with the crop reference note for %s.", summarizeAdvisorFallbackText(topic))}, checkNext...)
		}
	}

	doNow := []string{
		"Walk the affected area now and mark a few plants so you can recheck the same plants later today.",
		action,
		"Check the root-zone soil by hand near affected plants and compare it with a nearby healthy area before changing watering.",
	}
	if len(recentProblems) > 0 {
		doNow = append(doNow, "Compare this symptom with the recent problem already recorded for this Field before repeating the same action.")
	}

	result := advisor.Result{
		Status:             "NEEDS_ATTENTION",
		Headline:           headline,
		WhatMayBeHappening: advisor.AdvisorText(fmt.Sprintf("The reported %s in %s during %s may be linked to stress, disease pressure, watering imbalance, or normal aging. The cause is still uncertain, so confirm the visible symptom in the Field before taking treatment action.", strings.ToLower(focus), cropName, stageName)),
		DoNow:              doNow,
		CheckNext:          checkNext,
		WhyThisAdvice: []string{
			"The observation suggests a real crop change, but the exact cause is not confirmed.",
			"Sensor and weather context should support the field inspection, not replace it.",
			"Careful checking helps avoid unnecessary spraying, fertilizing, or irrigation changes.",
		},
		AvoidForNow: []string{
			"Do not spray, fertilize, or heavily change irrigation before confirming the visible symptom.",
			"Do not treat this as a confirmed disease diagnosis from AI or sensor data alone.",
		},
		RecheckAfter: advisor.AdvisorText("Recheck the marked plants later today and again tomorrow morning."),
		GetHelpIf: []string{
			"The symptom spreads quickly across the Field in one day.",
			"Plants show severe wilting, stem rot, dark lesions, or rapid fruit loss.",
			"The same symptom continues after careful rechecking and basic field corrections.",
		},
		TellUsNext:  advisor.AdvisorText(question),
		SafetyNote:  advisor.AdvisorText("This is decision support only. Confirm the symptom in the Field before treatment."),
		Confidence:  "LOW",
		Evidence:    evidence,
		Summary:     headline,
		ActionsNow:  doNow,
		MonitorNext: checkNext,
		Recheck:     advisor.AdvisorText("Recheck the marked plants later today and again tomorrow morning."),
	}
	return result
}

func summarizeAdvisorFallbackText(value string) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= 160 {
		return trimmed
	}
	return trimmed[:157] + "..."
}

func (h *FarmHandler) loadRecentFieldProblemHistory(
	r *http.Request,
	fieldID uuid.UUID,
	cropInstanceID uuid.UUID,
	excludeProblemID uuid.UUID,
) ([]map[string]any, error) {
	query := `
		SELECT fp.title,fp.observation,fp.status,fp.created_at,fp.resolved_at,
		       fp.resolution_helpful,fp.resolution_comment,latest.result_json
		FROM field_problems fp
		LEFT JOIN LATERAL (
			SELECT result_json
			FROM advisor_recommendations
			WHERE problem_id=fp.id
			ORDER BY turn_number DESC
			LIMIT 1
		) latest ON true
		WHERE fp.field_id=$1
		  AND fp.crop_instance_id=$2
		  AND fp.updated_at >= NOW() - INTERVAL '30 days'`
	args := []any{fieldID, cropInstanceID}
	if excludeProblemID != uuid.Nil {
		query += " AND fp.id<>$3"
		args = append(args, excludeProblemID)
	}
	query += " ORDER BY fp.updated_at DESC LIMIT 6"

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]map[string]any, 0, 6)
	for rows.Next() {
		var title, observation, status string
		var created time.Time
		var resolved *time.Time
		var helpful *bool
		var comment *string
		var latest json.RawMessage
		if err := rows.Scan(
			&title,
			&observation,
			&status,
			&created,
			&resolved,
			&helpful,
			&comment,
			&latest,
		); err != nil {
			return nil, err
		}
		item := map[string]any{
			"title":              title,
			"farmer_observation": observation,
			"status":             status,
			"reported_at":        created.UTC().Format(time.RFC3339),
		}
		if resolved != nil {
			item["resolved_at"] = resolved.UTC().Format(time.RFC3339)
		}
		if helpful != nil {
			item["advice_was_helpful"] = *helpful
		}
		if comment != nil && strings.TrimSpace(*comment) != "" {
			item["farmer_resolution_note"] = strings.TrimSpace(*comment)
		}
		if len(latest) > 0 {
			var summary struct {
				Headline string `json:"headline"`
				Summary  string `json:"summary"`
			}
			if json.Unmarshal(latest, &summary) == nil {
				if headline := strings.TrimSpace(summary.Headline); headline != "" {
					item["last_advice_summary"] = headline
				} else if summaryText := strings.TrimSpace(summary.Summary); summaryText != "" {
					item["last_advice_summary"] = summaryText
				}
			}
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (h *FarmHandler) loadAdviceKnowledge(
	r *http.Request,
	cropID uuid.UUID,
	stage string,
	observation string,
) ([]knowledge.Match, error) {
	relevant, relevantErr := knowledge.Retrieve(
		r.Context(),
		h.db,
		cropID,
		stage,
		observation,
		24,
	)
	all, allErr := knowledge.RetrieveAll(r.Context(), h.db, cropID, 120)
	if allErr != nil {
		return nil, allErr
	}
	if relevantErr != nil || len(relevant) == 0 {
		return all, nil
	}

	// Keep the complete crop reference available, but put symptom- and
	// stage-matched entries first so the model does not lose the farmer's
	// immediate problem inside a large reference document.
	combined := make([]knowledge.Match, 0, len(all))
	seen := make(map[uuid.UUID]struct{}, len(all))
	for _, match := range append(relevant, all...) {
		if _, exists := seen[match.ID]; exists {
			continue
		}
		seen[match.ID] = struct{}{}
		combined = append(combined, match)
	}
	return combined, nil
}

func (h *FarmHandler) fieldSensorSummary(r *http.Request, fieldID uuid.UUID) string {
	rows, err := h.db.Query(r.Context(), `
		WITH scoped_readings AS (
			SELECT
				sr.time,
				sr.value,
				COALESCE(sc.measurement_type, s.type) AS measurement_type,
				COALESCE(NULLIF(sc.unit, ''), NULLIF(s.unit, ''), 'unit not recorded') AS unit
			FROM sensor_readings sr
			JOIN sensors s ON s.id = sr.sensor_id
			LEFT JOIN sensor_channels sc ON sc.id = sr.sensor_channel_id
			LEFT JOIN sensor_modules sm ON sm.id = sc.module_id
			LEFT JOIN sensor_base_assignments sba
			  ON sba.base_id = sm.base_id
			 AND sba.unassigned_at IS NULL
			WHERE sr.time >= NOW() - INTERVAL '24 hours'
			  AND (
			       sr.meta->>'field_id' = $1::text
			       OR (sr.sensor_channel_id IS NOT NULL AND sba.field_id = $1)
			  )
		)
		SELECT
			measurement_type,
			unit,
			COUNT(*),
			MIN(value),
			MAX(value),
			AVG(value),
			(ARRAY_AGG(value ORDER BY time DESC))[1],
			MAX(time),
			CASE WHEN COUNT(*) >= 2
			     THEN REGR_SLOPE(value, EXTRACT(EPOCH FROM time)::double precision) * 3600
			END
		FROM scoped_readings
		GROUP BY measurement_type, unit
		ORDER BY measurement_type
	`, fieldID)
	if err != nil {
		return "No recent field sensor readings are available. Do not infer sensor conditions."
	}
	defer rows.Close()
	parts := make([]string, 0)
	for rows.Next() {
		var typ, unit string
		var count int64
		var min, max, avg, latestValue float64
		var latest time.Time
		var hourlyTrend *float64
		if rows.Scan(&typ, &unit, &count, &min, &max, &avg, &latestValue, &latest, &hourlyTrend) == nil {
			trend := "trend unavailable"
			if hourlyTrend != nil {
				trend = fmt.Sprintf("24-hour linear trend %.2f %s/hour", *hourlyTrend, unit)
			}
			parts = append(parts, fmt.Sprintf(
				"%s (%s): %d readings, latest %.2f at %s, min %.2f, max %.2f, average %.2f, %s",
				typ, unit, count, latestValue, latest.UTC().Format(time.RFC3339), min, max, avg, trend,
			))
		}
	}
	if len(parts) == 0 {
		return "No recent field sensor readings are available. Do not infer sensor conditions."
	}
	return strings.Join(parts, "; ")
}

func (h *FarmHandler) fieldWeatherSummary(r *http.Request, fieldID uuid.UUID) string {
	var lat, lon *float64
	err := h.db.QueryRow(r.Context(), `SELECT COALESCE(fi.latitude,fa.latitude),COALESCE(fi.longitude,fa.longitude) FROM fields fi JOIN farms fa ON fa.id=fi.farm_id WHERE fi.id=$1`, fieldID).Scan(&lat, &lon)
	if err != nil || lat == nil || lon == nil {
		return "Current weather data is unavailable because the field or farm location is not set. Do not infer weather conditions."
	}
	summary, err := weather.NewClient().CurrentSummary(r.Context(), *lat, *lon)
	if err != nil {
		return "Current weather data is temporarily unavailable. Do not infer weather conditions."
	}
	return summary
}

func (h *FarmHandler) ListFieldAdvice(w http.ResponseWriter, r *http.Request) {
	_, fieldID, ok := h.requireFieldAccess(w, r, false)
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT id, observation, result_json, created_at FROM advisor_recommendations WHERE field_id=$1 ORDER BY created_at DESC LIMIT 30`, fieldID)
	if err != nil {
		http.Error(w, "failed to load advice", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id uuid.UUID
		var observation string
		var result json.RawMessage
		var createdAt time.Time
		if err := rows.Scan(&id, &observation, &result, &createdAt); err != nil {
			http.Error(w, "failed to read advice", http.StatusInternalServerError)
			return
		}
		items = append(items, map[string]any{"id": id, "observation": observation, "advice": result, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"recommendations": items})
}
