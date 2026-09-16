# Prompt for drafting reviewable training scenarios with Claude

Attach the files listed below, then paste this prompt. Run it one crop and one problem family at a time. Request no more than 25 scenarios per response so they can be reviewed carefully.

```text
You are preparing draft training data for SPECTRON AgriAssist, a cautious Sri Lankan farm decision-support application.

Use ONLY the attached approved crop-reference files. Do not use outside knowledge, do not browse, and do not invent facts, weather, sensor limits, treatments, sources, product names, pesticide names, doses, mixing rates, intervals, or legal claims.

Create exactly 25 genuinely distinct draft JSONL records for this batch.

Crop: <INSERT ONE OF: Tomato, Potato, Chilli, Maize, Paddy / Rice>
Problem family: <INSERT ONE: water stress, excess water, nutrient concern, pest/disease observation, sensor anomaly, weather risk, growth-stage check>

The required output is JSON Lines only: one complete JSON object per line, no Markdown fence, no introduction, and no explanation.

Every record must contain:
- scenario_id: unique lowercase ID, for example tomato-water-stress-001
- group_id: a shared ID only for records describing the same underlying problem family; use different group IDs for materially different scenarios
- crop
- growth_stage
- farmer_observation
- sensor_summary
- weather_summary
- approved_crop_references: an array of one or more objects with topic and content copied or closely paraphrased from the attached approved references
- expected_output: an object with exactly these keys:
  status, headline, what_may_be_happening, do_now, check_next, why_this_advice,
  avoid_for_now, recheck_after, get_help_if, tell_us_next, safety_note, evidence,
  confidence_label, sources

Rules:
1. Use only the crop supplied above. Never mix crops.
2. Create varied, realistic observations, but never state an unverified diagnosis as fact.
3. When decisive evidence is missing, use status NEED_MORE_INFO or NEEDS_ATTENTION and ask for a simple field check.
4. Use reversible, farmer-friendly actions: inspect, photograph, compare, measure, mark plants, recheck, or contact a local agricultural officer.
5. Do not recommend chemicals, pesticide products, doses, fertilizer amounts, or irreversible actions.
6. Every action and explanation must be supported by an attached approved reference or clearly marked as a request to gather missing evidence.
7. Set confidence_label to LOW when evidence is incomplete, MEDIUM when it is reasonably supported, and never use HIGH in this draft dataset.
8. Sources must contain only sources present in the attached references.
9. Do not include names, addresses, phone numbers, GPS coordinates, account IDs, secrets, or real farmer data.
10. Ensure valid JSON on every line; do not use trailing commas.
11. Do not repeat any attached existing scenario. A changed ID, wording, sensor value, weather value, or growth stage does not make a scenario new if it has the same observation, diagnosis, and next action.
12. Within this batch, every record must have a different farmer observation and a materially different decision path. Do not generate reworded copies.
13. Include at least 5 safe, healthy-condition records with `status` set to `GOOD`, where the evidence supports routine monitoring only. Do not force a warning where none is supported.
14. For the remaining records, vary the missing evidence, symptoms, weather, sensor availability, urgency, and field checks. Do not make every answer `NEED_MORE_INFO`.
15. Before returning, silently compare every proposed record against every other record and all attached existing scenarios. Replace any duplicate or near-duplicate.

Before returning the JSONL, silently validate that all 25 records follow the schema and all advice is grounded in the supplied files.
```

## Required attachments

Attach these seven files to every Claude conversation. Claude must still generate records only for the crop named in the prompt:

1. `data/expert_scenarios.example.jsonl`
2. `software/backend/datasets/crop-knowledge/README.md`
3. `software/backend/datasets/crop-knowledge/chilli/doa.json`
4. `software/backend/datasets/crop-knowledge/maize/doa.json`
5. `software/backend/datasets/crop-knowledge/paddy-rice/official-and-irri.json`
6. `software/backend/datasets/crop-knowledge/potato/doa.json`
7. `software/backend/datasets/crop-knowledge/tomato/doa.json`

The `README.md` plus the example schema and the five crop files are the complete reference package. Do not upload application secrets, AWS configuration, databases, or raw farm exports.

## Review process

Before requesting a new batch, attach a file named `existing_scenarios.jsonl` containing all approved unique scenarios already collected. Save Claude's result to a temporary draft file, have an agricultural reviewer correct it, then append only approved rows to `data/expert_scenarios.jsonl`. Synthetic drafts are not expert labels and must not be used for production training without review.
