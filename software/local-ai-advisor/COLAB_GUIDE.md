# Free Google Colab LoRA Training

Use the notebook in `notebooks/colab_train_lora.ipynb` to train the SPECTRON adapter on a temporary free GPU session. Free sessions are not guaranteed, so save the exported adapter immediately when training finishes.

## Before opening Colab

1. Build at least 2,000 expert-reviewed, anonymized scenarios across chilli, maize, paddy/rice, potato, and tomato. Cover each supported growth stage and problem family. The two example rows are format examples only and must not be used to claim model quality.
2. Save the scenarios as `expert_scenarios.jsonl`, using the format in `data/expert_scenarios.example.jsonl`.
3. In Windows Explorer, make a ZIP of `software/local-ai-advisor`. Exclude `.venv`, `models`, `artifacts`, and `data/generated` if they exist.
4. Do not include names, phone numbers, precise farm coordinates, API keys, passwords, or raw customer records in the uploaded dataset.

## In Google Colab

1. Visit <https://colab.research.google.com> and create a new notebook.
2. Upload and open `notebooks/colab_train_lora.ipynb` from this folder.
3. Choose **Runtime → Change runtime type → GPU** (or any GPU offered) and save. The notebook supports current Colab Python 3.13 runtimes.
4. Run the cells in order. The notebook asks you to upload the project ZIP and then `expert_scenarios.jsonl`.
5. At the end, download `spectron-qwen-lora-adapter.zip` immediately. Free runtimes are temporary.

If PEFT reports an incompatible `torchao` version, run `!python -m pip uninstall -y torchao` in a new cell, then rerun the training cell. `torchao` is not used by this project.

## After the notebook

1. Copy the extracted adapter to `software/local-ai-advisor/models/qwen-agriassist-lora`.
2. Evaluate it on a separate, expert-reviewed held-out set before enabling it.
3. Train the confidence calibrator with actual reviewed outcomes.
4. Only then configure `LOCAL_ADVISOR_URL` on the backend for shadow testing. Keep Groq as fallback until safety and accuracy checks pass.
