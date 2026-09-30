"""Read-only access to evaluation runs (`evals/results/*.json`) for the dashboard.

Runs are written by `python -m evals.run_evals`; nothing here calls an LLM.
"""

import json
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from evals.run_evals import RESULTS_DIR
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/evals")

RUN_ID = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
MAX_RUNS = 100


def _read(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        logger.warning("Skipping unreadable eval results %s: %s", path.name, exc)
        return None
    return data if isinstance(data, dict) and "summary" in data else None


@router.get("")
async def list_runs() -> list[dict[str, Any]]:
    """Every saved run, newest first, without per-case records."""
    runs = []
    # File names start with a UTC timestamp, so name order is time order.
    for path in sorted(RESULTS_DIR.glob("*.json"), key=lambda p: p.name, reverse=True)[:MAX_RUNS]:
        data = _read(path)
        if data is not None:
            runs.append({"id": path.stem, "meta": data.get("meta", {}), "summary": data["summary"]})
    return runs


@router.get("/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    path = RESULTS_DIR / f"{run_id}.json"
    data = _read(path) if RUN_ID.match(run_id) and path.is_file() else None
    if data is None:
        raise HTTPException(404, "Evaluation run not found")
    return {"id": run_id, **data}
