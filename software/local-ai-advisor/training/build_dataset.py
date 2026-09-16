from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

SYSTEM = """Generate cautious SPECTRON agricultural decision support from supplied field evidence and approved references. Return the required JSON only. Never invent treatments, doses, readings, weather, or sources. Ask for missing decisive evidence and defer unsafe or uncertain treatment decisions to a qualified local agricultural officer."""


def read_rows(path: Path) -> list[dict]:
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        required = {"crop", "growth_stage", "farmer_observation", "approved_crop_references", "expected_output"}
        missing = required.difference(row)
        if missing:
            raise ValueError(f"{path}:{line_number} missing {sorted(missing)}")
        rows.append(row)
    return rows


def training_row(row: dict) -> dict:
    evidence = {key: value for key, value in row.items() if key != "expected_output"}
    return {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": json.dumps(evidence, ensure_ascii=False)},
            {"role": "assistant", "content": json.dumps(row["expected_output"], ensure_ascii=False)},
        ],
        "scenario_id": row.get("scenario_id"),
        "group_id": row.get("group_id"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    args = parser.parse_args()

    rows = read_rows(args.source)
    groups: dict[str, list[dict]] = {}
    for index, row in enumerate(rows):
        group = str(row.get("group_id") or row.get("scenario_id") or f"row-{index}")
        groups.setdefault(group, []).append(row)
    group_names = sorted(groups)
    random.Random(args.seed).shuffle(group_names)
    validation_count = max(1, round(len(group_names) * args.validation_ratio)) if len(group_names) > 1 else 0
    validation_groups = set(group_names[:validation_count])
    splits = {
        "train": [row for group, items in groups.items() if group not in validation_groups for row in items],
        "validation": [row for group, items in groups.items() if group in validation_groups for row in items],
    }
    args.output.mkdir(parents=True, exist_ok=True)
    for name, split_rows in splits.items():
        destination = args.output / f"{name}.jsonl"
        destination.write_text(
            "".join(json.dumps(training_row(row), ensure_ascii=False) + "\n" for row in split_rows),
            encoding="utf-8",
        )
        print(f"{name}: {len(split_rows)} rows -> {destination}")


if __name__ == "__main__":
    main()

