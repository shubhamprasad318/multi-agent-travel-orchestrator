"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Itinerary } from "@/lib/types";
import { EmptyState, Section } from "../shared";
import { dayColor } from "./colors";

// Leaflet touches `window`, so it can only load in the browser.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[480px] bg-paper-deep flex items-center justify-center text-ink-muted">
      <Loader2 className="w-6 h-6 animate-spin mr-2" aria-hidden /> Loading map…
    </div>
  ),
});

export default function MapSection({ itinerary }: { itinerary: Itinerary | null }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const days = itinerary?.days ?? [];
  const mappable = days.filter((d) => d.slots.some((s) => s.lat !== null && s.lng !== null));
  if (mappable.length === 0) return <EmptyState message="The stops in this itinerary couldn't be placed on a map." />;

  const shown = selectedDay === null ? mappable : mappable.filter((d) => d.day === selectedDay);
  const unmapped = days.reduce((n, d) => n + d.slots.filter((s) => s.lat === null).length, 0);

  return (
    <Section eyebrow="On the map" title="Where each day takes you">
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter map by day">
        <DayButton active={selectedDay === null} onClick={() => setSelectedDay(null)}>
          All days
        </DayButton>
        {mappable.map((d) => (
          <DayButton key={d.day} active={selectedDay === d.day} onClick={() => setSelectedDay(d.day)} color={dayColor(d.day)}>
            Day {d.day}
          </DayButton>
        ))}
      </div>

      <TripMap days={shown} />

      <p className="text-xs text-ink-muted mt-3">
        Pins are approximate locations suggested by the AI; use the map links in the itinerary for exact directions.
        {unmapped > 0 && ` ${unmapped} stop${unmapped === 1 ? "" : "s"} couldn't be placed.`}
      </p>
    </Section>
  );
}

function DayButton({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 text-sm rounded-full px-4 py-1.5 border transition-colors",
        active ? "bg-ink text-paper border-ink" : "border-rule text-ink-soft hover:border-ink"
      )}
    >
      {color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  );
}
