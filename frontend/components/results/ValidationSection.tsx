import { formatUSD } from "@/lib/format";
import type { BudgetBreakdown, BudgetStatus, Validation, ValidationStatus } from "@/lib/types";
import { BulletList, LeaderRow, Section } from "./shared";

export const STATUS_STYLE: Record<ValidationStatus, { label: string; tone: string; message: string }> = {
  Approved: { label: "Approved", tone: "text-teal", message: "This plan passed the editor's checks." },
  "Needs Review": {
    label: "Needs review",
    tone: "text-ochre",
    message: "Usable, with a few things worth a second look.",
  },
  Rejected: {
    label: "Not recommended",
    tone: "text-terracotta",
    message: "This plan has real problems. Try refining it below.",
  },
};

export const BUDGET_TONE: Record<BudgetStatus, string> = {
  "Within Budget": "text-teal",
  "Slightly Over": "text-ochre",
  "Over Budget": "text-terracotta",
  Unknown: "text-ink-muted",
};

const CATEGORY_LABELS: Record<string, string> = {
  itinerary_quality: "Itinerary quality",
  budget_feasibility: "Budget",
  weather_suitability: "Weather fit",
  activity_diversity: "Variety",
  booking_availability: "Bookings",
  overall_coherence: "Coherence",
};

export default function ValidationSection({ validation, budget }: { validation: Validation | null; budget: BudgetBreakdown }) {
  return (
    <Section eyebrow="The editor's report" title="Quality and budget">
      <div className="grid gap-14 lg:grid-cols-2">
        <div>
          {validation ? (
            <>
              <div className="flex items-end gap-6">
                <p className="font-serif text-8xl leading-none text-ink tabular-nums">{validation.overall_score}</p>
                <div className="pb-2">
                  <p className={`font-serif text-2xl ${STATUS_STYLE[validation.status].tone}`}>{STATUS_STYLE[validation.status].label}</p>
                  <p className="text-sm text-ink-muted">out of 100</p>
                </div>
              </div>
              <p className="mt-4 text-ink-soft">{STATUS_STYLE[validation.status].message}</p>
              {validation.revisions > 0 && (
                <p className="mt-2 text-sm text-ink-muted">The first draft scored low, so the planner wrote a second one.</p>
              )}

              <dl className="mt-10 space-y-4">
                {Object.entries(validation.category_scores).map(([key, score]) => (
                  <div key={key}>
                    <div className="flex justify-between text-sm">
                      <dt className="text-ink-soft">{CATEGORY_LABELS[key] ?? key}</dt>
                      <dd className="tabular-nums text-ink">{score}</dd>
                    </div>
                    <div className="mt-1.5 h-1 bg-paper-deep">
                      <div
                        className={score >= 75 ? "h-full bg-teal" : score >= 60 ? "h-full bg-ochre" : "h-full bg-terracotta"}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="text-ink-muted">Quality validation was not completed for this plan.</p>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl text-ink">Budget</h3>
            <span className={`text-xs uppercase tracking-eyebrow ${BUDGET_TONE[budget.status]}`}>{budget.status}</span>
          </div>
          <div className="mt-5 space-y-3 text-[15px]">
            <LeaderRow label="Flights" value={formatUSD(budget.flights)} />
            <LeaderRow label="Lodging" value={formatUSD(budget.lodging)} />
            <LeaderRow label="Activities & transport" value={formatUSD(budget.activities)} />
            <LeaderRow label="Food" value={formatUSD(budget.food)} />
          </div>
          <div className="mt-5 space-y-3 border-t-2 border-ink pt-4">
            <LeaderRow label={<span className="font-serif text-xl">Estimated total</span>} value={<span className="font-serif text-xl text-ink">{formatUSD(budget.estimated_total)}</span>} />
            <LeaderRow label="Your budget" value={formatUSD(budget.total_budget)} />
            <LeaderRow
              label={budget.remaining < 0 ? "Over by" : "Left over"}
              value={<span className={budget.remaining < 0 ? "text-terracotta" : "text-teal"}>{formatUSD(Math.abs(budget.remaining))}</span>}
            />
          </div>
        </div>
      </div>

      {validation && (validation.issues.length > 0 || validation.recommendations.length > 0) && (
        <div className="mt-14 grid gap-10 md:grid-cols-2">
          {validation.issues.length > 0 && (
            <div>
              <p className="eyebrow">Issues found</p>
              <BulletList items={validation.issues} className="mt-4" />
            </div>
          )}
          {validation.recommendations.length > 0 && (
            <div>
              <p className="eyebrow text-teal">Recommendations</p>
              <BulletList items={validation.recommendations} className="mt-4" />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
