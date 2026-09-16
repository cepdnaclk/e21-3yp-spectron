from __future__ import annotations

import os
import json
import re
from functools import lru_cache
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .confidence import ConfidenceEstimator, ConfidenceFeatures, text_available
from .config import Settings
from .inference import ModelEngine, create_engine
from .knowledge import GENERAL_CATEGORIES, KnowledgeIndex
from .prompting import build_messages, extract_json_object
from .safety import enforce_grounding


LIST_FIELDS = (
    "do_now",
    "check_next",
    "why_this_advice",
    "avoid_for_now",
    "get_help_if",
    "evidence",
    "sources",
)
TEXT_FIELDS = (
    "status",
    "headline",
    "what_may_be_happening",
    "recheck_after",
    "tell_us_next",
    "safety_note",
    "confidence_label",
)


class RecommendationRequest(BaseModel):
    crop: str = Field(min_length=2, max_length=80)
    growth_stage: str = Field(default="", max_length=120)
    farmer_observation: str = Field(min_length=5, max_length=4000)
    sensor_summary: Any = None
    weather_summary: Any = None
    conversation_history: list[dict[str, Any]] = Field(default_factory=list, max_length=6)
    turn_number: int = Field(default=1, ge=1, le=3)
    must_finalize: bool = False


QUESTION_FILLER = {
    "a", "an", "are", "at", "can", "did", "do", "does", "in", "is", "it",
    "of", "on", "or", "the", "there", "to", "what", "when", "where", "which",
}


def _plain_text(value: Any, limit: int = 220) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _question_already_answered(question: str, request: RecommendationRequest) -> bool:
    if not question.strip():
        return False
    evidence = " ".join(
        (
            request.farmer_observation,
            _plain_text(request.sensor_summary, 1000),
            _plain_text(request.weather_summary, 1000),
            _plain_text(request.conversation_history, 2000),
        )
    ).lower()
    question_tokens = {
        token for token in re.findall(r"[a-z0-9]+", question.lower())
        if token not in QUESTION_FILLER and len(token) > 2
    }
    evidence_tokens = set(re.findall(r"[a-z0-9]+", evidence))
    if question_tokens and len(question_tokens & evidence_tokens) / len(question_tokens) >= 0.6:
        return True
    if re.search(r"\b(proportion|percentage|how many)\b", question, re.I):
        if re.search(r"\b\d+(?:\.\d+)?\s*%|\b(?:one|two|three|four|five|quarter|half)\s+(?:in|of)\b", evidence):
            return True
    if "moisture" in question.lower() and "moisture" in evidence:
        if re.search(r"\b(stable|rising|falling|increasing|decreasing|declining|trend|\d+(?:\.\d+)?)\b", evidence):
            return True
    return False


def _observation_focus(observation: str) -> str:
    tokens = set(re.findall(r"[a-z]+", observation.lower()))
    for variants, label in (
        ({"leaf", "leaves", "whorl", "whorls"}, "leaf"),
        ({"fruit", "fruits"}, "fruit"),
        ({"flower", "flowers", "blossom", "blossoms"}, "flower"),
        ({"stem", "stems"}, "stem"),
        ({"root", "roots"}, "root"),
    ):
        if tokens.intersection(variants):
            return label
    return "plant"


def _apply_insufficient_reference_fallback(
    payload: dict[str, Any],
    request: RecommendationRequest,
) -> None:
    focus = _observation_focus(request.farmer_observation)
    payload.update(
        {
            "status": "NEEDS_ATTENTION" if request.must_finalize else "NEED_MORE_INFO",
            "headline": f"Check the reported {request.crop} {focus} change today.",
            "what_may_be_happening": (
                f"The reported {focus} change does not match a symptom-specific approved "
                f"{request.crop} reference, so its cause cannot be confirmed from the available evidence."
            ),
            "do_now": [
                f"Mark the affected {request.crop} plants and photograph the {focus} change beside healthy plants in the same Field.",
                "Record the crop age, variety, affected-field percentage, rainfall, irrigation history, and any recent field inputs.",
            ],
            "check_next": [
                f"Compare the same marked {focus} area with healthy nearby plants at the next field check.",
                "Record whether the affected patch is stable, spreading, or recovering.",
            ],
            "why_this_advice": [
                "The farmer observation, recent sensors, and weather describe the current conditions, but the approved crop references do not identify this symptom's cause.",
                "A focused comparison provides the missing visible evidence without committing to an unconfirmed treatment.",
            ],
            "avoid_for_now": [
                "Do not apply pesticide or fertilizer, or change irrigation, from appearance alone before the cause is confirmed."
            ],
            "recheck_after": "Recheck the same marked plants within 24 hours.",
            "get_help_if": [
                "Contact a local agricultural officer if the change spreads quickly, plants collapse, or the cause remains unclear after the next check."
            ],
            "tell_us_next": "" if request.must_finalize else (
                "Is the colour change uniform across each leaf, between the veins, or strongest at the edges?"
                if focus == "leaf"
                else f"What visible part of the {focus} changed first, and is the change spreading?"
            ),
            "safety_note": "Confirm the visible field condition before treatment.",
        }
    )


