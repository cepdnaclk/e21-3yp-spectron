from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


FEATURE_NAMES = [
    "retrieval_score",
    "crop_supported",
    "stage_present",
    "observation_detail",
    "sensor_available",
    "weather_available",
    "schema_complete",
    "model_token_probability",
]


@dataclass(frozen=True)
class ConfidenceFeatures:
    retrieval_score: float
    crop_supported: float
    stage_present: float
    observation_detail: float
    sensor_available: float
    weather_available: float
    schema_complete: float
    model_token_probability: float

    def vector(self) -> list[float]:
        values = asdict(self)
        return [float(values[name]) for name in FEATURE_NAMES]


@dataclass(frozen=True)
class ConfidenceResult:
    score: float
    label: str
    calibrated: bool
    reasons: list[str]


class ConfidenceEstimator:
    def __init__(self, artifact_path: Path):
        self.artifact_path = artifact_path
        self.model: Any | None = None
        if artifact_path.exists():
            try:
                import joblib

                artifact = joblib.load(artifact_path)
                if artifact.get("feature_names") != FEATURE_NAMES:
                    raise ValueError("confidence artifact feature schema does not match runtime")
                self.model = artifact["model"]
            except ImportError as error:
                raise RuntimeError("joblib is required to load the confidence calibrator") from error

    def estimate(self, features: ConfidenceFeatures) -> ConfidenceResult:
        reasons: list[str] = []
        if features.crop_supported == 0:
            reasons.append("Crop is outside the approved knowledge set.")
        if features.retrieval_score < 0.35:
            reasons.append("The crop references weakly match the reported problem.")
        if features.sensor_available == 0:
            reasons.append("Recent sensor evidence is unavailable.")
        if features.weather_available == 0:
            reasons.append("Current weather evidence is unavailable.")
        if features.stage_present == 0:
            reasons.append("The crop growth stage is missing.")

        if self.model is not None:
            score = float(self.model.predict_proba([features.vector()])[0][1])
            calibrated = True
        else:
            weights = [0.25, 0.15, 0.08, 0.10, 0.10, 0.07, 0.15, 0.10]
            score = sum(weight * value for weight, value in zip(weights, features.vector()))
            score = min(0.69, max(0.0, score))
            calibrated = False
            reasons.append("No reviewed confidence calibrator has been trained yet.")

        if score >= 0.80:
            label = "HIGH"
        elif score >= 0.55:
            label = "MEDIUM"
        else:
            label = "LOW"
        return ConfidenceResult(round(score, 4), label, calibrated, reasons)


def text_available(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip().lower()
    if not text or "unavailable" in text or "no recent" in text:
        return 0.0
    return 1.0

