package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"spectron-backend/internal/advisor"
	"spectron-backend/internal/knowledge"
)

type createFieldProblemRequest struct {
	Title       string `json:"title"`
	Observation string `json:"observation"`
}

type answerFieldProblemRequest struct {
	Answer string `json:"answer"`
}

type resolveFieldProblemRequest struct {
	Helpful           *bool  `json:"helpful,omitempty"`
	Comment           string `json:"comment,omitempty"`
	ResolutionComment string `json:"resolution_comment,omitempty"`
}

type problemContext struct {
	ID, FieldID, CropInstanceID, CropID uuid.UUID
	Title, Observation, Status          string
	TurnCount                           int
	CropName, StageName                 string
}

func (h *FarmHandler) CreateFieldProblem(w http.ResponseWriter, r *http.Request) {
	access, fieldID, ok := h.requireFieldAccess(w, r, true)
	if !ok {
		return
	}
	var req createFieldProblemRequest
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
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		req.Title = shortProblemTitle(req.Observation)
	}
	if len(req.Title) < 3 || len(req.Title) > 120 {
		http.Error(w, "title must be between 3 and 120 characters", http.StatusBadRequest)
		return
	}

	problem, err := h.loadProblemCropContext(r, fieldID, uuid.Nil)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "set up the field crop before reporting a problem", http.StatusConflict)
		return
	}
	if err != nil {
		http.Error(w, "failed to load field crop", http.StatusInternalServerError)
		return
	}
	problem.ID = uuid.New()
	problem.Title = req.Title
	problem.Observation = req.Observation
	problem.Status = "open"
	_, err = h.db.Exec(r.Context(), `
		INSERT INTO field_problems (id,field_id,crop_instance_id,reported_by_user_id,title,observation)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		problem.ID, fieldID, problem.CropInstanceID, access.userID, req.Title, req.Observation)
	if err != nil {
		http.Error(w, "failed to create problem", http.StatusInternalServerError)
		return
	}
	if err := h.generateProblemTurn(r, access, &problem, req.Observation); err != nil {
		_, _ = h.db.Exec(r.Context(), `DELETE FROM field_problems WHERE id=$1 AND advisor_turn_count=0`, problem.ID)
		log.Printf("field problem advisor failed for field %s: %v", fieldID, err)
		http.Error(w, "field advice is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	h.writeFieldProblem(w, r, fieldID, problem.ID, http.StatusCreated)
}

func (h *FarmHandler) AnswerFieldProblem(w http.ResponseWriter, r *http.Request) {
	access, fieldID, ok := h.requireFieldAccess(w, r, true)
	if !ok {
		return
	}
	problemID, ok := parseProblemID(w, r)
	if !ok {
		return
	}
	var req answerFieldProblemRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Answer = strings.TrimSpace(req.Answer)
	if len(req.Answer) < 1 || len(req.Answer) > 1000 {
		http.Error(w, "answer must be between 1 and 1000 characters", http.StatusBadRequest)
		return
	}
	problem, err := h.loadProblemCropContext(r, fieldID, problemID)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "problem not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "failed to load problem", http.StatusInternalServerError)
		return
	}
	if problem.Status == "resolved" {
		http.Error(w, "this problem is already solved", http.StatusConflict)
		return
	}
	if problem.TurnCount >= 3 {
		http.Error(w, "the three free advisor responses for this problem have been used", http.StatusTooManyRequests)
		return
	}
	if err := h.generateProblemTurn(r, access, &problem, req.Answer); err != nil {
		log.Printf("field problem advisor failed for problem %s: %v", problem.ID, err)
		http.Error(w, "field advice is temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	h.writeFieldProblem(w, r, fieldID, problem.ID, http.StatusOK)
}

func (h *FarmHandler) ResolveFieldProblem(w http.ResponseWriter, r *http.Request) {
	access, fieldID, ok := h.requireFieldAccess(w, r, true)
	if !ok {
		return
	}
	problemID, ok := parseProblemID(w, r)
	if !ok {
		return
	}
	var req resolveFieldProblemRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Comment = strings.TrimSpace(req.Comment)
	if req.Comment == "" {
		// Keep compatibility with released desktop/mobile clients that used the
		// response field name when submitting the resolution request.
		req.Comment = strings.TrimSpace(req.ResolutionComment)
	}
	if len(req.Comment) > 500 {
		http.Error(w, "comment must not exceed 500 characters", http.StatusBadRequest)
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "failed to mark problem as solved", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	command, err := tx.Exec(r.Context(), `
		UPDATE field_problems
		SET status='resolved', resolved_at=now(), resolved_by_user_id=$1,
		    resolution_helpful=$2, resolution_comment=NULLIF($3,''), updated_at=now()
		WHERE id=$4 AND field_id=$5`, access.userID, req.Helpful, req.Comment, problemID, fieldID)
	if err != nil {
		http.Error(w, "failed to mark problem as solved", http.StatusInternalServerError)
		return
	}
	if command.RowsAffected() == 0 {
		http.Error(w, "problem not found", http.StatusNotFound)
		return
	}
	_, err = tx.Exec(r.Context(), `
		UPDATE alerts
		SET status='resolved',
		    expires_at=NOW() + INTERVAL '1 day',
		    last_triggered_at=NOW()
		WHERE farm_id=$1
		  AND field_id=$2
		  AND source_ref LIKE $3
		  AND COALESCE(status,'open')<>'resolved'`,
		access.farmID,
		fieldID,
		fmt.Sprintf("problem:%s:%%", problemID),
	)
	if err != nil {
		http.Error(w, "failed to close related alerts", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to mark problem as solved", http.StatusInternalServerError)
		return
	}
	notifyCustomerChange(r, access.farmID, "problem.changed")
	h.writeFieldProblem(w, r, fieldID, problemID, http.StatusOK)
}

func (h *FarmHandler) ListFieldProblems(w http.ResponseWriter, r *http.Request) {
	_, fieldID, ok := h.requireFieldAccess(w, r, false)
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `
		SELECT fp.id,fp.title,fp.observation,fp.status,fp.advisor_turn_count,fp.created_at,fp.updated_at,
		       fp.resolved_at,fp.resolution_comment,c.name,COALESCE(gs.stage_name,'Unknown'),latest.result_json
		FROM field_problems fp
		JOIN crop_instances ci ON ci.id=fp.crop_instance_id
		JOIN crops c ON c.id=ci.crop_id
		LEFT JOIN growth_stages gs ON gs.id=ci.current_stage_id
		LEFT JOIN LATERAL (
			SELECT result_json FROM advisor_recommendations
			WHERE problem_id=fp.id ORDER BY turn_number DESC LIMIT 1
		) latest ON true
		WHERE fp.field_id=$1
		ORDER BY (fp.status='resolved'), fp.updated_at DESC
		LIMIT 50`, fieldID)
	if err != nil {
		http.Error(w, "failed to load field problems", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id uuid.UUID
		var title, observation, status, crop, stage string
		var turns int
		var created, updated time.Time
		var resolved *time.Time
		var resolutionComment *string
		var latest json.RawMessage
		if err := rows.Scan(&id, &title, &observation, &status, &turns, &created, &updated, &resolved, &resolutionComment, &crop, &stage, &latest); err != nil {
			http.Error(w, "failed to read field problems", http.StatusInternalServerError)
			return
		}
		item := problemMap(id, fieldID, title, observation, status, turns, crop, stage, created, updated, resolved, latest)
		if resolutionComment != nil {
			item["resolution_comment"] = *resolutionComment
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"problems": items})
}

func (h *FarmHandler) GetFieldProblem(w http.ResponseWriter, r *http.Request) {
	_, fieldID, ok := h.requireFieldAccess(w, r, false)
	if !ok {
		return
	}
	problemID, ok := parseProblemID(w, r)
	if !ok {
		return
	}
	h.writeFieldProblem(w, r, fieldID, problemID, http.StatusOK)
}

func (h *FarmHandler) generateProblemTurn(r *http.Request, access farmAccess, problem *problemContext, farmerText string) error {
	var turn int
	err := h.db.QueryRow(r.Context(), `
		UPDATE field_problems SET advisor_turn_count=advisor_turn_count+1, updated_at=now()
		WHERE id=$1 AND status<>'resolved' AND advisor_turn_count<3
		RETURNING advisor_turn_count`, problem.ID).Scan(&turn)
	if err != nil {
		return fmt.Errorf("reserve advisor response: %w", err)
	}
	release := func() {
		_, _ = h.db.Exec(r.Context(), `UPDATE field_problems SET advisor_turn_count=GREATEST(advisor_turn_count-1,0) WHERE id=$1`, problem.ID)
	}
	history, err := h.problemConversationHistory(r, problem.ID)
	if err != nil {
		release()
		return err
	}
	query := problem.Observation
	if turn > 1 {
		query += "\nFarmer follow-up: " + farmerText
	}
	matches, err := h.loadAdviceKnowledge(
		r,
		problem.CropID,
		problem.StageName,
		query,
	)
	if err != nil {
		release()
		return fmt.Errorf("crop guidance unavailable: %w", err)
	}
	sensorSummary := h.fieldSensorSummary(r, problem.FieldID)
	weatherSummary := h.fieldWeatherSummary(r, problem.FieldID)
	recentProblems, err := h.loadRecentFieldProblemHistory(
		r,
		problem.FieldID,
		problem.CropInstanceID,
		problem.ID,
	)
	if err != nil {
		release()
		return fmt.Errorf("recent field problem history unavailable: %w", err)
	}
	result, err := advisor.NewProvider().Generate(r.Context(), advisor.Request{
		Crop: problem.CropName, Stage: problem.StageName, Observation: query,
		SensorSummary: sensorSummary, WeatherSummary: weatherSummary,
		CropContext: matches, ConversationHistory: history,
		TurnNumber: turn, MustFinalize: turn == 3,
	})
	if err != nil {
		log.Printf("field problem advisor provider fallback for problem %s turn %d: %v", problem.ID, turn, err)
		result = fallbackFieldProblemAdvice(problem, farmerText, sensorSummary, weatherSummary, recentProblems, matches, turn)
	}
	result = ensureEvolvingFollowUp(result, history, turn)
	resultJSON, err := json.Marshal(result)
	if err != nil {
		release()
		return err
	}
	ids := make([]uuid.UUID, 0, len(matches))
	for _, match := range matches {
		ids = append(ids, match.ID)
	}
	status := "advice_ready"
	if strings.TrimSpace(string(result.TellUsNext)) != "" && turn < 3 {
		status = "needs_information"
	}
	accountID, ok := GetAccountID(r).(uuid.UUID)
	if !ok {
		release()
		return errors.New("missing account context")
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		release()
		return err
	}
	defer tx.Rollback(r.Context())
	recommendationID := uuid.New()
	_, err = tx.Exec(r.Context(), `
		INSERT INTO advisor_recommendations
		(id,field_id,crop_instance_id,requested_by_user_id,observation,sensor_summary,weather_summary,knowledge_entry_ids,result_json,model,problem_id,turn_number)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		recommendationID, problem.FieldID, problem.CropInstanceID, access.userID, farmerText,
		sensorSummary, weatherSummary, ids, resultJSON,
		strings.TrimSpace(os.Getenv("GROQ_MODEL")), problem.ID, turn)
	if err != nil {
		release()
		return err
	}
	alertID := uuid.New()
	message := fmt.Sprintf("New advice is ready for %s.", problem.Title)
	if status == "needs_information" {
		message = fmt.Sprintf("One question is ready for %s.", problem.Title)
	}
	sourceRef := fmt.Sprintf("problem:%s:turn:%d", problem.ID, turn)
	_, err = tx.Exec(r.Context(), `
		INSERT INTO alerts (id,account_id,farm_id,field_id,crop_instance_id,type,severity,message,source_ref,status,created_at)
		VALUES ($1,$2,$3,$4,$5,'ADVICE_READY','INFO',$6,$7,'open',NOW())`,
		alertID, accountID, access.farmID, problem.FieldID, problem.CropInstanceID, message, sourceRef)
	if err != nil {
		release()
		return err
	}
	_, err = tx.Exec(r.Context(), `
		INSERT INTO alert_recipients (alert_id,user_id)
		SELECT $1,fa.user_id FROM farm_access fa
		WHERE fa.farm_id=$2 AND fa.revoked_at IS NULL
		ON CONFLICT (alert_id,user_id) DO NOTHING`, alertID, access.farmID)
	if err != nil {
		release()
		return err
	}
	_, err = tx.Exec(r.Context(), `UPDATE field_problems SET status=$1,updated_at=now() WHERE id=$2`, status, problem.ID)
	if err == nil {
		err = tx.Commit(r.Context())
	}
	problem.TurnCount, problem.Status = turn, status
	return err
}

