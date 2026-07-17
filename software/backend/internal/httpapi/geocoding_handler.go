package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"spectron-backend/internal/geocoding"
)

type GeocodingHandler struct {
	provider geocoding.Provider
}

func NewGeocodingHandler(provider geocoding.Provider) *GeocodingHandler {
	return &GeocodingHandler{provider: provider}
}

func (h *GeocodingHandler) Search(w http.ResponseWriter, r *http.Request) {
	if h.provider == nil {
		http.Error(w, "location search is not configured", http.StatusServiceUnavailable)
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		http.Error(w, "search text is required", http.StatusBadRequest)
		return
	}
	limit := 5
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed <= 0 || parsed > 10 {
			http.Error(w, "limit must be between 1 and 10", http.StatusBadRequest)
			return
		}
		limit = parsed
	}
	results, err := h.provider.Search(r.Context(), query, limit)
	if err != nil {
		http.Error(w, "failed to search places", http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

func (h *GeocodingHandler) Reverse(w http.ResponseWriter, r *http.Request) {
	if h.provider == nil {
		http.Error(w, "location lookup is not configured", http.StatusServiceUnavailable)
		return
	}
	latitude, longitude, err := parseLatLonQuery(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	location, err := h.provider.Reverse(r.Context(), latitude, longitude)
	if err != nil {
		http.Error(w, "failed to detect location name", http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"location": location})
}

func parseLatLonQuery(r *http.Request) (float64, float64, error) {
	latRaw := strings.TrimSpace(r.URL.Query().Get("lat"))
	lonRaw := strings.TrimSpace(r.URL.Query().Get("lon"))
	if latRaw == "" || lonRaw == "" {
		return 0, 0, errors.New("latitude and longitude are required")
	}
	latitude, err := strconv.ParseFloat(latRaw, 64)
	if err != nil || latitude < -90 || latitude > 90 {
		return 0, 0, errors.New("latitude must be between -90 and 90")
	}
	longitude, err := strconv.ParseFloat(lonRaw, 64)
	if err != nil || longitude < -180 || longitude > 180 {
		return 0, 0, errors.New("longitude must be between -180 and 180")
	}
	return latitude, longitude, nil
}
