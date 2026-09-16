from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")
DEFAULT_KNOWLEDGE_DIR = PROJECT_ROOT.parent / "backend" / "datasets" / "crop-knowledge"


def _path_from_env(name: str, default: Path) -> Path:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default.resolve()
    path = Path(raw)
    return (PROJECT_ROOT / path).resolve() if not path.is_absolute() else path.resolve()


@dataclass(frozen=True)
class Settings:
    model_backend: str
    local_model_url: str
    local_model_name: str
    hf_model_id: str
    lora_adapter_path: str
    knowledge_dir: Path
    confidence_model_path: Path
    top_k: int
    host: str
    port: int
    api_key: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            model_backend=os.getenv("MODEL_BACKEND", "http").strip().lower(),
            local_model_url=os.getenv("LOCAL_MODEL_URL", "http://127.0.0.1:8081/v1").rstrip("/"),
            local_model_name=os.getenv("LOCAL_MODEL_NAME", "Qwen2.5-1.5B-Instruct").strip(),
            hf_model_id=os.getenv("HF_MODEL_ID", "Qwen/Qwen2.5-1.5B-Instruct").strip(),
            lora_adapter_path=os.getenv("LORA_ADAPTER_PATH", "").strip(),
            knowledge_dir=_path_from_env("KNOWLEDGE_DIR", DEFAULT_KNOWLEDGE_DIR),
            confidence_model_path=_path_from_env(
                "CONFIDENCE_MODEL_PATH", PROJECT_ROOT / "artifacts" / "confidence_calibrator.joblib"
            ),
            top_k=max(1, min(20, int(os.getenv("ADVISOR_TOP_K", "8")))),
            host=os.getenv("ADVISOR_HOST", "127.0.0.1").strip(),
            port=int(os.getenv("ADVISOR_PORT", "8091")),
            api_key=os.getenv("ADVISOR_API_KEY", "").strip(),
        )
