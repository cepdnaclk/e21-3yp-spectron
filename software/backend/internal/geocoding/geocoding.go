package geocoding

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	BaseURL   string
	APIKey    string
	UserAgent string
	Timeout   time.Duration
}

type Location struct {
	Label     string   `json:"label"`
	Subtitle  *string  `json:"subtitle,omitempty"`
	Latitude  float64  `json:"latitude"`
	Longitude float64  `json:"longitude"`
	AccuracyM *float64 `json:"accuracy_m,omitempty"`
}

type Provider interface {
	Search(ctx context.Context, query string, limit int) ([]Location, error)
	Reverse(ctx context.Context, latitude float64, longitude float64) (Location, error)
}

type NominatimProvider struct {
	baseURL   string
	apiKey    string
	userAgent string
	client    *http.Client
}

func NewNominatimProvider(cfg Config) *NominatimProvider {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://nominatim.openstreetmap.org"
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	userAgent := strings.TrimSpace(cfg.UserAgent)
	if userAgent == "" {
		userAgent = "SpectronAgriAssist/1.0"
	}
	return &NominatimProvider{
		baseURL:   baseURL,
		apiKey:    strings.TrimSpace(cfg.APIKey),
		userAgent: userAgent,
		client:    &http.Client{Timeout: timeout},
	}
}

func (p *NominatimProvider) Search(ctx context.Context, query string, limit int) ([]Location, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, errors.New("search query is required")
	}
	if limit <= 0 || limit > 10 {
		limit = 5
	}

	values := url.Values{}
	values.Set("q", query)
	values.Set("format", "jsonv2")
	values.Set("addressdetails", "1")
	values.Set("limit", strconv.Itoa(limit))
	if p.apiKey != "" {
		values.Set("key", p.apiKey)
	}

	var results []nominatimResult
	if err := p.getJSON(ctx, "/search", values, &results); err != nil {
		return nil, err
	}

	locations := make([]Location, 0, len(results))
	for _, result := range results {
		location, ok := result.toLocation()
		if ok {
			locations = append(locations, location)
		}
	}
	return locations, nil
}

func (p *NominatimProvider) Reverse(ctx context.Context, latitude float64, longitude float64) (Location, error) {
	values := url.Values{}
	values.Set("lat", strconv.FormatFloat(latitude, 'f', 8, 64))
	values.Set("lon", strconv.FormatFloat(longitude, 'f', 8, 64))
	values.Set("format", "jsonv2")
	values.Set("addressdetails", "1")
	if p.apiKey != "" {
		values.Set("key", p.apiKey)
	}

	var result nominatimResult
	if err := p.getJSON(ctx, "/reverse", values, &result); err != nil {
		return Location{}, err
	}
	location, ok := result.toLocation()
	if !ok {
		return Location{}, errors.New("location not found")
	}
	return location, nil
}

func (p *NominatimProvider) getJSON(ctx context.Context, path string, values url.Values, target any) error {
	requestURL := p.baseURL + path + "?" + values.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", p.userAgent)

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("geocoding provider returned %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

type nominatimResult struct {
	DisplayName string            `json:"display_name"`
	Lat         string            `json:"lat"`
	Lon         string            `json:"lon"`
	Address     map[string]string `json:"address"`
}

func (r nominatimResult) toLocation() (Location, bool) {
	lat, latErr := strconv.ParseFloat(strings.TrimSpace(r.Lat), 64)
	lon, lonErr := strconv.ParseFloat(strings.TrimSpace(r.Lon), 64)
	if latErr != nil || lonErr != nil {
		return Location{}, false
	}
	label, subtitle := readableLabel(r.Address, r.DisplayName)
	return Location{
		Label:     label,
		Subtitle:  subtitle,
		Latitude:  lat,
		Longitude: lon,
	}, true
}

func readableLabel(address map[string]string, displayName string) (string, *string) {
	primary := firstAddressValue(address, "village", "town", "city", "hamlet", "suburb", "county")
	secondary := firstAddressValue(address, "state_district", "county", "state", "region")
	if primary != "" && secondary != "" && !strings.EqualFold(primary, secondary) {
		subtitle := strings.TrimSpace(displayName)
		return primary + ", " + cleanDistrictName(secondary), stringPtrOrNil(subtitle)
	}
	if primary != "" {
		subtitle := strings.TrimSpace(displayName)
		return primary, stringPtrOrNil(subtitle)
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return "Selected location", nil
	}
	parts := strings.Split(displayName, ",")
	labelParts := make([]string, 0, 2)
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			labelParts = append(labelParts, trimmed)
		}
		if len(labelParts) == 2 {
			break
		}
	}
	if len(labelParts) == 0 {
		return displayName, nil
	}
	label := strings.Join(labelParts, ", ")
	return label, stringPtrOrNil(displayName)
}

func firstAddressValue(address map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(address[key]); value != "" {
			return value
		}
	}
	return ""
}

func cleanDistrictName(value string) string {
	return strings.TrimSuffix(strings.TrimSpace(value), " District")
}

func stringPtrOrNil(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
