import json

import pytest

from config import Settings
from evals.checks import run_checks
from evals.judge import Criterion, JudgeDraft, judge_plan
from evals.run_evals import build_request, compare, format_report, load_cases, parse_args, record_for, summarize
from orchestrator import create_plan
from tests.conftest import itinerary_draft, make_request


def _checks(plan) -> dict[str, bool | None]:
    return {c.name: c.passed for c in run_checks(plan)}


def _judge(score: int) -> JudgeDraft:
    c = Criterion(score=score, rationale="Fine.")
    return JudgeDraft(realism=c, personalization=c, logistics=c, clarity=c)


async def test_good_plan_passes_all_checks(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)
    assert all(passed for passed in _checks(plan).values())


async def test_checks_catch_bad_plans(make_ctx):
    request = make_request(budget=2000)
    draft = itinerary_draft(3)
    draft.days[1].slots = []
    draft.days[2].slots[0].activity = "Museum 1"  # same as day 1
    for day in draft.days:
        for slot in day.slots:
            slot.lat, slot.lng = 0.0, 0.0
    ctx, _ = make_ctx(request, ItineraryDraft=draft)
    plan = await create_plan(ctx, request)

    results = _checks(plan)
    assert results["no_empty_days"] is False
    assert results["pace_respected"] is False  # a day with 0 slots
    assert results["no_repeated_activities"] is False
    assert results["budget_respected"] is False
    assert results["coordinates_present"] is False
    assert results["covers_all_days"] is True


async def test_missing_sections_are_not_applicable(make_ctx):
    request = make_request(origin=None)
    ctx, _ = make_ctx(request, ResearchDraft=RuntimeError("down"), BookingDraft=RuntimeError("down"))
    plan = await create_plan(ctx, request)
    results = _checks(plan)
    assert results["grounded_sources"] is None
    assert results["flights_only_with_origin"] is None


async def test_judge_clamps_scores(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)
    ctx, generator = make_ctx(request, JudgeDraft=_judge(9))
    result = await judge_plan(ctx, plan)
    assert result["realism"] == {"score": 5, "rationale": "Fine."}
    assert generator.calls[0][0] == "judge_agent"
    assert "Day 1" in generator.calls[0][1]


def test_all_cases_build_valid_requests():
    cases = load_cases()
    assert len(cases) == 15
    assert len({c["id"] for c in cases}) == 15
    requests = [build_request(c) for c in cases]
    assert any(r.days == 1 for r in requests)
    assert any(r.origin is None for r in requests)
    assert {r.preferences.pace for r in requests} == {"relaxed", "moderate", "fast"}
    assert load_cases(ids=["kyoto-day-trip"])[0]["days"] == 1
    assert len(load_cases(limit=2)) == 2
    with pytest.raises(SystemExit):
        load_cases(ids=["nope"])


async def test_summary_report_and_compare(make_ctx):
    request = make_request()
    ctx, _ = make_ctx(request)
    plan = await create_plan(ctx, request)
    ctx, _ = make_ctx(request, JudgeDraft=_judge(4))
    judged = record_for("a", plan, 12.0, await judge_plan(ctx, plan))
    unjudged = record_for("b", plan, 8.0, None)
    failed = {"id": "c", "ok": False, "error": "PlanningError: boom", "latency_s": 3.0}

    summary = summarize([judged, unjudged, failed])
    assert summary["success_rate"] == round(2 / 3, 3)
    assert summary["check_pass_rate"] == 1.0
    assert summary["judge"]["realism"] == 4
    assert summary["mean_latency_s"] == 10.0
    assert summary["mean_tokens"] == judged["tokens"] > 0
    json.dumps(summary)  # must be serialisable for the results file

    report = format_report([judged, unjudged, failed], summary)
    assert "| a | ✅ |" in report and "| c | ❌ |" in report

    baseline = {**summary, "mean_validator_score": summary["mean_validator_score"] - 10, "success_rate": 1.0}
    table = compare(summary, baseline)
    assert "+10.00" in table
    assert "-33 pts" in table


def test_cli_defaults():
    args = parse_args([])
    assert args.delay == 5.0 and not args.no_revision and not args.no_judge
    args = parse_args(["--limit", "2", "--no-revision", "--cases", "a,b"])
    assert args.limit == 2 and args.no_revision and args.cases == "a,b"


@pytest.mark.parametrize(
    "raw, expected",
    [
        ('["https://a.vercel.app/", "http://localhost:3000"]', ["https://a.vercel.app", "http://localhost:3000"]),
        ("https://a.vercel.app, https://b.app", ["https://a.vercel.app", "https://b.app"]),
        ("https://a.vercel.app", ["https://a.vercel.app"]),
    ],
)
def test_cors_origins_accept_json_or_csv(monkeypatch, raw, expected):
    monkeypatch.setenv("CORS_ORIGINS", raw)
    assert Settings(_env_file=None).cors_origins == expected
