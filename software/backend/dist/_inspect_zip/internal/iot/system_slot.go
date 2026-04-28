package iot

import "strings"

func NormalizeSystemSensorSlotKey(sensorUID string, sensorType string) string {
	trimmedUID := strings.ToLower(strings.TrimSpace(sensorUID))
	if idx := strings.LastIndex(trimmedUID, "-sensor-"); idx >= 0 {
		slot := strings.Trim(trimmedUID[idx+len("-sensor-"):], "- ")
		if slot != "" {
			return slot
		}
	}

	normalizedType := normalizeSystemSlotToken(sensorType)
	if normalizedType == "" {
		normalizedType = "sensor"
	}

	return normalizedType + "-01"
}

func normalizeSystemSlotToken(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return ""
	}

	var b strings.Builder
	lastDash := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
			lastDash = false
		case r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}

	return strings.Trim(b.String(), "-")
}
