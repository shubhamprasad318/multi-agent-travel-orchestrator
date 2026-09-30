// Metric definitions for the evaluation dashboard. Mirrors the summary written
// by orchestrator_backend/evals/run_evals.py (and its COMPARED list).

import type { EvalRun, EvalRunSummary, EvalSummary } from "@/lib/types";

export type MetricKey = keyof Pick<
  EvalSummary,
  | "check_pass_rate"
  | "mean_validator_score"
  | "mean_judge_score"
  | "success_rate"
  | "approved_rate"
  | "revised_rate"
  | "mean_latency_s"
  | "mean_tokens"
  | "mean_llm_calls"
>;

export interface Metric {
  key: MetricKey;
  label: string;
  /** Whether a higher value is better; null when neither direction is "good". */
  higherIsBetter: boolean | null;
  format: (value: number) => string;
  /** How a difference between two runs reads, e.g. "+4 pts", "-1.2 s". */
  formatDelta: (diff: number) => string;
  /** Fixed axis range when the metric has one (rates, scores). */
  domain?: [number, number];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pts = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d * 100))} pts`;
const signed = (d: number, digits: number, unit = "") => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)}${unit}`;
const compact = (v: number) => (v >= 10_000 ? `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}K` : Math.round(v).toLocaleString("en-US"));

export const METRICS: Record<MetricKey, Metric> = {
  check_pass_rate: { key: "check_pass_rate", label: "Checks passed", higherIsBetter: true, format: pct, formatDelta: pts, domain: [0, 1] },
  mean_validator_score: {
    key: "mean_validator_score",
    label: "Editor score",
    higherIsBetter: true,
    format: (v) => v.toFixed(1),
    formatDelta: (d) => signed(d, 1),
    domain: [0, 100],
  },
  mean_judge_score: {
    key: "mean_judge_score",
    label: "Judge score",
    higherIsBetter: true,
    format: (v) => `${v.toFixed(2)} / 5`,
    formatDelta: (d) => signed(d, 2),
    domain: [1, 5],
  },
  success_rate: { key: "success_rate", label: "Plans completed", higherIsBetter: true, format: pct, formatDelta: pts, domain: [0, 1] },
  approved_rate: { key: "approved_rate", label: "Approved first time", higherIsBetter: true, format: pct, formatDelta: pts, domain: [0, 1] },
  // A revision means the first draft scored low; more isn't clearly better or worse.
  revised_rate: { key: "revised_rate", label: "Sent back for revision", higherIsBetter: null, format: pct, formatDelta: pts, domain: [0, 1] },
  mean_latency_s: { key: "mean_latency_s", label: "Time per plan", higherIsBetter: false, format: (v) => `${v.toFixed(1)} s`, formatDelta: (d) => signed(d, 1, " s") },
  mean_tokens: { key: "mean_tokens", label: "Tokens per plan", higherIsBetter: false, format: compact, formatDelta: (d) => `${d >= 0 ? "+" : "−"}${compact(Math.abs(d))}` },
  mean_llm_calls: { key: "mean_llm_calls", label: "LLM calls per plan", higherIsBetter: false, format: (v) => v.toFixed(1), formatDelta: (d) => signed(d, 1) },
};

/** Stat tiles, in reading order. */
export const HEADLINE: MetricKey[] = ["check_pass_rate", "mean_validator_score", "mean_judge_score", "success_rate", "mean_latency_s", "mean_tokens"];

/** Rows of the run-vs-baseline table (run_evals.py's COMPARED, plus LLM calls). */
export const COMPARED: MetricKey[] = [
  "success_rate",
  "check_pass_rate",
  "mean_validator_score",
  "approved_rate",
  "revised_rate",
  "mean_judge_score",
  "mean_latency_s",
  "mean_tokens",
  "mean_llm_calls",
];

/** Plain-language names for the deterministic checks in evals/checks.py. */
export const CHECK_LABEL: Record<string, string> = {
  covers_all_days: "Every day is planned",
  dates_consecutive: "Dates run in order",
  no_empty_days: "No empty days",
  pace_respected: "Stops per day fit the pace",
  meals_present: "Meals are planned",
  budget_respected: "Not over budget",
  no_repeated_activities: "No activity repeated",
  coordinates_present: "Stops are on the map",
  cities_follow_route: "Multi-city route followed",
  flights_only_with_origin: "Flights only with a home city",
  grounded_sources: "Research cites sources",
};

export const JUDGE_LABEL: Record<string, string> = {
  realism: "Realism",
  personalization: "Personalization",
  logistics: "Logistics",
  clarity: "Clarity",
};

export type Direction = "better" | "worse" | "same" | "neutral";

export function direction(metric: Metric, diff: number): Direction {
  if (Math.abs(diff) < 1e-9) return "same";
  if (metric.higherIsBetter === null) return "neutral";
  return diff > 0 === metric.higherIsBetter ? "better" : "worse";
}

/** Run ids and `meta.created_at` are UTC stamps like 20260930T141503Z. */
export function runDate(run: EvalRunSummary): Date | null {
  const stamp = run.meta.created_at ?? run.id;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(stamp);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

export function runLabel(run: EvalRunSummary, withTime = false): string {
  const date = runDate(run);
  if (!date) return run.id;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

/** True for ablation runs made with --no-revision. */
export const isAblation = (run: EvalRunSummary) => run.meta.revision_enabled === false;

/** Oldest first, for trends. */
export function chronological<T extends EvalRunSummary>(runs: T[]): T[] {
  return [...runs].sort((a, b) => (runDate(a)?.getTime() ?? 0) - (runDate(b)?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

/** A results file picked from disk. Throws a readable error if it isn't one. */
export function parseRunFile(name: string, text: string): EvalRun {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${name} isn't valid JSON.`);
  }
  const run = data as Partial<EvalRun>;
  if (!run || typeof run !== "object" || !run.summary || !Array.isArray(run.records)) {
    throw new Error(`${name} doesn't look like an evals results file (expected "summary" and "records").`);
  }
  return { id: name.replace(/\.json$/i, ""), meta: run.meta ?? {}, summary: run.summary, records: run.records };
}
