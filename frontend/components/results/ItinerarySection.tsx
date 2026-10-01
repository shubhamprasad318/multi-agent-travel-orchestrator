"use client";

import { useEffect, useState } from "react";
import { CloudRain, MapPin, Pencil, TrainFront } from "lucide-react";
import { formatDate, isStayStop } from "@/lib/format";
import { Price } from "@/lib/money";
import { mapsUrl } from "@/lib/calendar";
import { useCollab } from "@/lib/collab";
import { MEAL_ICONS, stopIcon, weatherIcon } from "@/lib/icons";
import type { Itinerary, Transfer, WeatherResult } from "@/lib/types";
import StopFeedback from "./collab/StopFeedback";
import ItineraryEditor from "./edit/ItineraryEditor";
import { dayColor } from "./map/colors";
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
      <ol className="space-y-10">
        {itinerary.days.map((day) => {
          const color = dayColor(day.day);
          const forecast = forecastFor(day.date);
          const WeatherIcon = forecast ? weatherIcon(forecast.condition) : null;
          return (
            <li
              key={day.day}
              className="break-inside-avoid overflow-hidden rounded-2xl border border-rule bg-white/70 shadow-[0_1px_0_rgba(31,27,22,0.04),0_12px_32px_-20px_rgba(31,27,22,0.25)]"
              style={{ borderTop: `4px solid ${color}` }}
            >
              <header className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5 sm:gap-x-6 md:p-8 md:pb-6">
                <div
                  className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-paper sm:h-16 sm:w-16 sm:rounded-2xl"
                  style={{ backgroundColor: color }}
                >
                  <span className="text-[10px] uppercase tracking-eyebrow opacity-80">Day</span>
                  <span className="font-serif text-2xl leading-none tabular-nums sm:text-3xl">{day.day}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-muted">
                    {formatDate(day.date, { weekday: "long", month: "short", day: "numeric" })}
                    {day.city && (
                      <span className="ml-2 inline-flex items-center gap-1 text-teal-dark">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {day.city.split(",")[0]}
                      </span>
                    )}
                  </p>
                  <h3 className="mt-1 text-2xl md:text-3xl text-ink">{day.theme}</h3>
                  {forecast && WeatherIcon && (
                    <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 rounded-xl bg-paper-deep px-3 py-1 text-sm text-ink-soft sm:rounded-full">
                      <WeatherIcon className="h-4 w-4 text-ochre" aria-hidden />
                      <span>{forecast.condition}</span>
                      <span className="tabular-nums text-ink-muted">
                        {Math.round(forecast.temp_min_c)}–{Math.round(forecast.temp_max_c)}°C
                        {forecast.precip_chance != null && forecast.precip_chance >= 20 && ` · ${forecast.precip_chance}% rain`}
                      </span>
                    </p>
                  )}
                </div>
                {changeable && planId && (
                  <div className="w-full pl-16 sm:w-auto sm:pl-0">
                    <ReplanDay planId={planId} day={day} forecast={forecast} />
                  </div>
                )}
              </header>

              <div className="px-5 pb-6 md:px-8 md:pb-8">
                {transferOn(day.date) && <TransferNote transfer={transferOn(day.date)!} />}
                {day.weather_note && (
                  <p className="mb-6 border-l-2 border-ochre pl-4 font-serif italic text-ink-soft">{day.weather_note}</p>
                )}

                <ul className="relative">
                  {day.slots.map((slot, i) => {
                    const Icon = stopIcon(slot.activity);
                    const last = i === day.slots.length - 1;
                    return (
                      <li key={slot.id ?? i} className="relative grid grid-cols-[2.75rem_1fr] gap-3 pb-6 last:pb-0 sm:gap-4">
                        {!last && (
                          <span
                            className="absolute left-[1.375rem] top-11 bottom-0 w-px -translate-x-1/2"
                            style={{ backgroundImage: `linear-gradient(${color} 50%, transparent 0)`, backgroundSize: "1px 6px", opacity: 0.5 }}
                            aria-hidden
                          />
                        )}
                        <span
                          className="relative flex h-11 w-11 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${color}1A`, color }}
                          aria-hidden
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 rounded-xl border border-transparent pt-0.5">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="text-sm font-medium tabular-nums" style={{ color }}>
                              {slot.start_time}
                            </span>
                            <span className="text-[11px] uppercase tracking-eyebrow text-ink-muted">{PERIOD_LABEL[slot.period]}</span>
                          </div>
                          <div className="mt-0.5 flex items-baseline gap-3 text-[17px]">
                            <span className="min-w-0 flex-1 text-ink sm:flex-none">{slot.activity}</span>
                            <span className="leader hidden sm:block" aria-hidden />
                            {slot.cost <= 0 && isStayStop(slot.activity) ? (
                              <span className="whitespace-nowrap text-sm text-ink-soft" title="The hotel is counted under lodging in Bookings and Budget">
                                Included in stay
                              </span>
                            ) : slot.cost <= 0 ? (
                              <span className="whitespace-nowrap rounded-full bg-teal-light px-2 py-0.5 text-xs font-medium text-teal-dark">Free</span>
                            ) : (
                              <Price usd={slot.cost} className="text-ink-soft" />
                            )}
                          </div>
                          {slot.location && (
                            <ExternalLink href={mapsUrl(slot.location, day.city ?? destination)} className="mt-1 text-xs text-ink-muted">
                              {slot.location}
                            </ExternalLink>
                          )}
                          <StopFeedback slotId={slot.id} activity={slot.activity} />
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {day.meals.length > 0 && (
                  <div className="mt-8">
                    <p className="eyebrow text-ink-muted">At the table</p>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                      {day.meals.map((meal, i) => {
                        const MealIcon = MEAL_ICONS[meal.type];
                        return (
                          <li key={i} className="flex flex-col rounded-xl bg-paper p-4">
                            <p className="flex items-center gap-2 text-[11px] uppercase tracking-eyebrow text-ink-muted">
                              <MealIcon className="h-4 w-4 text-terracotta" aria-hidden />
                              {meal.type}
                            </p>
                            <p className="mt-2 text-[15px] leading-snug text-ink">{meal.suggestion}</p>
                            {meal.cuisine && <p className="text-xs text-ink-muted">{meal.cuisine}</p>}
                            <p className="mt-auto pt-3 text-sm">
                              {meal.cost <= 0 ? (
                                // The planner prices a meal at 0 only when the hotel includes it.
                                <span className="text-ink-soft">Included in stay</span>
                              ) : (
                                <Price usd={meal.cost} className="text-ink-soft" />
                              )}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {day.backup_options.length > 0 && (
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-eyebrow text-ink-muted">
                      <CloudRain className="h-4 w-4" aria-hidden /> If it rains
                    </span>
                    {day.backup_options.map((option, i) => (
                      <span key={i} className="rounded-full border border-rule px-3 py-1 text-sm text-ink-soft">
                        {option}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <footer className="flex items-baseline justify-between gap-3 bg-paper-deep/70 px-5 py-3 md:px-8">
                <span className="text-sm text-ink-muted">
                  {day.slots.length} stop{day.slots.length === 1 ? "" : "s"} · {day.meals.length} meal{day.meals.length === 1 ? "" : "s"}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="text-sm text-ink-muted">Day total</span>
                  <Price usd={day.total_cost} className="font-serif text-2xl text-ink" localClassName="font-sans" />
                </span>
              </footer>
            </li>
          );
        })}
      </ol>
      )}

      {(itinerary.highlights.length > 0 || itinerary.tips.length > 0) && (
        <div className="mt-12 grid gap-10 rounded-2xl bg-teal-dark p-8 text-paper md:grid-cols-2 md:p-10 [&_.eyebrow]:text-ochre [&_li]:text-paper/90">
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
    <p className="mb-6 flex flex-wrap items-baseline gap-x-2 border-l-2 border-teal pl-4 text-ink-soft">
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