def _complete_grounded_fields(
    payload: dict[str, Any],
    request: RecommendationRequest,
    matches: list[Any],
) -> None:
    specific_matches = [
        match for match in matches
        if match.document.category not in GENERAL_CATEGORIES
    ]
    if not specific_matches:
        _apply_insufficient_reference_fallback(payload, request)

    context_questions = [
        str(question).strip()
        for match in matches
        for question in match.document.metadata.get("confirmation_questions", [])
        if str(question).strip()
    ]
    context_actions = [
        str(action).strip()
        for match in matches
        for action in match.document.metadata.get("actions", [])
        if str(action).strip()
    ]

    question = str(payload.get("tell_us_next", "")).strip()
    if (
        request.must_finalize
        or (question and not question.endswith("?"))
        or _question_already_answered(question, request)
    ):
        payload["tell_us_next"] = ""
    if not request.must_finalize and not payload["tell_us_next"]:
        payload["tell_us_next"] = next(
            (item for item in context_questions if not _question_already_answered(item, request)),
            "",
        )

    specific_actions = [
        str(action).strip()
        for match in specific_matches
        for action in match.document.metadata.get("actions", [])
        if str(action).strip()
        and not _question_already_answered(str(action), request)
    ]
    for action in reversed(specific_actions):
        if action not in payload["do_now"]:
            payload["do_now"].insert(0, action)
    payload["do_now"] = payload["do_now"][:4]

    for action in context_actions:
        if len(payload["do_now"]) >= 2:
            break
        if action not in payload["do_now"] and not _question_already_answered(action, request):
            payload["do_now"].append(action)
    if len(payload["do_now"]) < 2:
        payload["do_now"].append(
            f"Mark the affected {request.crop} plants and photograph them beside healthy plants in the same Field."
        )

    payload["check_next"] = [
        item for item in payload["check_next"]
        if not _question_already_answered(item, request)
    ]
    if not payload["check_next"]:
        payload["check_next"] = [
            item for item in context_questions
            if not _question_already_answered(item, request)
        ][:2]
    if not payload["check_next"]:
        payload["check_next"] = [
            "Compare the same marked plants with healthy nearby plants at the next field check."
        ]
    if not payload["why_this_advice"]:
        payload["why_this_advice"] = [
            match.document.content for match in matches[:2] if match.document.content
        ] or [
            "The approved crop references do not identify this cause, so visible field evidence is needed before treatment."
        ]
    elif specific_matches:
        specific_reason = specific_matches[0].document.content
        if specific_reason and specific_reason not in payload["why_this_advice"]:
            payload["why_this_advice"].insert(0, specific_reason)
            payload["why_this_advice"] = payload["why_this_advice"][:3]
    if not payload["avoid_for_now"]:
        payload["avoid_for_now"] = [
            "Do not apply an unconfirmed treatment or change irrigation from leaf appearance alone."
        ]
    if not payload["get_help_if"]:
        payload["get_help_if"] = [
            "Contact a local agricultural officer if the change spreads quickly or remains unclear after the next check."
        ]
    if not payload["recheck_after"]:
        payload["recheck_after"] = "Recheck the same marked plants within 24 hours."
    if not payload["safety_note"]:
        payload["safety_note"] = "Confirm the visible field condition before treatment."

    supplied_evidence = [f"Farmer reported: {request.farmer_observation}"]
    if sensor := _plain_text(request.sensor_summary):
        supplied_evidence.append(f"Recent sensors: {sensor}")
    if weather := _plain_text(request.weather_summary):
        supplied_evidence.append(f"Weather: {weather}")
    payload["evidence"] = supplied_evidence[:3]

    if (
        payload["status"].upper() == "NEED_MORE_INFO"
        and (request.must_finalize or not payload["tell_us_next"])
    ):
        payload["status"] = "NEEDS_ATTENTION"


