package httpapi

import (
	"log"
	"net/http"

	"spectron-backend/internal/weather"
)

// GetWeather returns current conditions and a short forecast for the farm's
// saved coordinates. Farm access is checked on every request.
func (h *FarmHandler) GetWeather(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, false)
	if !ok {
		return
	}

	var latitude, longitude *float64
	if err := h.db.QueryRow(
		r.Context(),
		`SELECT latitude, longitude FROM farms WHERE id = $1`,
		access.farmID,
	).Scan(&latitude, &longitude); err != nil {
		http.Error(w, "farm location could not be loaded", http.StatusInternalServerError)
		return
	}
	if latitude == nil || longitude == nil {
		http.Error(w, "set the farm location to see weather", http.StatusConflict)
		return
	}

	snapshot, err := weather.NewClient().Forecast(r.Context(), *latitude, *longitude)
	if err != nil {
		log.Printf("farm weather unavailable for farm %s: %v", access.farmID, err)
		http.Error(w, "weather is unavailable right now", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Cache-Control", "private, max-age=600")
	writeJSON(w, http.StatusOK, snapshot)
}
