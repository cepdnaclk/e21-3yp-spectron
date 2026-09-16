from __future__ import annotations

import json
import re
from typing import Any


DOSE_PATTERN = re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|g|kg|ml|l)\s*(?:/|per)\s*(?:l|litre|liter|ha|acre)\b", re.I)
TREATMENT_PATTERN = re.compile(r"\b(?:spray|pesticide|fungicide|herbicide|insecticide|fertili[sz]er)\b", re.I)


def enforce_grounding(payload: dict[str, Any], approved_context: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    context_text = json.dumps(approved_context, ensure_ascii=False).lower()
    removed: list[str] = []
    safe_actions: list[str] = []
    for action in payload.get("do_now", []) if isinstance(payload.get("do_now"), list) else []:
        action_text = str(action).strip()
        unsupported_treatment = TREATMENT_PATTERN.search(action_text) and action_text.lower() not in context_text
        unsupported_dose = DOSE_PATTERN.search(action_text) and action_text.lower() not in context_text
        if unsupported_treatment or unsupported_dose:
            removed.append(action_text)
        elif action_text:
            safe_actions.append(action_text)
    payload["do_now"] = safe_actions
    if removed:
        avoid = payload.get("avoid_for_now")
        if not isinstance(avoid, list):
            avoid = []
        avoid.append("Do not apply an unverified treatment; ask a qualified local agricultural officer.")
        payload["avoid_for_now"] = avoid
        payload["confidence_label"] = "LOW"
    return payload, removed

