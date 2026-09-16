package weather

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	HTTP    *http.Client
	BaseURL string
}

type ForecastDay struct {
	Date            string  `json:"date"`
	TemperatureMinC float64 `json:"temperature_min_c"`
	TemperatureMaxC float64 `json:"temperature_max_c"`
	PrecipitationMM float64 `json:"precipitation_mm"`
}

type Snapshot struct {
	ObservedAt      string        `json:"observed_at"`
	Conditions      string        `json:"conditions"`
	TemperatureC    float64       `json:"temperature_c"`
	HumidityPercent float64       `json:"humidity_percent"`
	PrecipitationMM float64       `json:"precipitation_mm"`
	WindSpeedKMH    float64       `json:"wind_speed_kmh"`
	Today           *ForecastDay  `json:"today,omitempty"`
	NextDays        []ForecastDay `json:"next_days,omitempty"`
}

type forecastPayload struct {
	Current struct {
		Time          string   `json:"time"`
		Temperature   *float64 `json:"temperature_2m"`
		Humidity      *float64 `json:"relative_humidity_2m"`
		Precipitation *float64 `json:"precipitation"`
		WeatherCode   *int     `json:"weather_code"`
		WindSpeed     *float64 `json:"wind_speed_10m"`
	} `json:"current"`
	Daily struct {
		Time             []string  `json:"time"`
		TemperatureMax   []float64 `json:"temperature_2m_max"`
		TemperatureMin   []float64 `json:"temperature_2m_min"`
		PrecipitationSum []float64 `json:"precipitation_sum"`
	} `json:"daily"`
}

func NewClient() *Client {
	return &Client{HTTP: &http.Client{Timeout: 10 * time.Second}, BaseURL: "https://api.open-meteo.com/v1/forecast"}
}

func (c *Client) Forecast(ctx context.Context, latitude, longitude float64) (Snapshot, error) {
	if latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 {
		return Snapshot{}, fmt.Errorf("weather coordinates are outside valid latitude or longitude bounds")
	}

	q := url.Values{}
	q.Set("latitude", fmt.Sprintf("%.6f", latitude))
	q.Set("longitude", fmt.Sprintf("%.6f", longitude))
	q.Set("current", "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m")
	q.Set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum")
	q.Set("forecast_days", "3")
	q.Set("timezone", "auto")
	baseURL := strings.TrimSpace(c.BaseURL)
	if baseURL == "" {
		baseURL = NewClient().BaseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"?"+q.Encode(), nil)
	if err != nil {
		return Snapshot{}, err
	}
	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return Snapshot{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Snapshot{}, fmt.Errorf("weather returned %s", resp.Status)
	}
	var payload forecastPayload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return Snapshot{}, err
	}
	if strings.TrimSpace(payload.Current.Time) == "" ||
		payload.Current.Temperature == nil ||
		payload.Current.Humidity == nil ||
		payload.Current.Precipitation == nil ||
		payload.Current.WeatherCode == nil ||
		payload.Current.WindSpeed == nil {
		return Snapshot{}, fmt.Errorf("weather response is missing current conditions")
	}

	snapshot := Snapshot{
		ObservedAt:      payload.Current.Time,
		Conditions:      weatherDescription(*payload.Current.WeatherCode),
		TemperatureC:    *payload.Current.Temperature,
		HumidityPercent: *payload.Current.Humidity,
		PrecipitationMM: *payload.Current.Precipitation,
		WindSpeedKMH:    *payload.Current.WindSpeed,
		NextDays:        []ForecastDay{},
	}
	dailyCount := len(payload.Daily.Time)
	for _, count := range []int{len(payload.Daily.TemperatureMin), len(payload.Daily.TemperatureMax), len(payload.Daily.PrecipitationSum)} {
		if count < dailyCount {
			dailyCount = count
		}
	}
	for index := 0; index < dailyCount; index++ {
		day := ForecastDay{
			Date:            payload.Daily.Time[index],
			TemperatureMinC: payload.Daily.TemperatureMin[index],
			TemperatureMaxC: payload.Daily.TemperatureMax[index],
			PrecipitationMM: payload.Daily.PrecipitationSum[index],
		}
		if index == 0 {
			snapshot.Today = &day
		} else {
			snapshot.NextDays = append(snapshot.NextDays, day)
		}
	}
	return snapshot, nil
}

func (c *Client) CurrentSummary(ctx context.Context, latitude, longitude float64) (string, error) {
	snapshot, err := c.Forecast(ctx, latitude, longitude)
	if err != nil {
		return "", err
	}
	summary := fmt.Sprintf(
		"Observed at %s: %s, temperature %.1f C, relative humidity %.0f%%, current precipitation %.1f mm, wind %.1f km/h.",
		snapshot.ObservedAt,
		snapshot.Conditions,
		snapshot.TemperatureC,
		snapshot.HumidityPercent,
		snapshot.PrecipitationMM,
		snapshot.WindSpeedKMH,
	)
	if snapshot.Today != nil {
		summary += fmt.Sprintf(
			" Forecast for %s: minimum %.1f C, maximum %.1f C, total precipitation %.1f mm.",
			snapshot.Today.Date,
			snapshot.Today.TemperatureMinC,
			snapshot.Today.TemperatureMaxC,
			snapshot.Today.PrecipitationMM,
		)
	}
	return summary, nil
}

func weatherDescription(code int) string {
	switch {
	case code == 0:
		return "clear sky"
	case code == 1:
		return "mainly clear"
	case code == 2:
		return "partly cloudy"
	case code == 3:
		return "overcast"
	case code == 45 || code == 48:
		return "fog"
	case code >= 51 && code <= 57:
		return "drizzle"
	case code >= 61 && code <= 67:
		return "rain"
	case code >= 71 && code <= 77:
		return "snow"
	case code >= 80 && code <= 82:
		return "rain showers"
	case code >= 85 && code <= 86:
		return "snow showers"
	case code >= 95 && code <= 99:
		return "thunderstorm"
	default:
		return "unclassified conditions"
	}
}
