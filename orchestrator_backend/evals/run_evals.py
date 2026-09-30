"""Run the planner on a fixed set of trips and score the results.

    cd orchestrator_backend
    python -m evals.run_evals --limit 3                 # quick smoke run
    python -m evals.run_evals                           # all cases
    python -m evals.run_evals --no-revision --compare evals/results/<full-run>.json

Needs GOOGLE_API_KEY. Cases run one at a time with a delay between them to
stay within free-tier rate limits (a full run is ~15 plans, ~120 Gemini calls).
"""

import argparse
import asyncio
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from agents.base import AgentContext, gemini_generator
from config import VALIDATION_CONFIG, get_settings
from evals.checks import run_checks
from evals.judge import RUBRIC, judge_plan
from orchestrator import create_plan
from schemas import TravelPlan, TravelRequest
from utils.store import MemoryStore

EVALS_DIR = Path(__file__).parent
CASES_PATH = EVALS_DIR / "cases.json"
RESULTS_DIR = EVALS_DIR / "results"


def load_cases(path: Path = CASES_PATH, ids: list[str] | None = None, limit: int | None = None) -> list[dict]:
    cases = json.loads(path.read_text(encoding="utf-8"))
    if ids:
        unknown = set(ids) - {c["id"] for c in cases}
        if unknown:
            raise SystemExit(f"Unknown case id(s): {', '.join(sorted(unknown))}")
        cases = [c for c in cases if c["id"] in ids]
    return cases[:limit] if limit else cases


def build_request(case: dict, today: date | None = None) -> TravelRequest:
    start = (today or date.today()) + timedelta(days=case["start_offset_days"])
    return TravelRequest(
        destination=case["destination"],
        stops=case.get("stops", []),
        origin=case.get("origin"),
        start_date=start,
        end_date=start + timedelta(days=case["days"] - 1),
        budget=case["budget"],
        travelers=case["travelers"],
        preferences=case["preferences"],
    )


def record_for(case_id: str, plan: TravelPlan, latency_s: float, judge: dict | None) -> dict[str, Any]:
    return {
        "id": case_id,
        "ok": True,
        "error": None,
        "latency_s": round(latency_s, 1),
        "tokens": sum(s.input_tokens + s.output_tokens for s in plan.trace),
        "llm_calls": sum(s.llm_calls for s in plan.trace),
        "validator_score": plan.validation.overall_score if plan.validation else None,
        "validator_status": plan.validation.status if plan.validation else None,
        "revisions": plan.validation.revisions if plan.validation else 0,
        "budget_status": plan.budget.status,
        "partial": plan.status == "partial",
        "checks": [c.to_dict() for c in run_checks(plan)],
        "judge": judge,
    }


async def run_case(ctx: AgentContext, case: dict, use_judge: bool) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        plan = await create_plan(ctx, build_request(case))
    except Exception as exc:  # noqa: BLE001 - a failed case is a result, not a crash
        return {"id": case["id"], "ok": False, "error": f"{type(exc).__name__}: {exc}", "latency_s": round(time.perf_counter() - started, 1)}
    latency = time.perf_counter() - started
    judge = None
    if use_judge:
        try:
            judge = await judge_plan(ctx, plan)
        except Exception as exc:  # noqa: BLE001
            judge = {"error": f"{type(exc).__name__}: {exc}"}
    return record_for(case["id"], plan, latency, judge)


def _mean(values: list[float]) -> float | None:
    return round(mean(values), 2) if values else None


def summarize(records: list[dict]) -> dict[str, Any]:
    ok = [r for r in records if r.get("ok")]
    check_names = [c["name"] for c in ok[0]["checks"]] if ok else []
    check_rates: dict[str, float | None] = {}
    applicable_total = passed_total = 0
    for name in check_names:
        results = [c["passed"] for r in ok for c in r["checks"] if c["name"] == name and c["passed"] is not None]
        check_rates[name] = round(sum(results) / len(results), 3) if results else None
        applicable_total += len(results)
        passed_total += sum(results)

    judged = [r["judge"] for r in ok if r.get("judge") and "error" not in r["judge"]]
    judge_means = {k: _mean([j[k]["score"] for j in judged]) for k in RUBRIC} if judged else {}
    scores = [r["validator_score"] for r in ok if r.get("validator_score") is not None]

    return {
        "cases": len(records),
        "success_rate": round(len(ok) / len(records), 3) if records else None,
        "check_pass_rate": round(passed_total / applicable_total, 3) if applicable_total else None,
        "checks": check_rates,
        "mean_validator_score": _mean(scores),
        "approved_rate": round(sum(r.get("validator_status") == "Approved" for r in ok) / len(ok), 3) if ok else None,
        "revised_rate": round(sum(r.get("revisions", 0) > 0 for r in ok) / len(ok), 3) if ok else None,
        "judge": judge_means,
        "mean_judge_score": _mean([v for v in judge_means.values() if v is not None]),
        "mean_latency_s": _mean([r["latency_s"] for r in ok]),
        "mean_tokens": _mean([r["tokens"] for r in ok]),
        "mean_llm_calls": _mean([r["llm_calls"] for r in ok]),
    }


def _fmt(value: Any, pct: bool = False) -> str:
    if value is None:
        return "—"
    if pct:
        return f"{value * 100:.0f}%"
    return f"{value:,.1f}" if isinstance(value, float) else str(value)


