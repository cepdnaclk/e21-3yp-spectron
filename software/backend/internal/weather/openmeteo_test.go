package weather

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCurrentSummary(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("forecast_days") != "3" || r.URL.Query().Get("timezone") != "auto" {
			t.Fatalf("unexpected forecast query: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"current":{"time":"2026-07-18T10:00","temperature_2m":29.2,"relative_humidity_2m":78,"precipitation":0.4,"weather_code":61,"wind_speed_10m":12.3},"daily":{"time":["2026-07-18","2026-07-19","2026-07-20"],"temperature_2m_max":[31.5,30.1,29.4],"temperature_2m_min":[24.1,23.8,23.5],"precipitation_sum":[8.2,2.1,0.4]}}`))
	}))
	defer s.Close()
	c := &Client{HTTP: s.Client(), BaseURL: s.URL}
	summary, err := c.CurrentSummary(context.Background(), 7.1, 80.2)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(summary, "29.2 C") || !strings.Contains(summary, "78%") || !strings.Contains(summary, "rain") || !strings.Contains(summary, "8.2 mm") {
		t.Fatalf("unexpected summary: %s", summary)
	}

	snapshot, err := c.Forecast(context.Background(), 7.1, 80.2)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Today == nil || snapshot.Today.Date != "2026-07-18" || len(snapshot.NextDays) != 2 {
		t.Fatalf("unexpected structured forecast: %+v", snapshot)
	}
	if snapshot.Conditions != "rain" || snapshot.HumidityPercent != 78 {
		t.Fatalf("unexpected current conditions: %+v", snapshot)
	}
}

func TestForecastRejectsMissingCurrentConditions(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"daily":{"time":[]}}`))
	}))
	defer s.Close()

	client := &Client{HTTP: s.Client(), BaseURL: s.URL}
	if _, err := client.Forecast(context.Background(), 7.1, 80.2); err == nil {
		t.Fatal("expected missing current conditions to return an error")
	}
}
