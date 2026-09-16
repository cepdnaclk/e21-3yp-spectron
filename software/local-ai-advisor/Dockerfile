FROM python:3.12-slim

WORKDIR /app
COPY software/local-ai-advisor/pyproject.toml software/local-ai-advisor/README.md ./
COPY software/local-ai-advisor/src ./src
COPY software/backend/datasets/crop-knowledge /knowledge
RUN pip install --no-cache-dir .

ENV ADVISOR_HOST=0.0.0.0 \
    ADVISOR_PORT=8091 \
    MODEL_BACKEND=http \
    KNOWLEDGE_DIR=/knowledge

EXPOSE 8091
CMD ["python", "-m", "spectron_local_ai.service"]
