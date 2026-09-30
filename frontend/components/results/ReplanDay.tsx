"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudRain, Loader2, RefreshCw, X } from "lucide-react";
import { replanDay } from "@/lib/api";
import { cachePlan } from "@/lib/planCache";
import type { DayPlan, WeatherDay } from "@/lib/types";

const RAINY = /rain|storm|shower|thunder|snow|typhoon/i;

function suggestions(forecast: WeatherDay | undefined): string[] {
  const wet = forecast && ((forecast.precip_chance ?? 0) >= 50 || RAINY.test(forecast.condition));
  return [
    wet ? "Heavy rain expected, keep us indoors" : "It's going to rain, swap outdoor plans",
    "We're tired, make it an easy day",
    "Something is closed, replace it",
    "More food, less sightseeing",
  ];
}

/**
 * "Re-plan this day": only this day is regenerated, the rest of the trip stays
 * exactly as it is. Saved as a new version, like other changes.
 */
export default function ReplanDay({ planId, day, forecast }: { planId: string; day: DayPlan; forecast?: WeatherDay }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async (text: string) => {
    const value = text.trim();
    if (value.length < 3 || pending) return;
    setPending(true);
    setError(null);
    abortRef.current = new AbortController();
    try {
      const updated = await replanDay(planId, day.day, value, abortRef.current.signal);
      cachePlan(updated);
      router.push(`/results?id=${updated.id}#itinerary`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Couldn't re-plan this day.");
      setPending(false);
    }
  };

  const wet = forecast && ((forecast.precip_chance ?? 0) >= 50 || RAINY.test(forecast.condition));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-terracotta transition-colors print:hidden"
      >
        {wet ? <CloudRain className="h-4 w-4 text-ochre" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        Re-plan this day
      </button>
    );
  }

  return (
    <div className="mt-2 border border-rule bg-paper-deep p-4 print:hidden">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink">
          What changed on day {day.day}? <span className="text-ink-muted">Only this day is rewritten.</span>
        </p>
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort();
            setOpen(false);
            setPending(false);
            setError(null);
          }}
          aria-label="Close"
          className="rounded p-1 text-ink-muted hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(reason);
        }}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <label htmlFor={`replan-${day.day}`} className="sr-only">
          What changed
        </label>
        <input
          ref={inputRef}
          id={`replan-${day.day}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          disabled={pending}
          placeholder="e.g. heavy rain all afternoon"
          className="min-w-[14rem] flex-1 border-b border-ink/30 bg-transparent pb-1.5 text-ink placeholder:text-ink/35 focus:border-terracotta focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || reason.trim().length < 3}
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-4 py-2 text-sm text-paper hover:bg-terracotta-dark disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Re-planning…" : "Re-plan"}
        </button>
      </form>
      {!pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions(forecast).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setReason(s);
                submit(s);
              }}
              className="rounded-full border border-rule px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}
