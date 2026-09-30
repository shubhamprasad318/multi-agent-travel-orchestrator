"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useMoney } from "@/lib/money";
import type { BookingsResult, BudgetBreakdown, Itinerary } from "@/lib/types";
import { BUDGET_TONE } from "./ValidationSection";
import { Section } from "./shared";

// Categorical palette, validated with the dataviz validator against the paper
// surface (#F6F1E7): lightness, chroma, CVD and normal-vision separation pass.
// Ochre is below 3:1 contrast, so every mark also has a visible label/table value.
const CATEGORIES = [
  { key: "flights", label: "Flights", color: "#C0502B" },
  { key: "lodging", label: "Lodging", color: "#00897B" },
  { key: "activities", label: "Activities & transport", color: "#D39A1E" },
  { key: "food", label: "Food", color: "#5B45A8" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

interface Tip {
  x: number;
  y: number;
  lines: string[];
}

export default function BudgetSection({
  budget,
  itinerary,
  bookings,
  travelers,
}: {
  budget: BudgetBreakdown;
  itinerary: Itinerary | null;
  bookings: BookingsResult | null;
  travelers: number;
}) {
  const money = useMoney();
  const [showTable, setShowTable] = useState(false);

  return (
    <Section
      eyebrow="Where the money goes"
      title="Budget"
      aside={<span className={cn("text-xs uppercase tracking-eyebrow", BUDGET_TONE[budget.status])}>{budget.status}</span>}
    >
      <HeroFigure budget={budget} />
      <CompositionBar budget={budget} />

      {itinerary && itinerary.days.length > 0 && (
        <div className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-2xl text-ink">Spend per day</h3>
            <button type="button" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable} className="text-sm text-ink-soft link-underline">
              {showTable ? "Show chart" : "Show as table"}
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Activities, local transport and food on the ground; flights and lodging are paid once.</p>
          {showTable ? <DailyTable itinerary={itinerary} /> : <DailyColumns itinerary={itinerary} />}
        </div>
      )}

      <div className="mt-16">
        <h3 className="text-2xl text-ink">Per person</h3>
        <p className="mt-1 text-sm text-ink-muted">
          An even split across {travelers} traveler{travelers === 1 ? "" : "s"}
          {bookings?.hotels[0] && bookings.hotels[0].rooms > 1 ? `, sharing ${bookings.hotels[0].rooms} rooms` : ""}.
        </p>
        <SplitTable budget={budget} travelers={travelers} />
      </div>

      <p className="mt-10 text-xs text-ink-muted">
        Amounts in {money.currency}
        {money.localCurrency ? `, with ${money.localCurrency} shown where it helps` : ""}. Converted at the exchange rate on the day the plan was made.
      </p>
    </Section>
  );
}

function HeroFigure({ budget }: { budget: BudgetBreakdown }) {
  const money = useMoney();
  const over = budget.remaining < 0;
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
      <div>
        <p className="text-sm text-ink-muted">Estimated total</p>
        {/* The one hero number on this view: sans, not the display serif. */}
        <p className="text-5xl md:text-6xl font-semibold tracking-tight text-ink tabular-nums">{money.format(budget.estimated_total)}</p>
      </div>
      <div className="pb-2 text-sm">
        <p className="text-ink-soft">of {money.format(budget.total_budget)} budget</p>
        <p className={over ? "text-terracotta" : "text-teal"}>
          {over ? "Over by " : "Left over: "}
          {money.format(Math.abs(budget.remaining))}
          {budget.total_budget > 0 && ` (${Math.abs(Math.round((budget.remaining / budget.total_budget) * 100))}%)`}
        </p>
      </div>
    </div>
  );
}

