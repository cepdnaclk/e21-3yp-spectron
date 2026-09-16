"""Run a minimal held-out format and grounding check for a LoRA adapter."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_OUTPUT = {
    "status", "headline", "what_may_be_happening", "do_now", "check_next",
    "why_this_advice", "avoid_for_now", "recheck_after", "get_help_if",
    "tell_us_next", "safety_note", "evidence", "confidence_label", "sources",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    args = parser.parse_args()

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(args.adapter)
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=dtype, device_map="auto")
    model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()
    model.generation_config.do_sample = False
    model.generation_config.temperature = None
    model.generation_config.top_p = None
    model.generation_config.top_k = None

    rows = [json.loads(line) for line in args.validation.read_text(encoding="utf-8").splitlines() if line.strip()]
    checked = min(args.limit, len(rows))
    valid_json = 0
    valid_schema = 0
    for row in rows[:checked]:
        messages = row["messages"][:2]
        inputs = tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_tensors="pt",
            return_dict=True,
        )
        inputs = {name: tensor.to(model.device) for name, tensor in inputs.items()}
        with torch.inference_mode():
            generated = model.generate(**inputs, max_new_tokens=900, do_sample=False)
        text = tokenizer.decode(
            generated[0, inputs["input_ids"].shape[-1] :],
            skip_special_tokens=True,
        ).strip()
        try:
            output = json.loads(text.removeprefix("```json").removesuffix("```").strip())
            valid_json += 1
            if REQUIRED_OUTPUT.issubset(output):
                valid_schema += 1
        except json.JSONDecodeError:
            pass
    print(json.dumps({
        "checked": checked,
        "valid_json": valid_json,
        "valid_schema": valid_schema,
        "json_rate": round(valid_json / checked, 3) if checked else 0,
        "schema_rate": round(valid_schema / checked, 3) if checked else 0,
        "warning": "Format success is not agricultural safety or accuracy validation.",
    }, indent=2))


if __name__ == "__main__":
    main()
