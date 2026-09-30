"use client";

import { Fragment, useState } from "react";
import { Check, ChevronDown, Minus, X } from "lucide-react";
import { CHECK_LABEL, JUDGE_LABEL } from "@/lib/evals";
import type { EvalRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

function judgeScores(record: EvalRecord): Record<string, { score: number; rationale: string }> | null {
  const judge = record.judge;
  if (!judge || "error" in judge) return null;
  return judge as Record<string, { score: number; rationale: string }>;
}

function judgeMean(record: EvalRecord): number | null {
  const scores = judgeScores(record);
  const values = scores ? Object.values(scores).map((s) => s.score) : [];
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function PassIcon({ passed }: { passed: boolean | null }) {
  if (passed === null) return <Minus className="h-4 w-4 text-ink-muted" aria-label="Not applicable" />;
  return passed ? <Check className="h-4 w-4 text-teal" aria-label="Passed" /> : <X className="h-4 w-4 text-terracotta" aria-label="Failed" />;
}

/** One row per trip case; expand a row for failed checks and the judge's reasons. */
export default function CaseTable({ records }: { records: EvalRecord[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-ink text-left text-xs uppercase tracking-eyebrow text-ink-muted">
            <th className="py-2 font-medium">Case</th>
            <th className="py-2 font-medium">Result</th>
            <th className="py-2 text-right font-medium">Editor</th>
            <th className="py-2 text-right font-medium">Checks</th>
            <th className="py-2 text-right font-medium">Judge</th>
            <th className="py-2 text-right font-medium">Time</th>
            <th className="py-2 text-right font-medium">Tokens</th>
            <th className="py-2" aria-label="Details" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const checks = r.checks ?? [];
            const applicable = checks.filter((c) => c.passed !== null);
            const passed = applicable.filter((c) => c.passed).length;
            const failed = checks.filter((c) => c.passed === false);
            const judge = judgeMean(r);
            const expanded = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr className={cn("border-b border-rule align-top", expanded && "border-b-0")}>
                  <td className="py-3 pr-3 font-medium text-ink">{r.id}</td>
                  <td className="py-3 pr-3">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-ink-soft">
                        <Check className="h-4 w-4 text-teal" aria-hidden />
                        {r.validator_status ?? "Done"}
                        {r.revisions ? <span className="text-ink-muted"> · revised</span> : null}
                        {r.partial ? <span className="text-ink-muted"> · partial</span> : null}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-terracotta">
                        <X className="h-4 w-4" aria-hidden /> Failed
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right tabular-nums text-ink">{r.validator_score ?? "—"}</td>
                  <td className={cn("py-3 text-right tabular-nums", failed.length ? "text-terracotta" : "text-ink")}>
                    {r.ok ? `${passed}/${applicable.length}` : "—"}
                  </td>
                  <td className="py-3 text-right tabular-nums text-ink">{judge === null ? "—" : judge.toFixed(1)}</td>
                  <td className="py-3 text-right tabular-nums text-ink-soft">{r.latency_s}s</td>
                  <td className="py-3 text-right tabular-nums text-ink-soft">{r.tokens?.toLocaleString("en-US") ?? "—"}</td>
                  <td className="py-3 pl-2 text-right">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : r.id)}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} details for ${r.id}`}
                      className="rounded p-1 text-ink-muted hover:text-ink"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-rule">
                    <td colSpan={8} className="pb-5">
                      {!r.ok ? (
                        <p className="text-sm text-terracotta">{r.error}</p>
                      ) : (
                        <div className="grid gap-6 bg-paper-deep p-4 md:grid-cols-2">
                          <div>
                            <p className="eyebrow text-ink-muted">Checks</p>
                            <ul className="mt-2 space-y-1.5">
                              {checks.map((c) => (
                                <li key={c.name} className="flex items-start gap-2">
                                  <PassIcon passed={c.passed} />
                                  <span className="text-ink-soft">
                                    {CHECK_LABEL[c.name] ?? c.name}
                                    {c.detail && <span className="block text-xs text-ink-muted">{c.detail}</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="eyebrow text-ink-muted">Judge</p>
                            {judgeScores(r) ? (
                              <dl className="mt-2 space-y-2">
                                {Object.entries(judgeScores(r)!).map(([k, v]) => (
                                  <div key={k}>
                                    <dt className="flex items-baseline justify-between text-ink">
                                      {JUDGE_LABEL[k] ?? k} <span className="tabular-nums">{v.score}/5</span>
                                    </dt>
                                    <dd className="text-xs text-ink-muted">{v.rationale}</dd>
                                  </div>
                                ))}
                              </dl>
                            ) : (
                              <p className="mt-2 text-sm text-ink-muted">
                                {r.judge && "error" in r.judge ? `Judge failed: ${r.judge.error}` : "Not judged in this run."}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
