package knowledge

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Entry is the normalized representation of a dataset fact.
type Entry struct {
	Category    string
	Topic       string
	GrowthStage string
	Content     string
	Metadata    map[string]any
}

// ParseFile flattens the supplied dataset JSON while preserving category and
// source metadata. It deliberately ignores keys such as source and URL as
// facts; those remain metadata attached to the entry.
func ParseFile(path, category string) ([]Entry, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if root, ok := value.(map[string]any); ok {
		if records, ok := root["entries"].([]any); ok {
			return parseStructuredEntries(records, category, root), nil
		}
	}
	entries := make([]Entry, 0)
	walk(value, category, "", map[string]any{}, &entries)
	return entries, nil
}

func parseStructuredEntries(records []any, fallbackCategory string, root map[string]any) []Entry {
	rootMetadata := map[string]any{}
	for _, key := range []string{"source", "source_url", "publisher", "dataset_version", "reviewed_at", "license", "language"} {
		if value, exists := root[key]; exists {
			rootMetadata[key] = value
		}
	}
	entries := make([]Entry, 0, len(records))
	for _, rawRecord := range records {
		record, ok := rawRecord.(map[string]any)
		if !ok {
			continue
		}
		content, _ := record["content"].(string)
		content = strings.TrimSpace(content)
		if content == "" {
			continue
		}
		entry := Entry{Category: fallbackCategory, Content: content, Metadata: clone(rootMetadata)}
		if value, ok := record["category"].(string); ok && strings.TrimSpace(value) != "" {
			entry.Category = strings.TrimSpace(value)
		}
		if value, ok := record["topic"].(string); ok {
			entry.Topic = strings.TrimSpace(value)
		}
		if value, ok := record["growth_stage"].(string); ok {
			entry.GrowthStage = strings.TrimSpace(value)
		}
		for key, value := range record {
			if key != "content" && key != "category" && key != "topic" && key != "growth_stage" {
				entry.Metadata[key] = value
			}
		}
		entries = append(entries, entry)
	}
	return entries
}

func walk(value any, category, topic string, metadata map[string]any, out *[]Entry) {
	switch v := value.(type) {
	case map[string]any:
		next := clone(metadata)
		for k, item := range v {
			if k == "source" || k == "url" || k == "last_updated" {
				next[k] = item
			}
		}
		for k, item := range v {
			if k == "source" || k == "url" || k == "last_updated" || k == "crop" {
				continue
			}
			walk(item, category, k, next, out)
		}
	case []any:
		for _, item := range v {
			walk(item, category, topic, metadata, out)
		}
	case string:
		text := strings.TrimSpace(v)
		if text != "" {
			*out = append(*out, Entry{Category: category, Topic: topic, Content: text, Metadata: clone(metadata)})
		}
	case float64, bool:
		text := fmt.Sprint(v)
		*out = append(*out, Entry{Category: category, Topic: topic, Content: text, Metadata: clone(metadata)})
	}
}

func clone(in map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range in {
		out[k] = v
	}
	return out
}

// ImportDataset imports category JSON files idempotently for a canonical crop.
func ImportDataset(ctx context.Context, db *pgxpool.Pool, cropID uuid.UUID, root, version string) (int, error) {
	files, err := filepath.Glob(filepath.Join(root, "*.json"))
	if err != nil {
		return 0, err
	}
	if len(files) == 0 {
		return 0, fmt.Errorf("no JSON files in %s", root)
	}
	count := 0
	for _, path := range files {
		category := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		sourceID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(cropID.String()+":"+category+":"+version))
		_, err = db.Exec(ctx, `INSERT INTO crop_knowledge_sources (id,crop_id,category,dataset_version) VALUES ($1,$2,$3,$4) ON CONFLICT (crop_id,category,dataset_version) DO UPDATE SET imported_at=now()`, sourceID, cropID, category, version)
		if err != nil {
			return count, err
		}
		entries, err := ParseFile(path, category)
		if err != nil {
			return count, err
		}
		for _, entry := range entries {
			entryID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(sourceID.String()+":"+entry.Content))
			metadata, _ := json.Marshal(entry.Metadata)
			_, err = db.Exec(ctx, `INSERT INTO crop_knowledge_entries (id,source_id,crop_id,category,topic,growth_stage,content,metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (source_id,content) DO UPDATE SET category=EXCLUDED.category, topic=EXCLUDED.topic, growth_stage=EXCLUDED.growth_stage, metadata_json=EXCLUDED.metadata_json, active=true`, entryID, sourceID, cropID, entry.Category, entry.Topic, nullableText(entry.GrowthStage), entry.Content, metadata)
			if err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}

func nullableText(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return strings.TrimSpace(value)
}

func ValidateDatasetCrop(root, expected string) error {
	files, err := filepath.Glob(filepath.Join(root, "*.json"))
	if err != nil {
		return err
	}
	for _, path := range files {
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var header struct {
			Crop string `json:"crop"`
		}
		if err := json.Unmarshal(raw, &header); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		if strings.TrimSpace(header.Crop) == "" {
			continue
		}
		if normalizeCrop(header.Crop) != normalizeCrop(expected) {
			return fmt.Errorf("%s declares crop %q, expected %q", path, header.Crop, expected)
		}
	}
	return nil
}

func normalizeCrop(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	switch v {
	case "rice", "paddy", "paddy / rice", "paddy/rice":
		return "rice"
	case "chili":
		return "chilli"
	case "corn":
		return "maize"
	}
	return v
}
