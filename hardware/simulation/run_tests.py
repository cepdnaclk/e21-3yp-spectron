from __future__ import annotations

import io
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

from .spectron_sim import build_demo_network

SIMULATION_DIR = Path(__file__).resolve().parent
REPORT_PATH = SIMULATION_DIR / "results.md"

def run_demo_snapshot() -> dict[str, int]:
    network, controller, sht30, bme280 = build_demo_network()
    for node in (sht30, bme280):
        node.discover()
        node.send_reading()
    controller.configure(sht30, 10000)
    return {
        "modules": len(controller.modules),
        "readings": len(controller.readings),
        "frames": len(network.frames),
        "rejections": len(controller.rejected_frames),
    }

def write_report(result: unittest.TestResult, output: str) -> None:
    status = "PASS" if result.wasSuccessful() else "FAIL"
    snapshot = run_demo_snapshot()
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    report = f"""# SPECTRON Simulation Results

- Generated: `{generated}`
- Status: **{status}**
- Tests run: `{result.testsRun}`
- Failures: `{len(result.failures)}`
- Errors: `{len(result.errors)}`
- Skipped: `{len(result.skipped)}`

## Demo Snapshot

| Metric | Value |
| --- | ---: |
| Registered modules | {snapshot['modules']} |
| Readings received | {snapshot['readings']} |
| Frames exchanged | {snapshot['frames']} |
| Rejected frames | {snapshot['rejections']} |

## Test Output

```text
{output.rstrip()}
```
"""
    REPORT_PATH.write_text(report, encoding="utf-8")

def main() -> int:
    stream = io.StringIO()
    suite = unittest.defaultTestLoader.discover(
        str(SIMULATION_DIR),
        pattern="test_*.py",
        top_level_dir=str(SIMULATION_DIR.parent),
    )
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    output = stream.getvalue()
    sys.stdout.write(output)
    write_report(result, output)
    print(f"wrote {REPORT_PATH}")
    return 0 if result.wasSuccessful() else 1

if __name__ == "__main__":
    raise SystemExit(main())
