"use client";

import { useEffect, useState } from "react";
import { MapPin, Pencil, TrainFront } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Price } from "@/lib/money";
import { mapsUrl } from "@/lib/calendar";
import { useCollab } from "@/lib/collab";
import type { Itinerary, Transfer, WeatherResult } from "@/lib/types";
import StopFeedback from "./collab/StopFeedback";
import ItineraryEditor from "./edit/ItineraryEditor";
import ReplanDay from "./ReplanDay";
import { BulletList, EmptyState, ExternalLink, Section } from "./shared";

const PERIOD_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as const;

export default function ItinerarySection({
  itinerary,
  destination,
  planId,
  weather,
  transfers = [],
}: {
  itinerary: Itinerary | null;
  destination: string;
  /** Enables hand-editing and re-planning days (saved as new versions of this plan). */
  planId?: string;
  weather?: WeatherResult | null;
  /** Multi-city trips: moves between cities, shown on their travel day. */
  transfers?: Transfer[];
}) {
  const [editing, setEditing] = useState(false);
  const { canEdit } = useCollab();
  // Saving navigates to the new version; leave edit mode when the plan changes.
  useEffect(() => setEditing(false), [planId]);

  if (!itinerary || itinerary.days.length === 0) return <EmptyState message="No itinerary available." />;

  const changeable = Boolean(planId) && canEdit;
  const forecastFor = (date: string) => weather?.days.find((w) => w.date === date);
  const transferOn = (date: string) => transfers.find((t) => t.date === date);

  const editButton =
    changeable && !editing ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm text-ink-soft hover:border-ink hover:text-ink transition-colors print:hidden"
      >
        <Pencil className="h-4 w-4" aria-hidden /> Edit itinerary
      </button>
    ) : editing ? (
      <span className="eyebrow">Editing</span>
    ) : undefined;

  return (
    <Section eyebrow="The itinerary" title="Day by day" aside={editButton}>
      {editing && planId && changeable ? (
        <ItineraryEditor planId={planId} itinerary={itinerary} onCancel={() => setEditing(false)} />
      ) : (
      <ol className="space-y-16">
        {itinerary.days.map((day) => (
          <li key={day.day} className="grid gap-6 md:grid-cols-[8rem_1fr] md:gap-10 break-inside-avoid">
            <div className="md:border-t md:border-rule md:pt-3">
              <p className="font-serif text-7xl leading-none text-terracotta tabular-nums">{String(day.day).padStart(2, "0")}</p>
              <p className="mt-2 text-sm text-ink-muted">{formatDate(day.date, { weekday: "long", month: "short", day: "numeric" })}</p>
              {day.city && (
                <p className="mt-2 inline-flex items-center gap-1 text-sm text-teal-dark">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {day.city.split(",")[0]}
                </p>
              )}
            </div>

            <article className="border-t border-ink pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h3 className="text-2xl md:text-3xl text-ink">{day.theme}</h3>
                {changeable && planId && <ReplanDay planId={planId} day={day} forecast={forecastFor(day.date)} />}
              </div>
              {transferOn(day.date) && <TransferNote transfer={transferOn(day.date)!} />}

              {day.weather_note && (
                <p className="mt-4 border-l-2 border-ochre pl-4 font-serif italic text-ink-soft">{day.weather_note}</p>
              )}

              <ul className="mt-6 space-y-5">
                {day.slots.map((slot, i) => (
                  <li key={slot.id ?? i} className="grid grid-cols-[4.5rem_1fr] gap-3">
                    <div className="pt-0.5">
                      <p className="text-sm tabular-nums text-ink">{slot.start_time}</p>
                      <p className="text-[11px] uppercase tracking-eyebrow text-ink-muted">{PERIOD_LABEL[slot.period]}</p>
                    </div>
                    <div>
                      <div className="flex items-baseline text-[17px]">
                        <span className="text-ink">{slot.activity}</span>
                        <span className="leader" aria-hidden />
                        <Price usd={slot.cost} free className="text-ink-soft" />
                      </div>
                      {slot.location && (
                        <ExternalLink href={mapsUrl(slot.location, day.city ?? destination)} className="mt-1 text-xs text-ink-muted">
                          {slot.location}
                        </ExternalLink>
                      )}
                      <StopFeedback slotId={slot.id} activity={slot.activity} />
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
                        <Price usd={meal.cost} className="text-ink-soft" />
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
                <Price usd={day.total_cost} className="font-serif text-2xl text-ink" localClassName="font-sans" />
              </div>
            </article>
          </li>
        ))}
      </ol>
      )}

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

function TransferNote({ transfer }: { transfer: Transfer }) {
  return (
    <p className="mt-4 flex flex-wrap items-baseline gap-x-2 border-l-2 border-teal pl-4 text-ink-soft">
      <TrainFront className="h-4 w-4 self-center text-teal" aria-hidden />
      <span>
        Travel day: <span className="capitalize">{transfer.mode}</span> from {transfer.from_city.split(",")[0]} to{" "}
        {transfer.to_city.split(",")[0]} · {transfer.duration} ·{" "}
      </span>
      <Price usd={transfer.cost} className="text-ink-soft" />
      {transfer.notes && <span className="w-full text-sm text-ink-muted">{transfer.notes}</span>}
    </p>
  );
}
