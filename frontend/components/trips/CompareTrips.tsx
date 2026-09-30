import Link from "next/link";
import { X } from "lucide-react";
import { moneyFor } from "@/lib/money";
import type { TripEntry } from "@/lib/tripsIndex";
import { cn } from "@/lib/utils";
import { BUDGET_TONE, STATUS_TONE, tripDates } from "./format";

type Better = "lower" | "higher" | null;

interface Row {
  label: string;
  render: (trip: TripEntry) => React.ReactNode;
  /** Numeric value used to pick the better trip (compared in USD for money). */
  value?: (trip: TripEntry) => number | null;
  better?: Better;
}

const ROWS: Row[] = [
  { label: "Dates", render: (t) => tripDates(t.start_date, t.end_date) },
  { label: "Days", render: (t) => t.days, value: (t) => t.days },
  { label: "Travelers", render: (t) => t.travelers },
  {
    label: "Estimated total",
    render: (t) => moneyFor({ money: t.money }).format(t.estimated_total_usd),
    value: (t) => t.estimated_total_usd,
    better: "lower",
  },
  {
    label: "Per traveler",
    render: (t) => moneyFor({ money: t.money }).format(t.estimated_total_usd / Math.max(1, t.travelers)),
    value: (t) => t.estimated_total_usd / Math.max(1, t.travelers),
    better: "lower",
  },
  {
    label: "Per day",
    render: (t) => moneyFor({ money: t.money }).format(t.estimated_total_usd / Math.max(1, t.days)),
    value: (t) => t.estimated_total_usd / Math.max(1, t.days),
    better: "lower",
  },
  {
    label: "Budget",
    render: (t) => <span className={BUDGET_TONE[t.budget_status]}>{t.budget_status}</span>,
  },
  {
    label: "Editor's score",
    render: (t) =>
      t.score === null ? (
        "—"
      ) : (
        <>
          {t.score}
          {t.validation_status && <span className={cn("ml-2 text-xs", STATUS_TONE[t.validation_status])}>{t.validation_status}</span>}
        </>
      ),
    value: (t) => t.score,
    better: "higher",
  },
  { label: "Hotel", render: (t) => t.hotel ?? "—" },
  { label: "Activities suggested", render: (t) => t.activities, value: (t) => t.activities, better: "higher" },
  { label: "Changes made", render: (t) => t.refinements },
];

function winner(row: Row, a: TripEntry, b: TripEntry): "a" | "b" | null {
  if (!row.better || !row.value) return null;
  const va = row.value(a);
  const vb = row.value(b);
  if (va === null || vb === null || va === vb) return null;
  const aWins = row.better === "lower" ? va < vb : va > vb;
  return aWins ? "a" : "b";
}

export default function CompareTrips({ a, b, onClose }: { a: TripEntry; b: TripEntry; onClose: () => void }) {
  const currencyA = a.money?.currency ?? "USD";
  const currencyB = b.money?.currency ?? "USD";

  return (
    <section aria-labelledby="compare-heading" className="border-t-2 border-ink pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Side by side</p>
          <h2 id="compare-heading" className="mt-2 text-3xl md:text-4xl text-ink">
            {a.destination} <span className="font-serif italic text-ink-muted">vs</span> {b.destination}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-terracotta">
          <X className="h-4 w-4" aria-hidden /> Close comparison
        </button>
      </div>

      {currencyA !== currencyB && (
        <p className="mt-4 max-w-2xl border-l-2 border-ochre pl-4 text-sm text-ink-soft">
          These trips were planned in different currencies ({currencyA} and {currencyB}). Each amount is shown in its own
          currency; the better value is judged on the converted totals.
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <caption className="sr-only">
            Comparison of {a.destination} and {b.destination}. Better values are marked.
          </caption>
          <thead>
            <tr className="border-b border-ink">
              <th scope="col" className="w-1/4 py-3 pr-4 text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted" />
              {[a, b].map((trip) => (
                <th key={trip.id} scope="col" className="py-3 pr-4 align-bottom">
                  <Link href={`/results?id=${trip.id}`} className="font-serif text-xl font-normal text-ink hover:text-terracotta">
                    {trip.destination}
                  </Link>
                  {trip.version > 1 && <span className="ml-2 text-xs text-ink-muted">v{trip.version}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const best = winner(row, a, b);
              return (
                <tr key={row.label} className="border-b border-rule">
                  <th scope="row" className="py-3 pr-4 text-sm font-normal text-ink-muted">
                    {row.label}
                  </th>
                  {(["a", "b"] as const).map((side) => {
                    const trip = side === "a" ? a : b;
                    const isBest = best === side;
                    return (
                      <td key={side} className={cn("py-3 pr-4 tabular-nums", isBest ? "font-medium text-teal" : "text-ink")}>
                        {row.render(trip)}
                        {isBest && <span className="sr-only"> (better)</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