func fallbackFieldProblemAdvice(
	problem *problemContext,
	farmerText string,
	sensorSummary string,
	weatherSummary string,
	recentProblems []map[string]any,
	matches []knowledge.Match,
	turn int,
) advisor.Result {
	focus, headlineAction, question, specificCheck := fallbackAdviceFocus(farmerText)
	headline := fmt.Sprintf("Check %s in the %s Field today.", focus, problem.CropName)
	if turn >= 3 {
		headline = fmt.Sprintf("Make a final field check on %s today.", problem.CropName)
	}

	evidence := make([]string, 0, 3)
	if text := strings.TrimSpace(farmerText); text != "" {
		evidence = append(evidence, fmt.Sprintf("Farmer reported: %s", text))
	}
	if sensor := summarizeFallbackLine(sensorSummary); sensor != "" {
		evidence = append(evidence, sensor)
	}
	if weather := summarizeFallbackLine(weatherSummary); weather != "" {
		evidence = append(evidence, weather)
	}
	if len(evidence) > 3 {
		evidence = evidence[:3]
	}

	checkNext := []string{
		specificCheck,
		"Count how many plants show the same symptom in one row and in the next row.",
		"Compare affected plants with healthy plants at the same growth stage before taking treatment action.",
	}
	doNow := []string{
		"Walk the affected area this morning and mark 5 to 10 representative plants so the same plants can be checked again later.",
		headlineAction,
		"Check the root-zone moisture by hand at two depths near affected plants and compare it with a healthy nearby area before changing irrigation.",
	}
	avoid := []string{
		"Do not spray or fertilize the whole Field before confirming whether the fruit drop is from stress, disease, or normal ripening.",
		"Do not increase watering only from leaf appearance without checking the root-zone soil first.",
	}

	if len(matches) > 0 {
		referenceLines := make([]string, 0, len(matches))
		for _, match := range matches {
			line := strings.TrimSpace(match.Topic)
			if line == "" {
				line = strings.TrimSpace(match.Content)
			}
			if line != "" {
				referenceLines = append(referenceLines, line)
			}
		}
		sort.Strings(referenceLines)
		if len(referenceLines) > 0 {
			checkNext = append([]string{
				fmt.Sprintf("Compare the symptom with crop reference notes for %s.", referenceLines[0]),
			}, checkNext...)
		}
	}

	status := "NEEDS_ATTENTION"
	tellUsNext := question
	if turn >= 3 {
		status = "URGENT"
		tellUsNext = ""
	}
	if len(recentProblems) > 0 {
		doNow = append(doNow, "Review whether this looks similar to the recent problem already reported in this Field before repeating the same action.")
	}

	result := advisor.Result{
		Status:             status,
		Headline:           headline,
		WhatMayBeHappening: advisor.AdvisorText(fmt.Sprintf("The reported %s may be linked to crop stress, uneven watering, pests, disease pressure, or normal aging. The current evidence is not enough to confirm one cause, so the safest next step is a focused field check before treatment.", strings.ToLower(focus))),
		DoNow:              doNow,
		CheckNext:          checkNext,
		WhyThisAdvice: []string{
			"The farmer report suggests a real Field change, but the cause is still uncertain.",
			"Recent sensor and weather context should be checked together with visible plant symptoms before action.",
			"Early confirmation reduces unnecessary spraying, fertilizing, or irrigation changes.",
		},
		AvoidForNow:  avoid,
		RecheckAfter: advisor.AdvisorText("Recheck the marked plants after 6 to 12 hours, then again tomorrow morning."),
		GetHelpIf: []string{
			"Fruit drop spreads quickly across the Field within one day.",
			"Leaves show fast wilting, dark lesions, stem rot, or strong foul smell.",
			"The same problem continues after the next field check and careful irrigation review.",
		},
		TellUsNext:  advisor.AdvisorText(tellUsNext),
		SafetyNote:  advisor.AdvisorText("This is decision support only. Confirm the visible symptom in the Field before treatment."),
		Confidence:  "LOW",
		Evidence:    evidence,
		Summary:     headline,
		ActionsNow:  doNow,
		MonitorNext: checkNext,
		Recheck:     advisor.AdvisorText("Recheck the marked plants after 6 to 12 hours, then again tomorrow morning."),
	}
	return result
}

