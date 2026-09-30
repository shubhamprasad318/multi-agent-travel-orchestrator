import { formatDate, formatUSD } from "@/lib/format";
import { mapsUrl } from "@/lib/calendar";
import type { Itinerary } from "@/lib/types";
import { BulletList, EmptyState, ExternalLink, Section } from "./shared";

const PERIOD_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as const;

export default function ItinerarySection({ itinerary, destination }: { itinerary: Itinerary | null; destination: string }) {
  if (!itinerary || itinerary.days.length === 0) return <EmptyState message="No itinerary available." />;

  return (
    <Section eyebrow="The itinerary" title="Day by day">
      <ol className="space-y-16">
        {itinerary.days.map((day) => (
          <li key={day.day} className="grid gap-6 md:grid-cols-[8rem_1fr] md:gap-10 break-inside-avoid">
            <div className="md:border-t md:border-rule md:pt-3">
              <p className="font-serif text-7xl leading-none text-terracotta tabular-nums">{String(day.day).padStart(2, "0")}</p>
              <p className="mt-2 text-sm text-ink-muted">{formatDate(day.date, { weekday: "long", month: "short", day: "numeric" })}</p>
            </div>

            <article className="border-t border-ink pt-3">
              <h3 className="text-2xl md:text-3xl text-ink">{day.theme}</h3>

              {day.weather_note && (
                <p className="mt-4 border-l-2 border-ochre pl-4 font-serif italic text-ink-soft">{day.weather_note}</p>
              )}

              <ul className="mt-6 space-y-5">
                {day.slots.map((slot, i) => (
                  <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3">
                    <div className="pt-0.5">
                      <p className="text-sm tabular-nums text-ink">{slot.start_time}</p>
                      <p className="text-[11px] uppercase tracking-eyebrow text-ink-muted">{PERIOD_LABEL[slot.period]}</p>
                    </div>
                    <div>
                      <div className="flex items-baseline text-[17px]">
                        <span className="text-ink">{slot.activity}</span>
                        <span className="leader" aria-hidden />
                        <span className="tabular-nums text-ink-soft whitespace-nowrap">{slot.cost > 0 ? formatUSD(slot.cost) : "Free"}</span>
                      </div>
                      {slot.location && (
                        <ExternalLink href={mapsUrl(slot.location, destination)} className="mt-1 text-xs text-ink-muted">
                          {slot.location}
                        </ExternalLink>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {day.meals.length > 0 && (
                <div className="mt-8">
                  <p className="eyebrow text-ink-muted">At the table</p>
                  <ul className="mt-3 space-y-2 text-[15px]">
                    {day.meals.map((meal, i) => (
                      <li key={i} className="flex items-baseline">
                        <span className="w-20 shrink-0 capitalize text-ink-muted">{meal.type}</span>
                        <span className="text-ink">
                          {meal.suggestion}
                          {meal.cuisine && <span className="text-ink-muted"> · {meal.cuisine}</span>}
                        </span>
                        <span className="leader" aria-hidden />
                        <span className="tabular-nums text-ink-soft">{formatUSD(meal.cost)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {day.backup_options.length > 0 && (
                <div className="mt-8">
                  <p className="eyebrow text-ink-muted">If it rains</p>
                  <BulletList items={day.backup_options} className="mt-3 text-[15px]" />
                </div>
              )}

              <div className="mt-8 flex items-baseline justify-end gap-3 border-t border-rule pt-3">
                <span className="text-sm text-ink-muted">Day total</span>
                <span className="font-serif text-2xl text-ink tabular-nums">{formatUSD(day.total_cost)}</span>
              </div>
            </article>
          </li>
        ))}
      </ol>

      {(itinerary.highlights.length > 0 || itinerary.tips.length > 0) && (
        <div className="mt-16 grid gap-10 bg-paper-deep p-8 md:grid-cols-2">
          {itinerary.highlights.length > 0 && (
            <div>
              <p className="eyebrow">Don&apos;t miss</p>
              <BulletList items={itinerary.highlights} className="mt-4" />
            </div>
          )}
          {itinerary.tips.length > 0 && (
            <div>
              <p className="eyebrow">Insider tips</p>
              <BulletList items={itinerary.tips} className="mt-4" />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
