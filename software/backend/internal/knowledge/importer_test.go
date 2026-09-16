package knowledge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseFilePreservesCategoryAndSources(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "diseases.json")
	if err := os.WriteFile(path, []byte(`{"crop":"Tomato","diseases":[{"source":"DOA","url":"https://example.test","content":"Leaf spots"}]}`), 0600); err != nil {
		t.Fatal(err)
	}
	entries, err := ParseFile(path, "diseases")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Content != "Leaf spots" || entries[0].Category != "diseases" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
	if entries[0].Metadata["source"] != "DOA" {
		t.Fatalf("source metadata missing: %+v", entries[0].Metadata)
	}
}

func TestValidateDatasetCropRejectsMislabeledData(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "general.json"), []byte(`{"crop":"Tomato","content":"Tomato facts"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateDatasetCrop(dir, "Chilli"); err == nil {
		t.Fatal("expected crop mismatch")
	}
	if err := ValidateDatasetCrop(dir, "Tomato"); err != nil {
		t.Fatalf("expected matching crop: %v", err)
	}
}

func TestValidateDatasetCropAcceptsPaddyRiceAlias(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "general.json"), []byte(`{"crop":"Rice","content":"Rice facts"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateDatasetCrop(dir, "Paddy / Rice"); err != nil {
		t.Fatalf("expected alias match: %v", err)
	}
}

func TestParseFileSupportsStructuredEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "diseases.json")
	raw := `{"crop":"Tomato","source":"DOA","source_url":"https://example.test","entries":[{"topic":"Late blight","growth_stage":"Fruiting","content":"Inspect lower leaves.","symptoms":["dark spots"]}]}`
	if err := os.WriteFile(path, []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	entries, err := ParseFile(path, "diseases")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Topic != "Late blight" || entries[0].GrowthStage != "Fruiting" {
		t.Fatalf("unexpected structured entry: %+v", entries)
	}
	if entries[0].Metadata["source"] != "DOA" {
		t.Fatalf("source metadata missing: %+v", entries[0].Metadata)
	}
}
