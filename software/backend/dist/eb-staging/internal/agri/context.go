package agri

import (
	"bytes"
	"embed"
	"encoding/csv"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

//go:embed context_sri_lanka.csv
var datasetFS embed.FS

type Advisory struct {
	Crop      string
	Stage     string
	Issue     string
	Treatment string
	Text      string
}

type DatasetSummary struct {
	Crops    []string
	Stages   []string
	Issues   []string
	Examples []Advisory
}

var advisoryPattern = regexp.MustCompile(`(?i)^For\s+(.+?)\s+crop\s+in\s+(.+?)\s+stage\s+the\s+advisory\s+is\s*-\s*(.+)$`)

func LoadEmbeddedAdvisories() ([]Advisory, error) {
	raw, err := datasetFS.ReadFile("context_sri_lanka.csv")
	if err != nil {
		return nil, err
	}
	return ParseAdvisories(raw)
}

func ParseAdvisories(raw []byte) ([]Advisory, error) {
	reader := csv.NewReader(bytes.NewReader(raw))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	advisories := make([]Advisory, 0, len(records))
	for i, record := range records {
		if len(record) == 0 {
			continue
		}
		text := strings.TrimSpace(record[0])
		if text == "" || (i == 0 && strings.EqualFold(text, "pop")) {
			continue
		}

		advisory := Advisory{Text: compactWhitespace(text)}
		if matches := advisoryPattern.FindStringSubmatch(advisory.Text); len(matches) == 4 {
			advisory.Crop = compactWhitespace(matches[1])
			advisory.Stage = compactWhitespace(matches[2])
			advisory.Text = compactWhitespace(matches[3])
		}
		advisory.Issue = inferIssue(advisory.Text)
		advisory.Treatment = extractTreatment(advisory.Text)
		advisories = append(advisories, advisory)
	}

	return advisories, nil
}

func Summarize(advisories []Advisory) DatasetSummary {
	crops := map[string]bool{}
	stages := map[string]bool{}
	issues := map[string]bool{}
	examples := make([]Advisory, 0, 12)

	for _, advisory := range advisories {
		if advisory.Crop != "" {
			crops[advisory.Crop] = true
		}
		if advisory.Stage != "" {
			stages[advisory.Stage] = true
		}
		if advisory.Issue != "" {
			issues[advisory.Issue] = true
		}
		if len(examples) < 12 && advisory.Issue != "" && advisory.Treatment != "" {
			examples = append(examples, advisory)
		}
	}

	return DatasetSummary{
		Crops:    sortedKeys(crops),
		Stages:   sortedKeys(stages),
		Issues:   sortedKeys(issues),
		Examples: examples,
	}
}

func MatchAdvisories(advisories []Advisory, purpose string, maxRows int) []Advisory {
	if maxRows <= 0 {
		maxRows = 12
	}

	query := strings.ToLower(purpose)
	matched := make([]Advisory, 0, maxRows)
	add := func(advisory Advisory) {
		if len(matched) >= maxRows {
			return
		}
		for _, existing := range matched {
			if existing.Text == advisory.Text {
				return
			}
		}
		matched = append(matched, advisory)
	}

	for _, advisory := range advisories {
		crop := strings.ToLower(advisory.Crop)
		if crop != "" && (strings.Contains(query, crop) || strings.Contains(crop, "paddy") && strings.Contains(query, "rice") || strings.Contains(crop, "rice") && strings.Contains(query, "paddy")) {
			add(advisory)
		}
	}
	for _, advisory := range advisories {
		if advisory.Issue != "" && strings.Contains(query, strings.ToLower(advisory.Issue)) {
			add(advisory)
		}
	}
	for _, advisory := range advisories {
		if advisory.Issue != "" && advisory.Treatment != "" {
			add(advisory)
		}
	}

	return matched
}

func BuildCSVContext(advisories []Advisory) string {
	if len(advisories) == 0 {
		return ""
	}

	var builder strings.Builder
	for i, advisory := range advisories {
		if i > 0 {
			builder.WriteString("\n")
		}
		builder.WriteString(fmt.Sprintf(
			"- Crop: %s | Stage: %s | Issue: %s | Treatment: %s | Advisory: %s",
			emptyAsUnknown(advisory.Crop),
			emptyAsUnknown(advisory.Stage),
			emptyAsUnknown(advisory.Issue),
			emptyAsUnknown(advisory.Treatment),
			advisory.Text,
		))
	}
	return builder.String()
}

func inferIssue(text string) string {
	lower := strings.ToLower(text)
	known := []string{
		"rice blast", "leaf blast", "nodal blast", "panicle blast", "neck blast",
		"sheath rot", "bacterial leaf blight", "blb", "thrips", "yellow stem borer",
		"gall midge", "leaf folder", "leaf foder", "sheath mites", "brown spots",
		"brown spot", "sheath blight", "leaf scald", "bph", "brown plant hopper",
		"stemborer", "stem borer", "rice bug", "weeds", "iron toxicity",
	}
	for _, issue := range known {
		if strings.Contains(lower, issue) {
			return canonicalIssue(issue)
		}
	}
	return ""
}

func canonicalIssue(issue string) string {
	switch strings.ToLower(issue) {
	case "blb":
		return "Bacterial Leaf Blight"
	case "leaf foder":
		return "Leaf Folder"
	case "bph", "brown plant hopper":
		return "Brown Plant Hopper"
	case "brown spots":
		return "Brown Spot"
	default:
		parts := strings.Fields(issue)
		for i, part := range parts {
			if len(part) == 0 {
				continue
			}
			parts[i] = strings.ToUpper(part[:1]) + strings.ToLower(part[1:])
		}
		return strings.Join(parts, " ")
	}
}

func extractTreatment(text string) string {
	sentences := splitSentences(text)
	keywords := []string{"spray", "apply", "treat", "submerge", "avoid", "recommended", "fungicide", "insecticide", "herbicide", "drain"}
	treatments := make([]string, 0, 3)
	for _, sentence := range sentences {
		lower := strings.ToLower(sentence)
		for _, keyword := range keywords {
			if strings.Contains(lower, keyword) {
				treatments = append(treatments, sentence)
				break
			}
		}
		if len(treatments) >= 2 {
			break
		}
	}
	return strings.Join(treatments, " ")
}

func splitSentences(text string) []string {
	parts := regexp.MustCompile(`(?m)(?:\.\s+|\.$)`).Split(text, -1)
	sentences := make([]string, 0, len(parts))
	for _, part := range parts {
		part = compactWhitespace(part)
		if part != "" {
			sentences = append(sentences, strings.TrimSuffix(part, ".")+".")
		}
	}
	return sentences
}

func compactWhitespace(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}

func sortedKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func emptyAsUnknown(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unknown"
	}
	return value
}
