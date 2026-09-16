from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


TOKEN_PATTERN = re.compile(r"[a-z0-9]+", re.IGNORECASE)

# Words that describe almost every crop report are not sufficient evidence for
# selecting a symptom-specific reference. Without this guard, a stage match can
# make (for example) maize whorl-damage advice win for an unrelated leaf-colour
# observation merely because both mention leaves.
GENERIC_FIELD_TOKENS = {
    "a",
    "affected",
    "an",
    "and",
    "area",
    "are",
    "at",
    "before",
    "change",
    "crop",
    "during",
    "field",
    "for",
    "from",
    "has",
    "have",
    "in",
    "inside",
    "is",
    "it",
    "leaf",
    "leaves",
    "maize",
    "new",
    "newly",
    "of",
    "on",
    "one",
    "or",
    "plant",
    "plants",
    "reported",
    "the",
    "this",
    "to",
    "with",
}
GENERAL_CATEGORIES = {"crop_profile", "field_management", "source_scope"}


def normalize_crop(value: str) -> str:
    normalized = " ".join(TOKEN_PATTERN.findall(value.lower()))
    aliases = {
        "rice": "paddy rice",
        "paddy": "paddy rice",
        "paddy rice": "paddy rice",
        "chili": "chilli",
        "chilies": "chilli",
    }
    return aliases.get(normalized, normalized)


def tokenize(value: str) -> list[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(value)]


@dataclass(frozen=True)
class KnowledgeDocument:
    crop: str
    category: str
    topic: str
    content: str
    growth_stage: str
    source: str
    source_url: str
    metadata: dict[str, Any]

    @property
    def searchable_text(self) -> str:
        extras = " ".join(
            str(item)
            for key in ("symptoms", "confirmation_questions", "actions", "plant_parts", "required_context")
            for item in self.metadata.get(key, [])
        )
        return " ".join((self.category, self.topic, self.content, self.growth_stage, extras))

    def as_prompt_context(self) -> dict[str, Any]:
        return {
            "crop": self.crop,
            "growth_stage": self.growth_stage or None,
            "category": self.category,
            "topic": self.topic,
            "content": self.content,
            "actions": self.metadata.get("actions", []),
            "confirmation_questions": self.metadata.get("confirmation_questions", []),
            "source": self.source,
            "source_url": self.source_url,
        }


@dataclass(frozen=True)
class RetrievedDocument:
    document: KnowledgeDocument
    score: float


class KnowledgeIndex:
    def __init__(self, documents: list[KnowledgeDocument]):
        self.documents = documents
        self._tokens = [tokenize(document.searchable_text) for document in documents]
        self._document_frequency = Counter(
            token for tokens in self._tokens for token in set(tokens)
        )
        self._average_length = (
            sum(len(tokens) for tokens in self._tokens) / len(self._tokens)
            if self._tokens
            else 1.0
        )

    @classmethod
    def from_directory(cls, root: Path) -> "KnowledgeIndex":
        documents: list[KnowledgeDocument] = []
        for path in sorted(root.rglob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
            crop = str(payload.get("crop", "")).strip()
            for entry in payload.get("entries", []):
                documents.append(
                    KnowledgeDocument(
                        crop=crop,
                        category=str(entry.get("category", "general")).strip(),
                        topic=str(entry.get("topic", "General guidance")).strip(),
                        content=str(entry.get("content", "")).strip(),
                        growth_stage=str(entry.get("growth_stage", "")).strip(),
                        source=str(entry.get("source") or payload.get("source", "")).strip(),
                        source_url=str(entry.get("source_url") or payload.get("source_url", "")).strip(),
                        metadata=dict(entry),
                    )
                )
        if not documents:
            raise ValueError(f"no crop knowledge documents found in {root}")
        return cls(documents)

    def _bm25(self, query_tokens: list[str], index: int) -> float:
        tokens = self._tokens[index]
        counts = Counter(tokens)
        length = max(1, len(tokens))
        score = 0.0
        k1, b = 1.5, 0.75
        total_documents = max(1, len(self.documents))
        for token in set(query_tokens):
            frequency = counts[token]
            if not frequency:
                continue
            document_frequency = self._document_frequency[token]
            inverse_frequency = math.log(
                1 + (total_documents - document_frequency + 0.5) / (document_frequency + 0.5)
            )
            denominator = frequency + k1 * (1 - b + b * length / self._average_length)
            score += inverse_frequency * frequency * (k1 + 1) / denominator
        return score

    def retrieve(self, crop: str, growth_stage: str, observation: str, top_k: int = 8) -> list[RetrievedDocument]:
        crop_key = normalize_crop(crop)
        candidates = [
            index
            for index, document in enumerate(self.documents)
            if normalize_crop(document.crop) == crop_key
        ]
        if not candidates:
            return []

        query_tokens = tokenize(observation)
        observation_tokens = set(query_tokens) - GENERIC_FIELD_TOKENS
        stage_tokens = set(tokenize(growth_stage))
        ranked: list[RetrievedDocument] = []
        for index in candidates:
            document = self.documents[index]
            score = self._bm25(query_tokens, index)
            if document.category not in GENERAL_CATEGORIES:
                symptom_signals = [
                    str(item)
                    for key in ("symptoms", "plant_parts")
                    for item in document.metadata.get(key, [])
                    if str(item).strip()
                ]
                symptom_text = " ".join(
                    (
                        document.topic,
                        " ".join(symptom_signals) if symptom_signals else document.content,
                    )
                )
                symptom_tokens = set(tokenize(symptom_text)) - GENERIC_FIELD_TOKENS
                if not observation_tokens.intersection(symptom_tokens):
                    continue
            document_stage = set(tokenize(document.growth_stage))
            if stage_tokens and document_stage and stage_tokens.intersection(document_stage):
                score += min(0.6, max(0.1, score * 0.25))
            if document.category in {"observation", "disease", "pest", "irrigation", "water_management"}:
                score += 0.15
            ranked.append(RetrievedDocument(document=document, score=score))

        ranked.sort(key=lambda match: (-match.score, match.document.topic))
        return ranked[: max(1, top_k)]

    @staticmethod
    def normalized_retrieval_score(matches: list[RetrievedDocument]) -> float:
        if not matches:
            return 0.0
        return max(0.0, min(1.0, 1.0 - math.exp(-matches[0].score / 4.0)))
