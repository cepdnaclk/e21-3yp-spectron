"""Build a deduplicated synthetic training draft from approved crop references.

This is for pipeline experiments only. It must not be represented as expert-reviewed
field data or used to enable farmer-facing advice without agronomic review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def load_jsonl(paths: list[Path]) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            fingerprint = json.dumps(
                {
                    "crop": row.get("crop"),
                    "growth_stage": row.get("growth_stage"),
                    "farmer_observation": row.get("farmer_observation"),
                    "sensor_summary": row.get("sensor_summary"),
                    "weather_summary": row.get("weather_summary"),
                    "approved_crop_references": row.get("approved_crop_references"),
                    "expected_output": row.get("expected_output"),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
            if fingerprint not in seen:
                seen.add(fingerprint)
                rows.append(row)
    return rows


def synthetic_row(crop_doc: dict, entry: dict, index: int) -> dict:
    crop = crop_doc["crop"]
    topic = entry["topic"]
    content = entry["content"]
    actions = entry.get("actions", [])
    questions = entry.get("confirmation_questions", [])
    symptoms = entry.get("symptoms", [])
    stage = entry.get("growth_stage", "Not specified")
    slug = "".join(char.lower() if char.isalnum() else "-" for char in topic).strip("-")
    scenario_id = f"synthetic-{crop.lower().replace(' / ', '-')}-{slug}-{index:02d}"

    observation_contexts = [
        "During a routine field walk, the farmer reports {symptom} and wants to know what to check first.",
        "A farmer noticed {symptom} in the field and requests a cautious confirmation step.",
        "The farmer wants to compare plants showing {symptom} with a healthy nearby area before making a change.",
        "{symptom_cap} was noted, but no recent sensor reading is available for this draft scenario.",
        "{symptom_cap} was noted, but no local weather record is available for this draft scenario.",
        "The field team marked plants showing {symptom} and asks what evidence to record on the next visit.",
        "The farmer reports {symptom} but cannot yet say whether it is spreading or limited to one patch.",
        "During a routine {crop} field check, no concerning symptom related to {topic} was observed.",
    ]
    variant = (index - 1) % len(observation_contexts)

    if symptoms and variant != 7:
        symptom = symptoms[index % len(symptoms)]
        observation = observation_contexts[variant].format(
            crop=crop,
            topic=topic.lower(),
            symptom=symptom,
            symptom_cap=symptom[:1].upper() + symptom[1:],
        )
        status = "NEEDS_ATTENTION" if variant in {0, 1, 5} else "NEED_MORE_INFO"
        do_now = list(actions[:2]) or [f"Inspect the affected area for {symptom}."]
        check_next = list(questions[variant % len(questions) :][:2]) if questions else ["Record whether the observation is spreading, stable, or limited to one patch."]
    elif variant == 7:
        observation = observation_contexts[variant].format(crop=crop, topic=topic.lower())
        status = "GOOD"
        do_now = ["Continue routine field monitoring and record any change."]
        check_next = ["Repeat the same check at the next scheduled field walk."]
    else:
        observation = f"The farmer is planning a {crop} field check related to {topic.lower()} and needs the safest next observation (scenario {index})."
        status = "NEED_MORE_INFO"
        do_now = list(actions[:2]) or ["Record the relevant field condition before making a change."]
        check_next = list(questions[:2]) or ["Compare the observation with a healthy nearby area."]

    confidence = "MEDIUM" if status == "GOOD" else "LOW"
    source = crop_doc["source"]
    return {
        "scenario_id": scenario_id,
        "group_id": f"synthetic-{crop.lower().replace(' / ', '-')}-{slug}",
        "crop": crop,
        "growth_stage": stage,
        "farmer_observation": observation,
        "sensor_summary": "No recent sensor reading was supplied for this draft scenario.",
        "weather_summary": "No local weather record was supplied for this draft scenario.",
        "approved_crop_references": [{"topic": topic, "content": content}],
        "expected_output": {
            "status": status,
            "headline": f"Check {topic.lower()} before deciding next steps",
            "what_may_be_happening": "The approved reference supports a cautious field check; the available evidence does not confirm a diagnosis.",
            "do_now": do_now,
            "check_next": check_next,
            "why_this_advice": [content],
            "avoid_for_now": ["Do not make an irreversible treatment or input decision before confirming the field evidence."],
            "recheck_after": "At the next scheduled field check.",
            "get_help_if": ["Ask a local agricultural officer if the condition is spreading, severe, or remains unclear after inspection."],
            "tell_us_next": questions[0] if questions else "What did the field check show?",
            "safety_note": "This is cautious decision support only; confirm the condition before treatment.",
            "evidence": [content],
            "confidence_label": confidence,
            "sources": [source],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--desktop-source", type=Path, required=True)
    parser.add_argument("--knowledge-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--variants-per-reference", type=int, default=8)
    args = parser.parse_args()
    if not 1 <= args.variants_per_reference <= 8:
        raise ValueError("--variants-per-reference must be between 1 and 8 to avoid template duplicates")

    existing = load_jsonl(sorted(args.desktop_source.glob("*.jsonl")))
    synthetic: list[dict] = []
    for path in sorted(args.knowledge_dir.glob("**/*.json")):
        crop_doc = json.loads(path.read_text(encoding="utf-8"))
        for entry in crop_doc.get("entries", []):
            synthetic.extend(
                synthetic_row(crop_doc, entry, index)
                for index in range(1, args.variants_per_reference + 1)
            )

    rows = existing + synthetic
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f"desktop unique rows: {len(existing)}")
    print(f"synthetic reference-grounded rows: {len(synthetic)}")
    print(f"combined draft rows: {len(rows)}")
    print(f"sha256: {digest}")


if __name__ == "__main__":
    main()
