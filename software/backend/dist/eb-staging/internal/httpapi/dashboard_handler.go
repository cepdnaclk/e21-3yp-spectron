package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardHandler struct {
	db *pgxpool.Pool
}

func NewDashboardHandler(db *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{db: db}
}

func (h *DashboardHandler) Overview(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	// Get controller count
	var controllerCount int
	_ = h.db.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM controllers
		WHERE account_id = $1
		  AND UPPER(COALESCE(status, '')) <> 'UNCLAIMED'
	`, accountID).Scan(&controllerCount)

	// Get sensor count
	var sensorCount int
	_ = h.db.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM sensors s
		JOIN controllers c ON s.controller_id = c.id
		WHERE c.account_id = $1
		  AND UPPER(COALESCE(c.status, '')) <> 'UNCLAIMED'
	`, accountID).Scan(&sensorCount)

	// Get active alerts count
	var alertCount int
	_ = h.db.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM alerts
		WHERE account_id = $1 AND acknowledged_at IS NULL
	`, accountID).Scan(&alertCount)

	response := map[string]interface{}{
		"controllers": controllerCount,
		"sensors":     sensorCount,
		"alerts":      alertCount,
	}

	json.NewEncoder(w).Encode(response)
}

func (h *DashboardHandler) ControllerDashboard(w http.ResponseWriter, r *http.Request) {
	controllerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid controller id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	// Verify controller belongs to account
	var controllerAccountID uuid.UUID
	err = h.db.QueryRow(r.Context(), `
		SELECT account_id
		FROM controllers
		WHERE id = $1
		  AND UPPER(COALESCE(status, '')) <> 'UNCLAIMED'
	`, controllerID).Scan(&controllerAccountID)
	if err != nil {
		http.Error(w, "controller not found", http.StatusNotFound)
		return
	}
	if controllerAccountID != accountID {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Get sensor count
	var sensorCount int
	h.db.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM sensors WHERE controller_id = $1
	`, controllerID).Scan(&sensorCount)

	// Get recent readings count (last 24 hours)
	var recentReadings int
	_ = h.db.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM sensor_readings sr
		JOIN sensors s ON sr.sensor_id = s.id
		WHERE s.controller_id = $1 AND sr.time > NOW() - INTERVAL '24 hours'
	`, controllerID).Scan(&recentReadings)

	response := map[string]interface{}{
		"controller_id":   controllerID,
		"sensor_count":    sensorCount,
		"recent_readings": recentReadings,
	}

	json.NewEncoder(w).Encode(response)
}

func (h *DashboardHandler) GetReadings(w http.ResponseWriter, r *http.Request) {
	sensorID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid sensor id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	// Verify sensor belongs to account
	var sensorAccountID uuid.UUID
	err = h.db.QueryRow(r.Context(), `
		SELECT c.account_id
		FROM sensors s
		JOIN controllers c ON s.controller_id = c.id
		WHERE s.id = $1
		  AND UPPER(COALESCE(c.status, '')) <> 'UNCLAIMED'
	`, sensorID).Scan(&sensorAccountID)
	if err != nil {
		http.Error(w, "sensor not found", http.StatusNotFound)
		return
	}
	if sensorAccountID != accountID {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse query parameters
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	interval := r.URL.Query().Get("interval") // e.g., "1h", "1d"

	from := time.Now().Add(-24 * time.Hour) // Default: last 24 hours
	to := time.Now()

	if fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			from = t
		}
	}
	if toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			to = t
		}
	}

	// Build query based on interval
	var query string
	if interval != "" {
		bucketSize, err := parseBucketInterval(interval)
		if err != nil {
			http.Error(w, "invalid interval", http.StatusBadRequest)
			return
		}

		query = `
			SELECT time, value
			FROM sensor_readings
			WHERE sensor_id = $1 AND time >= $2 AND time <= $3
			ORDER BY time
		`
		rows, err := h.db.Query(r.Context(), query, sensorID, from, to)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type Reading struct {
			Time     time.Time `json:"time"`
			AvgValue float64   `json:"avg_value"`
			MinValue float64   `json:"min_value"`
			MaxValue float64   `json:"max_value"`
		}

		type aggregate struct {
			sum   float64
			count int
			min   float64
			max   float64
		}

		buckets := make(map[time.Time]*aggregate)
		for rows.Next() {
			var readingTime time.Time
			var value float64
			if err := rows.Scan(&readingTime, &value); err != nil {
				http.Error(w, "database error", http.StatusInternalServerError)
				return
			}

			bucket := floorBucket(readingTime, bucketSize)
			current, ok := buckets[bucket]
			if !ok {
				buckets[bucket] = &aggregate{
					sum:   value,
					count: 1,
					min:   value,
					max:   value,
				}
				continue
			}

			current.sum += value
			current.count++
			if value < current.min {
				current.min = value
			}
			if value > current.max {
				current.max = value
			}
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}

		keys := make([]time.Time, 0, len(buckets))
		for bucket := range buckets {
			keys = append(keys, bucket)
		}
		sort.Slice(keys, func(i, j int) bool { return keys[i].Before(keys[j]) })

		readings := make([]Reading, 0, len(keys))
		for _, bucket := range keys {
			current := buckets[bucket]
			readings = append(readings, Reading{
				Time:     bucket,
				AvgValue: current.sum / float64(current.count),
				MinValue: current.min,
				MaxValue: current.max,
			})
		}

		json.NewEncoder(w).Encode(readings)
	} else {
		// Raw readings
		query = `
			SELECT time, value, meta
			FROM sensor_readings
			WHERE sensor_id = $1 AND time >= $2 AND time <= $3
			ORDER BY time DESC
			LIMIT 1000
		`
		rows, err := h.db.Query(r.Context(), query, sensorID, from, to)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type Reading struct {
			Time  time.Time              `json:"time"`
			Value float64                `json:"value"`
			Meta  map[string]interface{} `json:"meta,omitempty"`
		}

		readings := make([]Reading, 0)
		for rows.Next() {
			var r Reading
			var metaJSON []byte
			rows.Scan(&r.Time, &r.Value, &metaJSON)
			if len(metaJSON) > 0 {
				json.Unmarshal(metaJSON, &r.Meta)
			}
			readings = append(readings, r)
		}

		json.NewEncoder(w).Encode(readings)
	}
}

func parseBucketInterval(value string) (time.Duration, error) {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" {
		return 0, fmt.Errorf("interval is required")
	}

	if duration, err := time.ParseDuration(trimmed); err == nil {
		if duration <= 0 {
			return 0, fmt.Errorf("interval must be positive")
		}
		return duration, nil
	}

	if strings.HasSuffix(trimmed, "d") {
		count, err := strconv.Atoi(strings.TrimSuffix(trimmed, "d"))
		if err != nil || count <= 0 {
			return 0, fmt.Errorf("invalid day interval")
		}
		return time.Duration(count) * 24 * time.Hour, nil
	}

	parts := strings.Fields(trimmed)
	if len(parts) != 2 {
		return 0, fmt.Errorf("unsupported interval format")
	}

	count, err := strconv.Atoi(parts[0])
	if err != nil || count <= 0 {
		return 0, fmt.Errorf("invalid interval count")
	}

	switch strings.TrimSuffix(parts[1], "s") {
	case "minute":
		return time.Duration(count) * time.Minute, nil
	case "hour":
		return time.Duration(count) * time.Hour, nil
	case "day":
		return time.Duration(count) * 24 * time.Hour, nil
	default:
		return 0, fmt.Errorf("unsupported interval unit")
	}
}

func floorBucket(t time.Time, interval time.Duration) time.Time {
	if interval <= 0 {
		return t.UTC()
	}

	seconds := int64(interval / time.Second)
	if seconds <= 0 {
		return t.UTC()
	}

	utc := t.UTC()
	return time.Unix((utc.Unix()/seconds)*seconds, 0).UTC()
}
