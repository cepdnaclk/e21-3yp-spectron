# SPECTRON Local AI Advisor

This project trains and serves a small local agricultural language model for the five currently supported crops: chilli, maize, paddy/rice, potato, and tomato.

The model does not memorize the crop manuals. At request time the service retrieves the most relevant approved crop guidance and combines it with the farmer observation, growth stage, recent sensor summary, and weather. LoRA training teaches the model how to reason over that evidence and return the application's structured response.

## Current status

- Local recommendation API and crop-aware retrieval are implemented.
- Qwen2.5 1.5B can run through a local OpenAI-compatible server or directly with Transformers.
- LoRA dataset preparation and training are implemented.
- Confidence-calibrator training is implemented.
- The existing crop corpus contains only 30 entries, including 8 stage-specific entries. It is enough to test retrieval, but not enough to claim production agricultural accuracy.

## API input

`POST /v1/recommendations`

```json
{
  "crop": "Tomato",
  "growth_stage": "Fruiting",
  "farmer_observation": "Dark circular spots are spreading on older lower leaves.",
  "sensor_summary": "humidity: latest 89 %RH; 24-hour average 86 %RH",
  "weather_summary": "Recent rain; current humidity 91 percent",
  "conversation_history": []
}
```

The response includes structured actions, evidence, sources, a `confidence` label, and `confidence_details`. Until a calibrator has been trained from reviewed outcomes, `confidence_details.calibrated` is `false`; the service will not pretend that a heuristic score is statistically calibrated.

The Go backend can use this service by setting `LOCAL_ADVISOR_URL=http://<advisor-host>:8091`. When configured, local inference is attempted first and Groq remains a temporary fallback while the local model is evaluated.

## Set up

Python 3.10–3.13 is supported.

```powershell
cd software/local-ai-advisor
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
Copy-Item .env.example .env
python -m pytest
python -m spectron_local_ai.service
```

By default the service expects a local model server at `http://127.0.0.1:8081/v1`. Any local OpenAI-compatible server can be used. Set `MODEL_BACKEND=transformers` and install `.[inference]` to load the Hugging Face model in this service instead.

Build the service container from the repository root so the approved crop corpus is included:

```powershell
docker build -f software/local-ai-advisor/Dockerfile -t spectron-local-ai-advisor .
```

## Prepare reviewed training data

Copy `data/expert_scenarios.example.jsonl` to the ignored file `data/expert_scenarios.jsonl`. Add expert-reviewed scenarios, then build deterministic train/validation files:

```powershell
python training/build_dataset.py --source data/expert_scenarios.jsonl --output data/generated --seed 42
```

Do not train on farm records that also appear in validation or testing. Split by problem family or field, not by nearly identical wording.

## Train the LoRA adapter

```powershell
python -m pip install -e ".[training]"
python training/train_lora.py --train data/generated/train.jsonl --validation data/generated/validation.jsonl --output models/qwen-agriassist-lora
```

Training on a CUDA machine is strongly recommended. The adapter changes response behaviour and format; approved crop facts remain in retrieval so they can be corrected without retraining.

## Train confidence calibration

After agricultural reviewers label recommendations as correct/unsafe/incomplete, export feature rows following `data/confidence_labels.example.jsonl`, then run:

```powershell
python training/train_confidence.py --input data/confidence_labels.jsonl --output artifacts/confidence_calibrator.joblib
```

Use a held-out evaluation set to choose the product thresholds for **High**, **Medium**, **Low**, and **Needs expert review**. Never use the language model's written confidence as the application confidence.

## Production gate

Before replacing Groq, require all of the following:

1. At least 2,000 reviewed scenarios covering all five crops and stages.
2. Separate held-out farms/problem families for evaluation.
3. Agricultural review of pesticide, fertilizer, irrigation, and disease advice.
4. Measured calibration error, unsafe-advice rate, abstention accuracy, and per-crop recall.
5. A shadow comparison against the existing hosted advisor before enabling farmer-facing output.
