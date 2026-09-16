"""Create a small deployment archive from a full Trainer output ZIP."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path


DEPLOYMENT_FILES = (
    "adapter_model.safetensors",
    "adapter_config.json",
    "chat_template.jinja",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.json",
    "merges.txt",
    "added_tokens.json",
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    with zipfile.ZipFile(args.source) as source:
        available = set(source.namelist())
        missing = [name for name in DEPLOYMENT_FILES if name not in available]
        if missing:
            raise ValueError(f"source archive is missing deployment files: {missing}")
        adapter = source.read("adapter_model.safetensors")
        config = json.loads(source.read("adapter_config.json"))
        manifest = {
            "format": "spectron-lora-adapter-v1",
            "base_model": config["base_model_name_or_path"],
            "adapter_file": "adapter_model.safetensors",
            "adapter_sha256": hashlib.sha256(adapter).hexdigest(),
            "adapter_bytes": len(adapter),
            "created_at": datetime.now(UTC).isoformat(),
            "source_archive": args.source.name,
            "included_files": list(DEPLOYMENT_FILES),
            "note": "Requires the matching base model. This package contains no farmer data or training checkpoints.",
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for name in DEPLOYMENT_FILES:
                output.writestr(name, source.read(name))
            output.writestr("SPECTRON_ADAPTER_MANIFEST.json", json.dumps(manifest, indent=2) + "\n")

    print(f"deployment archive: {args.output}")
    print(f"adapter sha256: {manifest['adapter_sha256']}")
    print(f"archive bytes: {args.output.stat().st_size}")


if __name__ == "__main__":
    main()
