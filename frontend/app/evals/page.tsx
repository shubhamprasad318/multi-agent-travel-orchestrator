"use client";

import { useEffect, useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import CaseTable from "@/components/evals/CaseTable";
import { CheckMeters, Delta, StatTile, TrendChart } from "@/components/evals/EvalCharts";
import { getEvalRun, listEvalRuns } from "@/lib/api";
import { COMPARED, HEADLINE, METRICS, chronological, isAblation, parseRunFile, runLabel, type MetricKey } from "@/lib/evals";
import type { EvalRun, EvalRunSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const TREND_METRICS: MetricKey[] = ["check_pass_rate", "mean_validator_score", "mean_judge_score", "mean_latency_s", "mean_tokens"];

/**
 * Quality over time: every `python -m evals.run_evals` run, read from the
 * backend's evals/results folder, or from results files opened here (they are
 * read in the browser and never uploaded).
 */
export default function EvalsPage() {
  const [serverRuns, setServerRuns] = useState<EvalRunSummary[] | null>(null);
  const [fileRuns, setFileRuns] = useState<EvalRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, EvalRun>>({});
  const [trendMetric, setTrendMetric] = useState<MetricKey>("check_pass_rate");

  useEffect(() => {
    const controller = new AbortController();
    listEvalRuns(controller.signal)
      .then(setServerRuns)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setServerRuns([]);
        setLoadError(err instanceof Error ? err.message : "Couldn't load evaluation runs.");
      });
    return () => controller.abort();
  }, []);

  const runs = useMemo(() => {
    const byId = new Map<string, EvalRunSummary>();
    for (const run of [...(serverRuns ?? []), ...fileRuns]) byId.set(run.id, run);
    return chronological([...byId.values()]);
  }, [serverRuns, fileRuns]);

  const newestFirst = useMemo(() => [...runs].reverse(), [runs]);
  const selected = runs.find((r) => r.id === selectedId) ?? runs[runs.length - 1] ?? null;
  const selectedIndex = selected ? runs.indexOf(selected) : -1;
  const baseline =
    runs.find((r) => r.id === baselineId && r.id !== selected?.id) ?? (selectedIndex > 0 ? runs[selectedIndex - 1] : null);

  // Per-case records: from the opened file, or fetched once per run.
  const detail = selected ? (details[selected.id] ?? fileRuns.find((r) => r.id === selected.id) ?? null) : null;
  useEffect(() => {
    if (!selected || detail) return;
    const controller = new AbortController();
    getEvalRun(selected.id, controller.signal)
      .then((run) => setDetails((prev) => ({ ...prev, [run.id]: run })))
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected, detail]);

  const openFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setFileError(null);
    const opened: EvalRun[] = [];
    for (const file of Array.from(files)) {
      try {
        opened.push(parseRunFile(file.name, await file.text()));
      } catch (err) {
        setFileError(err instanceof Error ? err.message : `Couldn't read ${file.name}.`);
      }
    }
    if (opened.length) {
      setFileRuns((prev) => [...prev.filter((r) => !opened.some((o) => o.id === r.id)), ...opened]);
      setSelectedId(chronological(opened).at(-1)!.id);
      setBaselineId(null);
    }
  };

  const fileButton = (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink focus-within:ring-2 focus-within:ring-terracotta">
      <FileUp className="h-4 w-4" aria-hidden /> Open results files
      <input type="file" accept="application/json,.json" multiple className="sr-only" onChange={(e) => openFiles(e.target.files)} />
    </label>
  );

  return (
    <div className="container py-12 pb-24 md:py-16">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
        <div className="max-w-2xl">
          <p className="eyebrow">Behind the scenes</p>
          <h1 className="mt-3 text-5xl text-ink md:text-6xl">Quality evaluations</h1>
          <p className="mt-3 text-ink-soft">
            The planner runs on a fixed set of trips, then each plan is scored by deterministic checks, an independent LLM judge and its
            own editor. This page tracks those runs over time.
          </p>
        </div>
        {fileButton}
      </header>
      {fileError && (
        <p role="alert" className="mt-4 text-sm text-terracotta">
          {fileError}
        </p>
      )}

      {serverRuns === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-terracotta" aria-label="Loading runs" />
        </div>
      ) : runs.length === 0 || !selected ? (
        <EmptyRuns error={loadError} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-rule py-5">
            <RunSelect label="Run" runs={newestFirst} value={selected.id} onChange={(id) => { setSelectedId(id); setBaselineId(null); }} />
            <RunSelect
              label="Compare with"
              runs={newestFirst.filter((r) => r.id !== selected.id)}
              value={baseline?.id ?? ""}
              onChange={setBaselineId}
              empty="No other run"
            />
            <p className="text-sm text-ink-muted">
              {[selected.meta.model, selected.summary.cases ? `${selected.summary.cases} trips` : null, selected.meta.judge === false ? "no judge" : null]
                .filter(Boolean)
                .join(" · ")}
              {isAblation(selected) && <span className="ml-2 rounded-full bg-ochre-light px-2 py-0.5 text-xs text-ink">Revision loop off</span>}
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-3 xl:grid-cols-6">
            {HEADLINE.map((key) => (
              <StatTile
                key={key}
                metric={key}
                value={selected.summary[key]}
                baseline={baseline?.summary[key] ?? null}
                baselineLabel={baseline ? runLabel(baseline) : null}
                history={runs.slice(0, selectedIndex + 1).map((r) => r.summary[key])}
              />
            ))}
          </dl>

          <section className="mt-16" aria-labelledby="trend-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 id="trend-heading" className="text-3xl text-ink">
                Over time
              </h2>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Metric">
                {TREND_METRICS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={trendMetric === key}
                    onClick={() => setTrendMetric(key)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      trendMetric === key ? "bg-ink text-paper" : "text-ink-soft hover:bg-rule/60"
                    )}
                  >
                    {METRICS[key].label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {METRICS[trendMetric].label} for each run. Click a point to open that run; hollow points had the revision loop turned off.
            </p>
            <div className="mt-6">
              <TrendChart runs={runs} metric={trendMetric} selectedId={selected.id} onSelect={(id) => { setSelectedId(id); setBaselineId(null); }} />
            </div>
          </section>

          <div className="mt-16 grid gap-16 lg:grid-cols-2">
            <section aria-labelledby="checks-heading">
              <h2 id="checks-heading" className="text-3xl text-ink">
                Checks
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Share of trips passing each rule{baseline ? "; the gray tick is the comparison run" : ""}. Checks that don&apos;t apply to a
                trip are left out.
              </p>
              <div className="mt-6">
                <CheckMeters checks={selected.summary.checks} baseline={baseline?.summary.checks ?? null} />
              </div>
            </section>

            <section aria-labelledby="compare-heading">
              <h2 id="compare-heading" className="text-3xl text-ink">
                {baseline ? "Against the comparison run" : "Summary"}
              </h2>
              <table className="mt-6 w-full text-sm">
                <thead>
                  <tr className="border-b border-ink text-left text-xs uppercase tracking-eyebrow text-ink-muted">
                    <th className="py-2 font-medium">Metric</th>
                    <th className="py-2 text-right font-medium">{runLabel(selected)}</th>
                    {baseline && <th className="py-2 text-right font-medium">{runLabel(baseline)}</th>}
                    {baseline && <th className="py-2 text-right font-medium">Change</th>}
                  </tr>
                </thead>
                <tbody>
                  {COMPARED.map((key) => {
                    const m = METRICS[key];
                    const a = selected.summary[key];
                    const b = baseline?.summary[key] ?? null;
                    return (
                      <tr key={key} className="border-b border-rule">
                        <td className="py-2.5 text-ink">{m.label}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink">{a === null ? "—" : m.format(a)}</td>
                        {baseline && <td className="py-2.5 text-right tabular-nums text-ink-soft">{b === null ? "—" : m.format(b)}</td>}
                        {baseline && (
                          <td className="py-2.5 text-right">{a !== null && b !== null ? <Delta metric={key} diff={a - b} /> : "—"}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {Object.keys(selected.summary.judge ?? {}).length > 0 && (
                <p className="mt-4 text-sm text-ink-muted">
                  Judge by criterion:{" "}
                  {Object.entries(selected.summary.judge)
                    .map(([k, v]) => `${k} ${v === null ? "—" : v.toFixed(1)}`)
                    .join(" · ")}
                </p>
              )}
            </section>
          </div>

          <section className="mt-16" aria-labelledby="cases-heading">
            <h2 id="cases-heading" className="text-3xl text-ink">
              Trips in this run
            </h2>
            <div className="mt-6">
              {detail ? (
                <CaseTable records={detail.records} />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-ink-muted" aria-label="Loading trips" />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function RunSelect({
  label,
  runs,
  value,
  onChange,
  empty,
}: {
  label: string;
  runs: EvalRunSummary[];
  value: string;
  onChange: (id: string) => void;
  empty?: string;
}) {
  const id = `select-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="eyebrow block text-ink-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={runs.length === 0}
        className="mt-1 border-b border-ink/30 bg-transparent pb-1 pr-6 text-ink focus:border-terracotta focus:outline-none"
      >
        {runs.length === 0 && <option value="">{empty ?? "—"}</option>}
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {runLabel(run, true)}
            {isAblation(run) ? " · revision off" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyRuns({ error }: { error: string | null }) {
  return (
    <div className="mx-auto max-w-2xl py-20 text-center">
      <p className="font-serif text-2xl italic text-ink-muted">No evaluation runs yet.</p>
      <p className="mt-4 text-ink-soft">
        {error ? `The server's runs couldn't be loaded (${error}). ` : ""}
        Run the harness from the backend folder, then reload this page, or open its results files above:
      </p>
      <pre className="mt-6 overflow-x-auto bg-ink px-5 py-4 text-left text-sm text-paper">
        <code>{"cd orchestrator_backend\npython -m evals.run_evals --limit 3   # quick run\npython -m evals.run_evals             # all trips"}</code>
      </pre>
    </div>
  );
}
