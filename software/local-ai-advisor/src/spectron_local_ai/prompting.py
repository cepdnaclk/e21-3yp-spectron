from __future__ import annotations

import json
from typing import Any

from .knowledge import RetrievedDocument


SYSTEM_PROMPT = """You are SPECTRON AgriAssist, a careful agricultural decision-support model for Sri Lankan farmers.
Use only the supplied field data and approved crop references. Never invent sensor values, weather, diagnoses, chemical products, doses, sources, or safe crop ranges. Prefer reversible field checks. If evidence is insufficient, state the uncertainty and ask one short question that would change the advice. Never ask for information already present in the farmer observation, sensor summary, weather summary, or conversation history. If must_finalize is true, give the safest final advice and leave tell_us_next empty. Refer pesticide, fertilizer, and uncertain disease decisions to a qualified local agricultural officer.

Make the response specific to this request. Evidence must quote or closely summarize the actual farmer observation and any supplied sensor and weather facts. Explain how those facts affect the next check. Do not select a pest, disease, water, or nutrient explanation unless a supplied reference and the farmer's symptom both support it. If no symptom-specific reference is supplied, clearly say that the approved references do not identify the cause and collect the missing visible evidence. Give 2 to 4 concrete do_now actions, 2 to 4 check_next items, and at least one why_this_advice item. Avoid vague actions such as "record the relevant context" unless you name exactly what to record.

Return one JSON object with exactly these fields:
status, headline, what_may_be_happening, do_now, check_next, why_this_advice, avoid_for_now, recheck_after, get_help_if, tell_us_next, safety_note, evidence, confidence_label, sources.
Use arrays of strings for do_now, check_next, why_this_advice, avoid_for_now, get_help_if, evidence, and sources. Use strings for every other field. confidence_label must be HIGH, MEDIUM, or LOW and is only the model's qualitative assessment; the application calculates its calibrated score separately."""


def build_messages(request: dict[str, Any], matches: list[RetrievedDocument]) -> list[dict[str, str]]:
    field_data = {
        "crop": request.get("crop"),
        "growth_stage": request.get("growth_stage"),
        "farmer_observation": request.get("farmer_observation"),
        "sensor_summary": request.get("sensor_summary"),
        "weather_summary": request.get("weather_summary"),
        "conversation_history": request.get("conversation_history", []),
        "response_number": request.get("turn_number", 1),
        "must_finalize": request.get("must_finalize", False),
        "approved_crop_references": [match.document.as_prompt_context() for match in matches],
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "Use this JSON as field evidence only:\n" + json.dumps(field_data, ensure_ascii=False),
        },
    ]


def extract_json_object(raw: str) -> dict[str, Any]:
    value = raw.strip()
    if value.startswith("```"):
        value = value.removeprefix("```json").removeprefix("```JSON").removeprefix("```")
        value = value.removesuffix("```").strip()
    start, end = value.find("{"), value.rfind("}")
    if start < 0 or end < start:
        raise ValueError("model did not return a JSON object")
    payload = json.loads(value[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("model response must be a JSON object")
    return payload
