from __future__ import annotations

import math
import os
from dataclasses import dataclass
from typing import Protocol

import httpx

from .config import Settings


@dataclass(frozen=True)
class GenerationResult:
    text: str
    mean_token_probability: float | None = None


class ModelEngine(Protocol):
    def generate(self, messages: list[dict[str, str]]) -> GenerationResult: ...


class LocalHTTPModel:
    def __init__(self, settings: Settings):
        self.url = settings.local_model_url + "/chat/completions"
        self.model = settings.local_model_name

    def generate(self, messages: list[dict[str, str]]) -> GenerationResult:
        max_tokens = max(256, min(900, int(os.getenv("ADVISOR_MAX_NEW_TOKENS", "512"))))
        request = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.15,
            "max_tokens": max_tokens,
        }
        response = httpx.post(
            self.url,
            json={
                **request,
                "response_format": {"type": "json_object"},
                "logprobs": True,
            },
            timeout=300.0,
        )
        # llama.cpp, Ollama and other OpenAI-compatible servers do not all
        # implement response_format or logprobs. The prompt still requires JSON.
        if response.status_code in {400, 422}:
            response = httpx.post(self.url, json=request, timeout=300.0)
        response.raise_for_status()
        payload = response.json()
        choice = payload["choices"][0]
        logprob_rows = (choice.get("logprobs") or {}).get("content") or []
        logprobs = [float(row["logprob"]) for row in logprob_rows if row.get("logprob") is not None]
        token_probability = (
            math.exp(sum(logprobs) / len(logprobs)) if logprobs else None
        )
        return GenerationResult(
            text=choice["message"]["content"],
            mean_token_probability=token_probability,
        )


class TransformersModel:
    def __init__(self, settings: Settings):
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as error:
            raise RuntimeError("install the inference extras: pip install -e '.[inference]'") from error

        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(settings.hf_model_id)
        model_dtype = "auto" if torch.cuda.is_available() else torch.float32
        self.model = AutoModelForCausalLM.from_pretrained(
            settings.hf_model_id,
            dtype=model_dtype,
            device_map="auto",
        )
        if settings.lora_adapter_path:
            from peft import PeftModel

            self.model = PeftModel.from_pretrained(self.model, settings.lora_adapter_path)

    def generate(self, messages: list[dict[str, str]]) -> GenerationResult:
        max_tokens = max(256, min(900, int(os.getenv("ADVISOR_MAX_NEW_TOKENS", "512"))))
        inputs = self.tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_tensors="pt",
            return_dict=True,
        )
        inputs = {name: tensor.to(self.model.device) for name, tensor in inputs.items()}
        with self.torch.inference_mode():
            output = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                do_sample=False,
                return_dict_in_generate=True,
                output_scores=True,
            )
        generated = output.sequences[0, inputs["input_ids"].shape[-1] :]
        probabilities: list[float] = []
        for token, logits in zip(generated, output.scores):
            probability = self.torch.softmax(logits[0].float(), dim=-1)[token].item()
            probabilities.append(max(probability, 1e-9))
        mean_probability = (
            math.exp(sum(math.log(value) for value in probabilities) / len(probabilities))
            if probabilities
            else None
        )
        return GenerationResult(
            text=self.tokenizer.decode(generated, skip_special_tokens=True),
            mean_token_probability=mean_probability,
        )


def create_engine(settings: Settings) -> ModelEngine:
    if settings.model_backend == "transformers":
        return TransformersModel(settings)
    if settings.model_backend == "http":
        return LocalHTTPModel(settings)
    raise ValueError("MODEL_BACKEND must be 'http' or 'transformers'")