// fallbackAdviceFocus keeps safe offline advice tied to what the farmer
// actually described. It is used only when the hosted AI provider is not
// available, so different reports do not receive the same generic question.
func fallbackAdviceFocus(observation string) (focus, action, question, check string) {
	text := strings.ToLower(observation)
	switch {
	case strings.Contains(text, "yellow") || strings.Contains(text, "yellowing"):
		return "yellowing leaves", "Record whether yellowing starts on older or new leaves and whether it is between the veins.", "Are the yellow leaves older lower leaves or new upper leaves, and are there spots?", "Check whether yellowing begins on lower leaves, new leaves, or between leaf veins."
	case strings.Contains(text, "spot") || strings.Contains(text, "lesion") || strings.Contains(text, "blight"):
		return "leaf spots", "Photograph both sides of three spotted leaves and note whether spots have dark edges or concentric rings.", "Do the spots have dark edges, rings, or a yellow halo, and are they spreading after rain?", "Check whether spots have dark edges, rings, a yellow halo, or appear on new leaves."
	case strings.Contains(text, "wilt") || strings.Contains(text, "droop"):
		return "wilting plants", "Check whether plants recover in the cooler part of the day and compare root-zone soil with a healthy nearby plant.", "Do plants recover by evening, and does the root-zone soil feel dry, normal, or very wet?", "Check whether wilting improves in the evening and whether it is limited to one wet or dry patch."
	case strings.Contains(text, "insect") || strings.Contains(text, "pest") || strings.Contains(text, "aphid") || strings.Contains(text, "caterpillar"):
		return "possible pest damage", "Inspect the underside of ten affected leaves and record any insects, eggs, webbing, or chewing damage.", "What insects, eggs, webbing, sticky residue, or chewing marks can you see under affected leaves?", "Check the underside of affected leaves for insects, eggs, webbing, sticky residue, or chewing marks."
	case strings.Contains(text, "fruit") || strings.Contains(text, "flower") || strings.Contains(text, "drop"):
		return "flower or fruit loss", "Record whether loss is strongest near flowers, the stem base, or one part of the Field.", "Is the loss mainly flowers or fruit, and are there dark marks near the stem or flower cluster?", "Check whether loss is mainly flowers or fruit and whether it is strongest near a stem, cluster, or one Field area."
	default:
		return "reported crop change", "Record which plant part changed first and whether the change is spreading or limited to one patch.", "Which plant part changed first, when did it begin, and is it spreading or limited to one patch?", "Check which plant part has the strongest change and whether it is spreading, stable, or limited to one patch."
	}
}