def format_report(records: list[dict], summary: dict[str, Any]) -> str:
    lines = [
        "| Case | OK | Score | Status | Rev | Checks | Judge | Latency | Tokens |",
        "|------|----|-------|--------|-----|--------|-------|---------|--------|",
    ]
    for r in records:
        if not r.get("ok"):
            lines.append(f"| {r['id']} | ❌ | — | {r.get('error', '')[:60]} | — | — | — | {r['latency_s']}s | — |")
            continue
        applicable = [c for c in r["checks"] if c["passed"] is not None]
        passed = sum(c["passed"] for c in applicable)
        judge = r.get("judge") or {}
        judge_avg = _mean([judge[k]["score"] for k in RUBRIC if k in judge]) if "error" not in judge else None
        lines.append(
            f"| {r['id']} | ✅ | {_fmt(r['validator_score'])} | {r['validator_status'] or '—'} | {r['revisions']} "
            f"| {passed}/{len(applicable)} | {_fmt(judge_avg)} | {r['latency_s']}s | {r['tokens']:,} |"
        )

    lines += [
        "",
        f"- Success rate: {_fmt(summary['success_rate'], pct=True)} of {summary['cases']} cases",
        f"- Deterministic checks passed: {_fmt(summary['check_pass_rate'], pct=True)}",
        f"- Mean validator score: {_fmt(summary['mean_validator_score'])} (approved {_fmt(summary['approved_rate'], pct=True)}, "
        f"revised {_fmt(summary['revised_rate'], pct=True)})",
        f"- Mean judge score (1-5): {_fmt(summary['mean_judge_score'])} "
        + ", ".join(f"{k} {_fmt(v)}" for k, v in summary["judge"].items()),
        f"- Mean latency: {_fmt(summary['mean_latency_s'])}s; mean tokens: {_fmt(summary['mean_tokens'])}; "
        f"mean LLM calls: {_fmt(summary['mean_llm_calls'])}",
        "",
        "| Check | Pass rate |",
        "|-------|-----------|",
        *[f"| {name} | {_fmt(rate, pct=True)} |" for name, rate in summary["checks"].items()],
    ]
    return "\n".join(lines)


COMPARED = [
    ("success_rate", True),
    ("check_pass_rate", True),
    ("mean_validator_score", False),
    ("approved_rate", True),
    ("revised_rate", True),
    ("mean_judge_score", False),
    ("mean_latency_s", False),
    ("mean_tokens", False),
]


def compare(current: dict[str, Any], baseline: dict[str, Any], labels: tuple[str, str] = ("this run", "baseline")) -> str:
    lines = [f"| Metric | {labels[0]} | {labels[1]} | Δ |", "|--------|------|------|---|"]
    for key, pct in COMPARED:
        a, b = current.get(key), baseline.get(key)
        if a is None or b is None:
            delta = "—"
        else:
            diff = a - b
            delta = f"{diff * 100:+.0f} pts" if pct else f"{diff:+,.2f}"
        lines.append(f"| {key} | {_fmt(a, pct)} | {_fmt(b, pct)} | {delta} |")
    return "\n".join(lines)


async def run(args: argparse.Namespace) -> Path:
    settings = get_settings()
    if not settings.has_llm:
        print("GOOGLE_API_KEY is not set (put it in orchestrator_backend/.env).", file=sys.stderr)
        raise SystemExit(2)
    if args.no_revision:
        VALIDATION_CONFIG["max_revisions"] = 0

    cases = load_cases(ids=args.cases.split(",") if args.cases else None, limit=args.limit)
    generate = gemini_generator(settings)
    records = []
    for i, case in enumerate(cases, 1):
        print(f"[{i}/{len(cases)}] {case['id']} …", flush=True)
        ctx = AgentContext(settings=settings, store=MemoryStore(), generate=generate)
        record = await run_case(ctx, case, use_judge=not args.no_judge)
        status = f"score {record.get('validator_score')}" if record["ok"] else f"FAILED: {record['error']}"
        print(f"    {status} in {record['latency_s']}s", flush=True)
        records.append(record)
        if i < len(cases) and args.delay > 0:
            await asyncio.sleep(args.delay)

    summary = summarize(records)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = Path(args.out) if args.out else RESULTS_DIR / f"{stamp}{'-norevision' if args.no_revision else ''}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "meta": {
                    "created_at": stamp,
                    "model": settings.gemini_model,
                    "grounding": settings.enable_grounding,
                    "revision_enabled": not args.no_revision,
                    "judge": not args.no_judge,
                },
                "summary": summary,
                "records": records,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print("\n" + format_report(records, summary))
    if args.compare:
        baseline = json.loads(Path(args.compare).read_text(encoding="utf-8"))
        print(f"\nComparison with {args.compare}:\n")
        print(compare(summary, baseline["summary"]))
    print(f"\nSaved {out}")
    return out


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate the travel planner on fixed trip cases.")
    parser.add_argument("--limit", type=int, help="run only the first N cases")
    parser.add_argument("--cases", help="comma-separated case ids")
    parser.add_argument("--no-revision", action="store_true", help="ablation: disable the validator's revision loop")
    parser.add_argument("--no-judge", action="store_true", help="skip the LLM-as-judge scoring")
    parser.add_argument("--delay", type=float, default=5.0, help="seconds to wait between cases (default 5)")
    parser.add_argument("--out", help="results file path")
    parser.add_argument("--compare", help="another results file to compare against")
    return parser.parse_args(argv)


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