function CompositionBar({ budget }: { budget: BudgetBreakdown }) {
  const money = useMoney();
  const [tip, setTip] = useState<Tip | null>(null);
  const values: Record<CategoryKey, number> = {
    flights: budget.flights,
    lodging: budget.lodging,
    activities: budget.activities,
    food: budget.food,
  };
  const total = budget.estimated_total;
  // Scale to whichever is larger so the budget marker always fits.
  const scale = Math.max(budget.total_budget, total, 1);
  const present = CATEGORIES.filter((c) => values[c.key] > 0);
  const budgetPct = (budget.total_budget / scale) * 100;

  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="mt-10">
      <div className="relative" onMouseLeave={() => setTip(null)}>
        {/* Track = the whole budget, one step off the surface. */}
        <div className="relative h-10 rounded bg-paper-deep" role="img" aria-label={`Estimated total ${money.format(total)} of a ${money.format(budget.total_budget)} budget`}>
          <div className="absolute inset-y-0 left-0 flex gap-[2px]" style={{ width: `${(total / scale) * 100}%` }}>
            {present.map((c, i) => (
              <button
                key={c.key}
                type="button"
                className={cn(
                  "h-full min-w-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
                  i === 0 && "rounded-l",
                  i === present.length - 1 && "rounded-r"
                )}
                style={{ flexGrow: values[c.key], flexBasis: 0, background: c.color }}
                aria-label={`${c.label}: ${money.format(values[c.key])}, ${share(values[c.key])}% of the total`}
                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [c.label, `${money.format(values[c.key])} · ${share(values[c.key])}%`] })}
                onFocus={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setTip({ x: r.left + r.width / 2, y: r.top, lines: [c.label, `${money.format(values[c.key])} · ${share(values[c.key])}%`] });
                }}
                onBlur={() => setTip(null)}
              />
            ))}
          </div>
          {budget.total_budget > 0 && (
            <div className="pointer-events-none absolute -top-2 -bottom-2 w-0.5 bg-ink" style={{ left: `calc(${budgetPct}% - 1px)` }} aria-hidden>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-ink-soft">Budget</span>
            </div>
          )}
        </div>
      </div>

      {/* Legend: always present for multiple series; values in text ink, identity from the swatch. */}
      <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((c) => (
          <li key={c.key} className="flex items-baseline gap-3">
            <span className="h-3 w-3 shrink-0 translate-y-0.5 rounded-sm" style={{ background: c.color }} aria-hidden />
            <span className="flex-1">
              <span className="block text-sm text-ink-soft">{c.label}</span>
              <span className="block text-lg font-semibold tabular-nums text-ink">
                {money.format(values[c.key])} <span className="text-sm font-normal text-ink-muted">{share(values[c.key])}%</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  );
}

function niceStep(max: number, target = 4): number {
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function DailyColumns({ itinerary }: { itinerary: Itinerary }) {
  const money = useMoney();
  const [tip, setTip] = useState<Tip | null>(null);
  const days = itinerary.days.map((d) => {
    const activities = d.slots.reduce((s, x) => s + x.cost, 0);
    const food = d.meals.reduce((s, x) => s + x.cost, 0);
    return { day: d.day, theme: d.theme, activities, food, total: activities + food };
  });
  const maxLocal = Math.max(...days.map((d) => money.convert(d.total)), 1);
  const step = niceStep(maxLocal);
  const top = Math.ceil(maxLocal / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const height = 220;
  const px = (usd: number) => (money.convert(usd) / top) * height;
  const activitiesColor = CATEGORIES[2].color;
  const foodColor = CATEGORIES[3].color;

  return (
    <div className="mt-6" onMouseLeave={() => setTip(null)}>
      <div className="flex gap-6 text-sm text-ink-soft mb-4">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: activitiesColor }} aria-hidden />Activities & transport</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: foodColor }} aria-hidden />Food</span>
      </div>
      <div className="relative overflow-x-auto">
        <div className="relative min-w-[480px] pl-14" style={{ height: height + 40 }}>
          {/* Hairline grid + clean tick labels */}
          {ticks.map((t) => (
            <div key={t} className="absolute left-14 right-0 border-t border-rule" style={{ bottom: 32 + (t / top) * height }}>
              <span className="absolute -left-14 -translate-y-1/2 w-12 text-right text-[11px] tabular-nums text-ink-muted">{compact(t)}</span>
            </div>
          ))}
          <ol className="absolute bottom-8 left-14 right-0 flex items-end justify-around" style={{ height }}>
            {days.map((d) => {
              const label = [`Day ${d.day} · ${d.theme}`, `Activities ${money.format(d.activities)}`, `Food ${money.format(d.food)}`, `Total ${money.format(d.total)}`];
              return (
                <li key={d.day} className="relative flex h-full flex-col items-center justify-end">
                  <button
                    type="button"
                    className="group flex h-full w-10 flex-col items-center justify-end outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    aria-label={label.join(", ")}
                    onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: label })}
                    onFocus={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip({ x: r.left + r.width / 2, y: r.top + 20, lines: label });
                    }}
                    onBlur={() => setTip(null)}
                  >
                    {/* Stacked column: 2px surface gap between segments, rounded data-end, square baseline. */}
                    <span className="flex w-6 flex-col gap-[2px]">
                      {d.food > 0 && <span className="w-full rounded-t" style={{ height: px(d.food), background: foodColor }} />}
                      {d.activities > 0 && (
                        <span className={cn("w-full", d.food > 0 ? "" : "rounded-t")} style={{ height: px(d.activities), background: activitiesColor }} />
                      )}
                    </span>
                  </button>
                  <span className="absolute -bottom-7 text-xs text-ink-muted">Day {d.day}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

