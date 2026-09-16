from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    import joblib
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.linear_model import LogisticRegression

    from spectron_local_ai.confidence import FEATURE_NAMES

    rows = [json.loads(line) for line in args.input.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(rows) < 100:
        raise ValueError("at least 100 independently reviewed confidence labels are required")
    labels = [int(bool(row["is_correct_and_safe"])) for row in rows]
    if len(set(labels)) != 2:
        raise ValueError("confidence labels must include both accepted and rejected recommendations")
    features = [[float(row["features"][name]) for name in FEATURE_NAMES] for row in rows]
    model = CalibratedClassifierCV(LogisticRegression(max_iter=2000), method="sigmoid", cv=5)
    model.fit(features, labels)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"feature_names": FEATURE_NAMES, "model": model}, args.output)
    print(f"saved calibrated confidence model to {args.output}")


if __name__ == "__main__":
    main()

