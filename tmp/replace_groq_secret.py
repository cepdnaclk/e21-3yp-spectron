from pathlib import Path
import re

path = Path("software/backend/.env.example")
if path.exists():
    text = path.read_text(encoding="utf-8")
    if any(marker in text for marker in ("<<<<<<< HEAD", ">>>>>>>", "=======")):
        text = """# Backend only. Copy to .env for local development and never commit real secrets.\nDATABASE_URL=postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable\nJWT_SECRET=replace-with-a-long-random-secret\n\n# Groq Advisor\nGROQ_API_KEY=your_groq_api_key_here\nGROQ_MODEL=llama-3.3-70b-versatile\nGROQ_BASE_URL=https://api.groq.com/openai/v1\n"""
    else:
        text = re.sub(r"^GROQ_API_KEY=.*$", "GROQ_API_KEY=your_groq_api_key_here", text, flags=re.M)
    path.write_text(text, encoding="utf-8")
