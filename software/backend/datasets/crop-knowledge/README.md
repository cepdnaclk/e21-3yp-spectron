# Curated crop knowledge

This directory contains short, attributed agronomic facts for retrieval by the
AgriAssist advisor. The entries are curated summaries, not copies of source
pages. Each fact must retain its source URL and review date.

Safety rules:

- Do not add a pesticide name, product, dose, application interval, or
  pre-harvest interval to these files without a separate, current review
  against the Sri Lanka Registrar of Pesticides records.
- Prefer observation, confirmation, prevention, monitoring, and other
  reversible actions.
- A web page being publicly readable does not imply permission to reproduce it.
  Store concise factual summaries and links; review source licensing before any
  bulk import or redistribution.
- Facts from international sources are secondary to current Sri Lankan law and
  Department of Agriculture guidance.

Import one crop from `software/backend` with:

```powershell
go run .\cmd\import-crop-knowledge -crop "Tomato" -path ".\datasets\crop-knowledge\tomato" -version "2026-07-curated-v1"
```

Use the canonical crop names `Tomato`, `Potato`, `Chilli`, `Maize`, and
`Paddy / Rice`.