func summarizeFallbackLine(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) > 160 {
		return trimmed[:157] + "..."
	}
	return trimmed
}

func (h *FarmHandler) loadProblemCropContext(r *http.Request, fieldID, problemID uuid.UUID) (problemContext, error) {
	var p problemContext
	p.FieldID = fieldID
	if problemID == uuid.Nil {
		err := h.db.QueryRow(r.Context(), `
			SELECT ci.id,ci.crop_id,c.name,COALESCE(gs.stage_name,'Unknown')
			FROM crop_instances ci JOIN crops c ON c.id=ci.crop_id
			LEFT JOIN growth_stages gs ON gs.id=ci.current_stage_id
			WHERE ci.field_id=$1 AND ci.active=true ORDER BY ci.created_at DESC LIMIT 1`, fieldID).
			Scan(&p.CropInstanceID, &p.CropID, &p.CropName, &p.StageName)
		return p, err
	}
	err := h.db.QueryRow(r.Context(), `
		SELECT fp.id,fp.field_id,fp.crop_instance_id,ci.crop_id,fp.title,fp.observation,fp.status,
		       fp.advisor_turn_count,c.name,COALESCE(gs.stage_name,'Unknown')
		FROM field_problems fp JOIN crop_instances ci ON ci.id=fp.crop_instance_id
		JOIN crops c ON c.id=ci.crop_id LEFT JOIN growth_stages gs ON gs.id=ci.current_stage_id
		WHERE fp.id=$1 AND fp.field_id=$2`, problemID, fieldID).
		Scan(&p.ID, &p.FieldID, &p.CropInstanceID, &p.CropID, &p.Title, &p.Observation, &p.Status, &p.TurnCount, &p.CropName, &p.StageName)
	return p, err
}