function DailyTable({ itinerary }: { itinerary: Itinerary }) {
  const money = useMoney();
  return (
    <table className="mt-6 w-full text-sm">
      <thead>
        <tr className="border-b border-ink text-left text-xs uppercase tracking-eyebrow text-ink-muted">
          <th className="py-2 font-medium">Day</th>
          <th className="py-2 font-medium text-right">Activities & transport</th>
          <th className="py-2 font-medium text-right">Food</th>
          <th className="py-2 font-medium text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {itinerary.days.map((d) => {
          const activities = d.slots.reduce((s, x) => s + x.cost, 0);
          const food = d.meals.reduce((s, x) => s + x.cost, 0);
          return (
            <tr key={d.day} className="border-b border-rule">
              <td className="py-2 text-ink">Day {d.day} <span className="text-ink-muted">· {d.theme}</span></td>
              <td className="py-2 text-right tabular-nums text-ink-soft">{money.format(activities)}</td>
              <td className="py-2 text-right tabular-nums text-ink-soft">{money.format(food)}</td>
              <td className="py-2 text-right tabular-nums text-ink">{money.format(activities + food)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SplitTable({ budget, travelers }: { budget: BudgetBreakdown; travelers: number }) {
  const money = useMoney();
  const rows = [
    ...CATEGORIES.map((c) => ({ label: c.label, color: c.color, total: budget[c.key] })),
  ];
  return (
    <table className="mt-6 w-full text-sm">
      <thead>
        <tr className="border-b border-ink text-left text-xs uppercase tracking-eyebrow text-ink-muted">
          <th className="py-2 font-medium">Category</th>
          <th className="py-2 font-medium text-right">Group</th>
          <th className="py-2 font-medium text-right">Per person</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-rule">
            <td className="py-2.5 text-ink">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: r.color }} aria-hidden />
              {r.label}
            </td>
            <td className="py-2.5 text-right tabular-nums text-ink-soft">{money.format(r.total)}</td>
            <td className="py-2.5 text-right tabular-nums text-ink">{money.format(r.total / travelers)}</td>
          </tr>
        ))}
        <tr>
          <td className="pt-3 font-semibold text-ink">Total</td>
          <td className="pt-3 text-right font-semibold tabular-nums text-ink">{money.format(budget.estimated_total)}</td>
          <td className="pt-3 text-right font-semibold tabular-nums text-ink">
            {money.format(budget.estimated_total / travelers)}
            {money.localCurrency && (
              <span className="block text-xs font-normal text-ink-muted">≈ {money.formatLocal(budget.estimated_total / travelers)}</span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded bg-ink px-3 py-2 text-xs text-paper shadow-lg"
      style={{ left: tip.x, top: tip.y - 12 }}
    >
      {tip.lines.map((line, i) => (
        <p key={i} className={i === 0 ? "font-semibold" : "tabular-nums text-paper/85"}>{line}</p>
      ))}
    </div>
  );
}
