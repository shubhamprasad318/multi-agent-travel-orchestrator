import { formatDate } from "@/lib/format";
import type { WeatherResult } from "@/lib/types";
import { BulletList, EmptyState, Section } from "./shared";

const SOURCE_LABEL: Record<WeatherResult["source"], string> = {
  forecast: "Live forecast",
  mixed: "Forecast, then typical conditions",
  climate_estimate: "Typical conditions, not a forecast",
};

export default function WeatherSection({ weather }: { weather: WeatherResult | null }) {
  if (!weather) return <EmptyState message="Weather information is unavailable for this plan." />;

  return (
    <Section
      eyebrow="Weather & packing"
      title="What to expect"
      aside={<span className="text-xs uppercase tracking-eyebrow text-teal">{SOURCE_LABEL[weather.source]}</span>}
    >
      <p className="max-w-3xl font-serif text-2xl leading-snug text-ink">{weather.summary}</p>

      {weather.advisories.length > 0 && (
        <div className="mt-8 border-l-2 border-terracotta pl-4">
          <p className="eyebrow">Heads up</p>
          <BulletList items={weather.advisories} className="mt-2" />
        </div>
      )}

      <div className="mt-10 overflow-x-auto">
        <ol className="flex min-w-max divide-x divide-rule border-y border-rule">
          {weather.days.map((day) => (
            <li key={day.date} className="w-32 px-4 py-5">
              <p className="text-xs uppercase tracking-eyebrow text-ink-muted">{formatDate(day.date, { weekday: "short" })}</p>
              <p className="text-sm text-ink-soft">{formatDate(day.date)}</p>
              <p className="mt-3 font-serif text-3xl text-ink tabular-nums">{Math.round(day.temp_max_c)}°</p>
              <p className="text-sm text-ink-muted tabular-nums">low {Math.round(day.temp_min_c)}°</p>
              <p className="mt-3 text-sm leading-snug text-ink-soft min-h-[2.5rem]">{day.condition}</p>
              {day.precip_chance !== null && <p className="mt-1 text-xs text-teal tabular-nums">{day.precip_chance}% rain</p>}
            </li>
          ))}
        </ol>
      </div>

      {weather.packing_list.length > 0 && (
        <div className="mt-12">
          <h3 className="text-2xl text-ink">Packing list</h3>
          <ul className="mt-4 grid gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {weather.packing_list.map((item) => (
              <li key={item}>
                <label className="flex cursor-pointer items-center gap-3 border-b border-rule py-2 text-ink-soft has-[:checked]:text-ink-muted has-[:checked]:line-through">
                  <input type="checkbox" className="h-4 w-4 accent-terracotta" />
                  {item}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