func (h *FarmHandler) problemConversationHistory(r *http.Request, problemID uuid.UUID) ([]map[string]any, error) {
	rows, err := h.db.Query(r.Context(), `SELECT turn_number,observation,result_json FROM advisor_recommendations WHERE problem_id=$1 ORDER BY turn_number`, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]map[string]any, 0, 3)
	for rows.Next() {
		var turn int
		var observation string
		var result json.RawMessage
		if err := rows.Scan(&turn, &observation, &result); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"response_number": turn, "farmer_text": observation, "advisor_response": result})
	}
	return items, rows.Err()
}

func ensureEvolvingFollowUp(result advisor.Result, history []map[string]any, turn int) advisor.Result {
	if turn >= 3 {
		result.TellUsNext = ""
		return result
	}

	current := normalizeAdvisorQuestion(string(result.TellUsNext))
	if current == "" {
		return result
	}

	previous := previousAdvisorQuestions(history)
	if _, repeated := previous[current]; !repeated {
		return result
	}

	// Final guard for a provider that ignores the history instruction. Each
	// option gathers a different kind of field evidence.
	candidates := []string{
		"Is the change spreading to new plants or staying in the same area?",
		"What does the root-zone soil feel like beside an affected plant?",
		"Which plant part showed the change first?",
	}
	for _, candidate := range candidates {
		if _, used := previous[normalizeAdvisorQuestion(candidate)]; !used {
			result.TellUsNext = advisor.AdvisorText(candidate)
			return result
		}
	}

	result.TellUsNext = ""
	return result
}