class AdvisorRuntime:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.knowledge = KnowledgeIndex.from_directory(settings.knowledge_dir)
        self.engine: ModelEngine = create_engine(settings)
        self.confidence = ConfidenceEstimator(settings.confidence_model_path)

    def recommend(self, request: RecommendationRequest) -> dict[str, Any]:
        request_data = request.model_dump()
        matches = self.knowledge.retrieve(
            request.crop,
            request.growth_stage,
            request.farmer_observation,
            self.settings.top_k,
        )
        generation = self.engine.generate(build_messages(request_data, matches))
        payload = extract_json_object(generation.text)
        for field in LIST_FIELDS:
            if not isinstance(payload.get(field), list):
                payload[field] = []
            payload[field] = [str(item).strip() for item in payload[field] if str(item).strip()]
        for field in TEXT_FIELDS:
            payload[field] = str(payload.get(field, "")).strip()

        # Small local models sometimes put their single follow-up question in
        # check_next. Keep the mobile/desktop contract consistent without
        # inventing a new question.
        if payload["status"].upper() == "NEED_MORE_INFO" and not payload["tell_us_next"]:
            payload["tell_us_next"] = next(
                (item for item in payload["check_next"] if item.endswith("?")),
                next(
                    (
                        str(question).strip()
                        for match in matches
                        for question in match.document.metadata.get("confirmation_questions", [])
                        if str(question).strip()
                    ),
                    "",
                ),
            )

        # Retrieved references are authoritative. If the model omits the
        # source array, return the source names from those references.
        if not payload["sources"]:
            payload["sources"] = list(
                dict.fromkeys(
                    match.document.source
                    for match in matches
                    if match.document.source
                )
            )
        _complete_grounded_fields(payload, request, matches)
        schema_complete = float(bool(payload["status"] and payload["headline"] and payload["do_now"]))
        contexts = [match.document.as_prompt_context() for match in matches]
        payload, removed_actions = enforce_grounding(payload, contexts)
        if removed_actions:
            schema_complete = 0.0
            # Refill only from the trusted references and observation-safe
            # fallback after unsafe model actions have been removed.
            _complete_grounded_fields(payload, request, matches)

        features = ConfidenceFeatures(
            retrieval_score=self.knowledge.normalized_retrieval_score(matches),
            crop_supported=float(bool(matches)),
            stage_present=float(bool(request.growth_stage.strip())),
            observation_detail=min(1.0, len(request.farmer_observation.split()) / 20.0),
            sensor_available=text_available(request.sensor_summary),
            weather_available=text_available(request.weather_summary),
            schema_complete=schema_complete,
            model_token_probability=generation.mean_token_probability or 0.0,
        )
        confidence = self.confidence.estimate(features)
        confidence_score = confidence.score
        confidence_label = confidence.label
        confidence_reasons = list(confidence.reasons)
        if not any(match.document.category not in GENERAL_CATEGORIES for match in matches):
            confidence_score = min(confidence_score, 0.49)
            confidence_label = "LOW"
            confidence_reasons.insert(0, "No symptom-specific approved crop reference matched the observation.")
        payload["confidence"] = confidence_label
        payload["confidence_label"] = confidence_label
        payload["confidence_details"] = {
            "score": confidence_score,
            "label": confidence_label,
            "calibrated": confidence.calibrated,
            "reasons": confidence_reasons,
        }
        payload["retrieved_context"] = contexts
        payload["model"] = self.settings.local_model_name
        payload["provider"] = "local"
        return payload


@lru_cache(maxsize=1)
def runtime() -> AdvisorRuntime:
    return AdvisorRuntime(Settings.from_env())


app = FastAPI(title="SPECTRON Local AI Advisor", version="0.1.0")


@app.get("/health")
def health() -> dict[str, Any]:
    settings = Settings.from_env()
    return {
        "status": "ok",
        "model_backend": settings.model_backend,
        "model": settings.local_model_name,
        "knowledge_dir_available": settings.knowledge_dir.exists(),
        "confidence_calibrated": settings.confidence_model_path.exists(),
    }


@app.post("/v1/recommendations")
def recommend(request: RecommendationRequest, x_spectron_advisor_key: str = Header(default="")) -> dict[str, Any]:
    if (expected_key := Settings.from_env().api_key) and x_spectron_advisor_key != expected_key:
        raise HTTPException(status_code=401, detail="invalid advisor key")
    try:
        return runtime().recommend(request)
    except (httpx.HTTPError, RuntimeError, ValueError, KeyError) as error:
        raise HTTPException(status_code=503, detail=f"local advisor unavailable: {error}") from error


def run() -> None:
    import uvicorn

    settings = Settings.from_env()
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    run()
