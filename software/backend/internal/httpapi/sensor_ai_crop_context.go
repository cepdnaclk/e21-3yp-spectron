package httpapi

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"spectron-backend/internal/models"
)

type approvedCropReference struct {
	Crop      string           `json:"crop"`
	Source    string           `json:"source"`
	SourceURL string           `json:"source_url"`
	Entries   []map[string]any `json:"entries"`
}

var (
	approvedCropReferencesOnce sync.Once
	approvedCropReferences     []approvedCropReference
)

func buildApprovedCropReferenceContext(req models.AISuggestRequest) string {
	cropKey := requestedCropKey(strings.Join([]string{
		req.Purpose,
		contextSummary(req.Context),
		req.FarmContext,
	}, " "))
	if cropKey == "" {
		return ""
	}

	approvedCropReferencesOnce.Do(func() {
		approvedCropReferences = loadApprovedCropReferences()
	})
	for _, reference := range approvedCropReferences {
		if requestedCropKey(reference.Crop) != cropKey {
			continue
		}
		payload, err := json.Marshal(reference)
		if err != nil {
			return ""
		}
		return string(payload)
	}
	return ""
}

func loadApprovedCropReferences() []approvedCropReference {
	for _, root := range cropKnowledgeDirectoryCandidates() {
		if info, err := os.Stat(root); err != nil || !info.IsDir() {
			continue
		}
		references := make([]approvedCropReference, 0, 5)
		_ = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil || entry.IsDir() || !strings.EqualFold(filepath.Ext(path), ".json") {
				return nil
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				return nil
			}
			var reference approvedCropReference
			if json.Unmarshal(raw, &reference) == nil && strings.TrimSpace(reference.Crop) != "" {
				references = append(references, reference)
			}
			return nil
		})
		if len(references) > 0 {
			return references
		}
	}
	return nil
}

func cropKnowledgeDirectoryCandidates() []string {
	candidates := make([]string, 0, 4)
	if configured := strings.TrimSpace(os.Getenv("CROP_KNOWLEDGE_DIR")); configured != "" {
		candidates = append(candidates, configured)
	}
	return append(candidates,
		filepath.Join("datasets", "crop-knowledge"),
		filepath.Join("..", "..", "datasets", "crop-knowledge"),
		filepath.Join("software", "backend", "datasets", "crop-knowledge"),
	)
}

func requestedCropKey(value string) string {
	text := strings.ToLower(value)
	switch {
	case strings.Contains(text, "paddy") || strings.Contains(text, "rice"):
		return "paddy-rice"
	case strings.Contains(text, "tomato"):
		return "tomato"
	case strings.Contains(text, "potato"):
		return "potato"
	case strings.Contains(text, "chilli") || strings.Contains(text, "chili"):
		return "chilli"
	case strings.Contains(text, "maize") || strings.Contains(text, "corn"):
		return "maize"
	default:
		return ""
	}
}
