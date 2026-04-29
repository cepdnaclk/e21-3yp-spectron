package iot

import "testing"

func TestNormalizeSystemSensorSlotKeyPreservesPayloadBase(t *testing.T) {
	got := NormalizeSystemSensorSlotKey(
		"ctrl-real-001-base-2805A5309850-sensor-temp-humidity-3044",
		"temperature_humidity",
	)

	want := "base-2805a5309850-sensor-temp-humidity-3044"
	if got != want {
		t.Fatalf("expected slot key %q, got %q", want, got)
	}
}

func TestNormalizeSystemSensorSlotKeyFallsBackToSensorSuffix(t *testing.T) {
	got := NormalizeSystemSensorSlotKey("ctrl-real-001-sensor-temp-01", "temperature_humidity")

	want := "temp-01"
	if got != want {
		t.Fatalf("expected slot key %q, got %q", want, got)
	}
}
