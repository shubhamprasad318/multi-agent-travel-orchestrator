"use client";

import { useId, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { CHECK_LABEL, METRICS, direction, isAblation, runLabel, type Direction, type MetricKey } from "@/lib/evals";
import type { EvalRunSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

// One series hue (validated against the paper surface in the budget palette),
// a lighter step of it for meter tracks, and ink-muted for de-emphasised marks.
// Teal / terracotta are reserved for better / worse and always come with an icon.
export const SERIES = "#5B45A8";
const TRACK = "#E6E0F4";
const MUTED = "#7A6F63";
const GRID = "#DDD2BF";
const SURFACE = "#F6F1E7";

const DIRECTION_STYLE: Record<Direction, { tone: string; icon: React.ReactNode; word: string }> = {
  better: { tone: "text-teal", icon: <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />, word: "better" },
  worse: { tone: "text-terracotta", icon: <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />, word: "worse" },
  same: { tone: "text-ink-muted", icon: <Minus className="h-3.5 w-3.5" aria-hidden />, word: "no change" },
  neutral: { tone: "text-ink-soft", icon: <Minus className="h-3.5 w-3.5" aria-hidden />, word: "changed" },
};

/** Signed change with an arrow and a word, so direction never relies on color. */
export function Delta({ metric, diff, className }: { metric: MetricKey; diff: number; className?: string }) {
  const m = METRICS[metric];
  const dir = direction(m, diff);
  const style = DIRECTION_STYLE[dir];
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", style.tone, className)}>
      {style.icon}
      {dir === "same" ? m.formatDelta(0).replace(/^[+−]/, "") : m.formatDelta(diff)}
      <span className="sr-only"> ({style.word})</span>
    </span>
  );
}

/** Label · value · delta vs the baseline run · sparkline over every run. */
export function StatTile({
  metric,
  value,
  baseline,
  baselineLabel,
  history,
}: {
  metric: MetricKey;
  value: number | null;
  baseline: number | null;
  baselineLabel: string | null;
  history: (number | null)[];
}) {
  const m = METRICS[metric];
  return (
    <div className="flex flex-col border-t border-ink pt-3">
      <dt className="text-sm text-ink-muted">{m.label}</dt>
      <dd className="mt-1 text-3xl font-semibold text-ink md:text-4xl">{value === null ? "—" : m.format(value)}</dd>
      <dd className="mt-1 min-h-[1.25rem] text-xs text-ink-muted">
        {value !== null && baseline !== null ? (
          <>
            <Delta metric={metric} diff={value - baseline} /> vs {baselineLabel}
          </>
        ) : (
          "No earlier run to compare"
        )}
      </dd>
      <dd className="mt-3" aria-hidden>
        <Sparkline values={history} />
      </dd>
    </div>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.slice(-12);
  const known = points.filter((v): v is number => v !== null);
  if (known.length < 2) return <div className="h-8" />;
  const width = 120;
  const height = 32;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const x = (i: number) => 4 + (i / (points.length - 1)) * (width - 8);
  const y = (v: number) => (max === min ? height / 2 : 4 + (1 - (v - min) / (max - min)) * (height - 8));
  const path = points
    .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
    .filter(Boolean)
    .join(" L ");
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={`M ${path}`} fill="none" stroke={MUTED} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {last !== null && <circle cx={x(points.length - 1)} cy={y(last)} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />}
    </svg>
  );
}

interface Tip {
  left: number;
  top: number;
  value: string;
  lines: string[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-3 py-2 text-xs text-paper shadow-lg"
      style={{ left: tip.left, top: tip.top - 10 }}
    >
      <p className="text-sm font-semibold">{tip.value}</p>
      {tip.lines.map((line) => (
        <p key={line} className="text-paper/75">
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * One metric across runs, oldest to newest. Hollow markers are ablation runs
 * (revision loop off). The crosshair snaps to the nearest run.
 */
export function TrendChart({
  runs,
  metric,
  selectedId,
  onSelect,
}: {
  runs: EvalRunSummary[];
  metric: MetricKey;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const m = METRICS[metric];
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const width = 720;
  const height = 240;
  const pad = { top: 16, right: 20, bottom: 32, left: 52 };
  const values = runs.map((r) => r.summary[metric]);
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return <p className="py-10 text-center text-ink-muted">No data for this metric yet.</p>;

  let [lo, hi] = m.domain ?? [Math.min(...known), Math.max(...known)];
  if (!m.domain) {
    // Free-range metrics (latency, tokens) start at zero so change isn't exaggerated.
    lo = 0;
    hi = hi === 0 ? 1 : hi * 1.1;
  }
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (runs.length === 1 ? innerW / 2 : (i / (runs.length - 1)) * innerW);
  const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo || 1)) * innerH;
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current.join(" L "));
      current = [];
    } else current.push(`${x(i)},${y(v)}`);
  });
  if (current.length) segments.push(current.join(" L "));

  const nearest = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    const px = ((clientX - box.left) / box.width) * width;
    let best = 0;
    runs.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    return best;
  };

  const tip: Tip | null =
    hover === null || !ref.current
      ? null
      : {
          left: (x(hover) / width) * ref.current.clientWidth,
          top: ((values[hover] === null ? pad.top : y(values[hover]!)) / height) * ref.current.clientHeight,
          value: values[hover] === null ? "—" : m.format(values[hover]!),
          lines: [
            runLabel(runs[hover], true),
            [runs[hover].meta.model, isAblation(runs[hover]) ? "revision off" : null].filter(Boolean).join(" · "),
          ].filter(Boolean),
        };

  return (
    <div
      ref={ref}
      className="relative"
      onPointerMove={(e) => setHover(nearest(e.clientX))}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{`${m.label} across ${runs.length} evaluation runs`}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
              {m.format(t)}
            </text>
          </g>
        ))}
        {runs.map((run, i) =>
          runs.length <= 8 || i === 0 || i === runs.length - 1 || i % Math.ceil(runs.length / 6) === 0 ? (
            <text key={run.id} x={x(i)} y={height - 10} textAnchor="middle" className="fill-ink-muted text-[11px]">
              {runLabel(run).replace(/, \d{4}$/, "")}
            </text>
          ) : null
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke={MUTED} strokeWidth={1} />}
        {segments.map((d) => (
          <path key={d} d={`M ${d}`} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {values.map((v, i) =>
          v === null ? null : (
            <circle
              key={runs[i].id}
              cx={x(i)}
              cy={y(v)}
              r={runs[i].id === selectedId ? 6 : 4.5}
              fill={isAblation(runs[i]) ? SURFACE : SERIES}
              stroke={isAblation(runs[i]) ? SERIES : SURFACE}
              strokeWidth={2}
            />
          )
        )}
        {/* Transparent hit areas, wider than the dots, also reachable by keyboard. */}
        {runs.map((run, i) => (
          <rect
            key={run.id}
            x={x(i) - 14}
            y={pad.top}
            width={28}
            height={innerH}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${runLabel(run, true)}: ${values[i] === null ? "no data" : m.format(values[i]!)}. Show this run.`}
            className="cursor-pointer focus:outline-none"
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(run.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(run.id);
              }
            }}
          />
        ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/**
 * Pass rate of each deterministic check in the selected run, as meters; a gray
 * tick marks the baseline run's rate. Values are labeled, so nothing needs hover.
 */
export function CheckMeters({ checks, baseline }: { checks: Record<string, number | null>; baseline: Record<string, number | null> | null }) {
  const entries = Object.entries(checks);
  if (entries.length === 0) return <p className="text-ink-muted">No checks in this run.</p>;
  return (
    <ul className="space-y-4">
      {entries.map(([name, rate]) => {
        const before = baseline?.[name] ?? null;
        return (
          <li key={name}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-ink">{CHECK_LABEL[name] ?? name}</span>
              <span className="tabular-nums text-ink-soft">
                {rate === null ? "n/a" : `${Math.round(rate * 100)}%`}
                {rate !== null && before !== null && Math.round(rate * 100) !== Math.round(before * 100) && (
                  <span className="ml-2 text-xs text-ink-muted">was {Math.round(before * 100)}%</span>
                )}
              </span>
            </div>
            <div className="relative mt-1.5 h-2.5 rounded-r-[4px]" style={{ background: rate === null ? GRID : TRACK }} aria-hidden>
              {rate !== null && rate > 0 && (
                <div className="h-full rounded-r-[4px]" style={{ width: `${rate * 100}%`, background: SERIES }} />
              )}
              {before !== null && (
                <span className="absolute -top-1 bottom-[-4px] w-0.5" style={{ left: `calc(${before * 100}% - 1px)`, background: MUTED }} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