func previousAdvisorQuestions(history []map[string]any) map[string]struct{} {
	questions := make(map[string]struct{}, len(history))
	for _, item := range history {
		response, ok := item["advisor_response"]
		if !ok {
			continue
		}

		var decoded map[string]any
		switch value := response.(type) {
		case json.RawMessage:
			_ = json.Unmarshal(value, &decoded)
		case []byte:
			_ = json.Unmarshal(value, &decoded)
		case map[string]any:
			decoded = value
		}
		if decoded == nil {
			continue
		}
		question, _ := decoded["tell_us_next"].(string)
		if normalized := normalizeAdvisorQuestion(question); normalized != "" {
			questions[normalized] = struct{}{}
		}
	}
	return questions
}

func normalizeAdvisorQuestion(value string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(value), "?.!")
	return strings.Join(strings.Fields(strings.ToLower(trimmed)), " ")
}

func (h *FarmHandler) writeFieldProblem(w http.ResponseWriter, r *http.Request, fieldID, problemID uuid.UUID, statusCode int) {
	var id uuid.UUID
	var title, observation, status, crop, stage string
	var turns int
	var created, updated time.Time
	var resolved *time.Time
	var resolutionComment *string
	err := h.db.QueryRow(r.Context(), `SELECT fp.id,fp.title,fp.observation,fp.status,fp.advisor_turn_count,fp.created_at,fp.updated_at,fp.resolved_at,fp.resolution_comment,c.name,COALESCE(gs.stage_name,'Unknown') FROM field_problems fp JOIN crop_instances ci ON ci.id=fp.crop_instance_id JOIN crops c ON c.id=ci.crop_id LEFT JOIN growth_stages gs ON gs.id=ci.current_stage_id WHERE fp.id=$1 AND fp.field_id=$2`, problemID, fieldID).Scan(&id, &title, &observation, &status, &turns, &created, &updated, &resolved, &resolutionComment, &crop, &stage)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "problem not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "failed to load problem", http.StatusInternalServerError)
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT id,turn_number,observation,result_json,created_at FROM advisor_recommendations WHERE problem_id=$1 ORDER BY turn_number`, problemID)
	if err != nil {
		http.Error(w, "failed to load advice", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	responses := make([]map[string]any, 0, 3)
	for rows.Next() {
		var rid uuid.UUID
		var turn int
		var text string
		var result json.RawMessage
		var at time.Time
		if rows.Scan(&rid, &turn, &text, &result, &at) == nil {
			responses = append(responses, map[string]any{"id": rid, "turn_number": turn, "farmer_text": text, "advice": result, "created_at": at})
		}
	}
	item := problemMap(id, fieldID, title, observation, status, turns, crop, stage, created, updated, resolved, nil)
	if resolutionComment != nil {
		item["resolution_comment"] = *resolutionComment
	}
	item["responses"] = responses
	if userID, ok := GetUserID(r).(uuid.UUID); ok {
		// Opening a problem is the acknowledgement event for advice alerts. It
		// only marks this recipient as read; other Farm members remain unread.
		_, _ = h.db.Exec(r.Context(), `
			UPDATE alert_recipients ar
			SET read_at=COALESCE(ar.read_at,NOW())
			FROM alerts a
			WHERE a.id=ar.alert_id AND ar.user_id=$1
			  AND a.source_ref LIKE $2`, userID, fmt.Sprintf("problem:%s:%%", problemID))
	}
	writeJSON(w, statusCode, item)
}

func problemMap(id, fieldID uuid.UUID, title, observation, status string, turns int, crop, stage string, created, updated time.Time, resolved *time.Time, latest json.RawMessage) map[string]any {
	item := map[string]any{"id": id, "field_id": fieldID, "title": title, "observation": observation, "status": status, "advisor_turn_count": turns, "responses_remaining": 3 - turns, "crop": crop, "stage": stage, "created_at": created, "updated_at": updated}
	if resolved != nil {
		item["resolved_at"] = resolved
	}
	if len(latest) > 0 {
		item["latest_advice"] = latest
	}
	return item
}

func parseProblemID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "problemId"))
	if err != nil {
		http.Error(w, "invalid problem id", http.StatusBadRequest)
		return uuid.Nil, false
	}
	return id, true
}

func shortProblemTitle(observation string) string {
	value := strings.TrimSpace(observation)
	if len([]rune(value)) <= 60 {
		return value
	}
	return string([]rune(value)[:57]) + "..."
}
