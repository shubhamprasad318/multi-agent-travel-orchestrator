"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysBetween, toISODate } from "@/lib/format";
import { CURRENCIES, currencySymbol, detectCurrency } from "@/lib/money";
import type { Accommodation, Pace, TravelRequest } from "@/lib/types";

// Must match max_trip_days and MAX_STOPS on the backend.
const MAX_TRIP_DAYS = 21;
const MAX_STOPS = 5;

const INTEREST_OPTIONS = [
  "Culture", "Food", "History", "Art", "Nature",
  "Adventure", "Beach", "Nightlife", "Shopping", "Technology", "Relaxation",
];

const PACE_OPTIONS: { value: Pace; title: string; desc: string }[] = [
  { value: "relaxed", title: "Relaxed", desc: "One or two things a day, long lunches" },
  { value: "moderate", title: "Balanced", desc: "A full day with room to wander" },
  { value: "fast", title: "Packed", desc: "See as much as possible" },
];

const ACCOMMODATION_OPTIONS: { value: Accommodation; title: string; desc: string }[] = [
  { value: "budget", title: "Budget", desc: "Hostels & guesthouses" },
  { value: "mid-range", title: "Comfortable", desc: "3–4 star hotels" },
  { value: "luxury", title: "Luxury", desc: "5-star & boutique" },
];

interface PlanFormProps {
  onSubmit: (data: TravelRequest) => void;
  initialValues?: TravelRequest | null;
  initialDestination?: string;
}

interface StopState {
  destination: string;
  nights: string;
}

interface FormState {
  destination: string;
  /** Multi-city trips: two or more cities in travel order; empty for one destination. */
  stops: StopState[];
  origin: string;
  start_date: string;
  end_date: string;
  budget: string;
  currency: string;
  travelers: string;
  interests: string[];
  pace: Pace;
  accommodation: Accommodation;
}

function toFormState(initial?: TravelRequest | null, destination?: string): FormState {
  const stops = destination ? [] : (initial?.stops ?? []);
  return {
    destination: destination ?? (stops.length > 1 ? "" : initial?.destination ?? ""),
    stops: stops.length > 1 ? stops.map((s) => ({ destination: s.destination, nights: String(s.nights) })) : [],
    origin: initial?.origin ?? "",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    // No default amount: a sensible number depends on the currency.
    budget: initial?.budget ? String(initial.budget) : "",
    currency: initial?.currency ?? detectCurrency(),
    travelers: String(initial?.travelers ?? 2),
    interests: (initial?.preferences.interests ?? []).map((i) => i.charAt(0).toUpperCase() + i.slice(1)),
    pace: initial?.preferences.pace ?? "moderate",
    accommodation: initial?.preferences.accommodation ?? "mid-range",
  };
}

function tripNights(form: FormState): number | null {
  return form.start_date && form.end_date && form.end_date >= form.start_date ? daysBetween(form.start_date, form.end_date) : null;
}

/** Once the dates are known, share the nights between route cities the user hasn't filled in yet. */
function withSplitNights(form: FormState): FormState {
  const nights = tripNights(form);
  if (form.stops.length === 0 || nights === null || nights < form.stops.length || form.stops.some((s) => s.nights.trim())) return form;
  const base = Math.floor(nights / form.stops.length);
  const extra = nights % form.stops.length;
  return { ...form, stops: form.stops.map((s, i) => ({ ...s, nights: String(base + (i < extra ? 1 : 0)) })) };
}

function validate(form: FormState, today: string): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.stops.length > 0) {
    const nights = tripNights(form);
    const assigned = form.stops.reduce((sum, s) => sum + (Number(s.nights) || 0), 0);
    if (form.stops.some((s) => s.destination.trim().length < 2)) errors.stops = "Name every city on the route.";
    else if (form.stops.some((s) => !Number.isInteger(Number(s.nights)) || Number(s.nights) < 1))
      errors.stops = "Each city needs at least one night.";
    else if (nights !== null && assigned !== nights)
      errors.stops = `The nights add up to ${assigned}, but the trip has ${nights} night${nights === 1 ? "" : "s"}.`;
  } else if (form.destination.trim().length < 2) errors.destination = "Where are you going?";
  if (!form.start_date) errors.start_date = "Pick a start date.";
  else if (form.start_date < today) errors.start_date = "Start date can't be in the past.";
  if (!form.end_date) errors.end_date = "Pick an end date.";
  else if (form.start_date && form.end_date < form.start_date) errors.end_date = "End date must be after the start date.";
  else if (form.start_date && daysBetween(form.start_date, form.end_date) + 1 > MAX_TRIP_DAYS)
    errors.end_date = `Trips can be at most ${MAX_TRIP_DAYS} days.`;
  const budget = Number(form.budget);
  if (!form.budget.trim()) errors.budget = "What can you spend in total?";
  else if (!Number.isFinite(budget) || budget <= 0) errors.budget = "Enter an amount above zero.";
  else if (budget > 1e12) errors.budget = "That's a bit much.";
  const travelers = Number(form.travelers);
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 10) errors.travelers = "1 to 10 travelers.";
  return errors;
}

export default function PlanForm({ onSubmit, initialValues, initialDestination }: PlanFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues, initialDestination));
  const [submitted, setSubmitted] = useState(false);
  const today = useMemo(() => toISODate(new Date()), []);
  const errors = validate(form, today);
  const shown = submitted ? errors : {};

  const tripDays =
    form.start_date && form.end_date && form.end_date >= form.start_date
      ? daysBetween(form.start_date, form.end_date) + 1
      : null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return key === "start_date" || key === "end_date" ? withSplitNights(next) : next;
    });

  const nights = tripNights(form);
  const assignedNights = form.stops.reduce((sum, s) => sum + (Number(s.nights) || 0), 0);

  const updateStop = (index: number, patch: Partial<StopState>) =>
    setForm((prev) => ({ ...prev, stops: prev.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));

  const addStop = () =>
    setForm((prev) => {
      const current = prev.stops.length > 0 ? prev.stops : [{ destination: prev.destination, nights: "" }];
      const used = current.reduce((sum, s) => sum + (Number(s.nights) || 0), 0);
      const left = nights === null ? "" : String(Math.max(1, nights - used));
      // Starting a route: split the nights between the first two cities.
      if (prev.stops.length === 0 && nights !== null && nights >= 2) {
        const first = Math.ceil(nights / 2);
        return { ...prev, stops: [{ destination: prev.destination, nights: String(first) }, { destination: "", nights: String(nights - first) }] };
      }
      return { ...prev, stops: [...current, { destination: "", nights: left }] };
    });

  const removeStop = (index: number) =>
    setForm((prev) => {
      const stops = prev.stops.filter((_, i) => i !== index);
      // Back to one city: it's a plain destination again.
      return stops.length === 1 ? { ...prev, destination: stops[0].destination, stops: [] } : { ...prev, stops };
    });

  const toggleInterest = (interest: string) =>
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest) ? prev.interests.filter((i) => i !== interest) : [...prev.interests, interest],
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    const stops = form.stops.map((s) => ({ destination: s.destination.trim(), nights: Number(s.nights) }));
    onSubmit({
      // For a route the server sets the destination to "A → B → C" itself.
      destination: stops.length > 0 ? stops.map((s) => s.destination).join(" → ") : form.destination.trim(),
      ...(stops.length > 0 ? { stops } : {}),
      origin: form.origin.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date,
      budget: Number(form.budget),
      currency: form.currency,
      travelers: Number(form.travelers),
      preferences: {
        interests: form.interests.map((i) => i.toLowerCase()),
        pace: form.pace,
        accommodation: form.accommodation,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-12">
      <FormSection number="01" title="Where and when">
        <div className="grid gap-8 sm:grid-cols-2">
          {form.stops.length === 0 ? (
            <Field id="destination" label="Destination" error={shown.destination} className="sm:col-span-2">
              <input
                id="destination"
                placeholder="Kyoto, Japan"
                value={form.destination}
                onChange={(e) => update("destination", e.target.value)}
                maxLength={100}
                autoComplete="off"
                aria-invalid={!!shown.destination}
                className={cn(inputClass, "font-serif text-3xl")}
              />
            </Field>
          ) : (
            <fieldset className="sm:col-span-2">
              <legend className="eyebrow text-ink-muted">Route</legend>
              <ol className="mt-2 space-y-4">
                {form.stops.map((stop, index) => (
                  <li key={index} className="flex items-end gap-3">
                    <span className="mb-2 w-6 shrink-0 font-serif text-lg text-terracotta" aria-hidden>
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`stop-${index}`} className="sr-only">
                        City {index + 1}
                      </label>
                      <input
                        id={`stop-${index}`}
                        placeholder={index === 0 ? "Tokyo, Japan" : "Kyoto, Japan"}
                        value={stop.destination}
                        onChange={(e) => updateStop(index, { destination: e.target.value })}
                        maxLength={60}
                        autoComplete="off"
                        aria-invalid={!!shown.stops && stop.destination.trim().length < 2}
                        className={cn(inputClass, "font-serif text-2xl")}
                      />
                    </div>
                    <div className="w-20 shrink-0">
                      <label htmlFor={`stop-nights-${index}`} className="text-xs text-ink-muted">
                        Nights
                      </label>
                      <input
                        id={`stop-nights-${index}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={30}
                        value={stop.nights}
                        onChange={(e) => updateStop(index, { nights: e.target.value })}
                        className={cn(inputClass, "tabular-nums")}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStop(index)}
                      aria-label={`Remove ${stop.destination || `city ${index + 1}`}`}
                      className="mb-2 rounded-full p-1.5 text-ink-muted hover:bg-rule/60 hover:text-terracotta"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
              {shown.stops ? (
                <p className="mt-3 text-sm text-terracotta" role="alert">{shown.stops}</p>
              ) : (
                <p className="mt-3 text-sm text-ink-muted" aria-live="polite">
                  {nights === null
                    ? "Pick your dates, then split the nights between the cities."
                    : `${assignedNights} of ${nights} night${nights === 1 ? "" : "s"} assigned. You travel on to the next city on the morning after your last night.`}
                </p>
              )}
            </fieldset>
          )}
          {form.stops.length < MAX_STOPS && (
            <div className="sm:col-span-2 -mt-4">
              <button
                type="button"
                onClick={addStop}
                className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-terracotta transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {form.stops.length === 0 ? "Add another city (multi-city trip)" : "Add a city"}
              </button>
            </div>
          )}
          <Field id="start_date" label="From" error={shown.start_date}>
            <input
              id="start_date"
              type="date"
              min={today}
              value={form.start_date}
              onChange={(e) => update("start_date", e.target.value)}
              aria-invalid={!!shown.start_date}
              className={inputClass}
            />
          </Field>
          <Field
            id="end_date"
            label="To"
            error={shown.end_date}
            hint={tripDays ? `${tripDays} day${tripDays === 1 ? "" : "s"} · ${tripDays - 1} night${tripDays === 2 ? "" : "s"}` : undefined}
          >
            <input
              id="end_date"
              type="date"
              min={form.start_date || today}
              value={form.end_date}
              onChange={(e) => update("end_date", e.target.value)}
              aria-invalid={!!shown.end_date}
              className={inputClass}
            />
          </Field>
          <Field id="origin" label="Flying from" hint="Optional: adds flight estimates" className="sm:col-span-2">
            <input
              id="origin"
              placeholder="San Francisco"
              value={form.origin}
              onChange={(e) => update("origin", e.target.value)}
              maxLength={100}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection number="02" title="Who and how much">
        <div className="grid gap-8 sm:grid-cols-2">
          <Field id="travelers" label="Travelers" error={shown.travelers}>
            <input
              id="travelers"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              value={form.travelers}
              onChange={(e) => update("travelers", e.target.value)}
              aria-invalid={!!shown.travelers}
              className={inputClass}
            />
          </Field>
          <Field id="budget" label="Total budget" error={shown.budget} hint="For the whole group: flights, stay, food, fun">
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-xl text-ink-muted" aria-hidden>{currencySymbol(form.currency)}</span>
              <input
                id="budget"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Amount"
                value={form.budget}
                onChange={(e) => update("budget", e.target.value)}
                aria-invalid={!!shown.budget}
                className={inputClass}
              />
              <label htmlFor="currency" className="sr-only">Currency</label>
              <select
                id="currency"
                value={form.currency}
                onChange={(e) => update("currency", e.target.value)}
                className="shrink-0 border-b border-ink/30 bg-transparent pb-2 pt-1 text-lg text-ink focus:border-terracotta focus:outline-none"
              >
                {CURRENCIES.some((c) => c.code === form.currency) ? null : <option value={form.currency}>{form.currency}</option>}
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>
      </FormSection>

      <FormSection number="03" title="What you're into">
        <fieldset>
          <legend className="sr-only">Interests</legend>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((interest) => {
              const selected = form.interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleInterest(interest)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-colors",
                    selected ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:border-ink"
                  )}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </fieldset>

        <ChoiceGroup legend="Pace" name="pace" options={PACE_OPTIONS} value={form.pace} onChange={(v) => update("pace", v as Pace)} />
        <ChoiceGroup
          legend="Where you'll stay"
          name="accommodation"
          options={ACCOMMODATION_OPTIONS}
          value={form.accommodation}
          onChange={(v) => update("accommodation", v as Accommodation)}
        />
      </FormSection>

      <div className="border-t-2 border-ink pt-8">
        {submitted && Object.keys(errors).length > 0 && (
          <p role="alert" className="mb-4 text-sm text-terracotta">
            A few details need attention above.
          </p>
        )}
        <button
          type="submit"
          className="group inline-flex w-full sm:w-auto items-center justify-center gap-3 rounded-full bg-terracotta px-8 py-4 text-lg font-medium text-paper hover:bg-terracotta-dark transition-colors"
        >
          Brief the agents
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </button>
        <p className="mt-3 text-sm text-ink-muted">Takes about a minute. You can watch it happen.</p>
      </div>
    </form>
  );
}

const inputClass =
  "w-full bg-transparent border-b border-ink/30 pb-2 pt-1 text-lg text-ink placeholder:text-ink/30 focus:border-terracotta focus:outline-none transition-colors aria-[invalid=true]:border-terracotta";

function FormSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 md:grid-cols-[9rem_1fr]">
      <div className="border-t border-ink pt-3">
        <p className="font-serif text-terracotta">{number}</p>
        <h2 className="mt-1 text-xl text-ink">{title}</h2>
      </div>
      <div className="space-y-8 md:border-t md:border-rule md:pt-4">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow text-ink-muted">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-2 text-sm text-terracotta" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function ChoiceGroup({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { value: string; title: string; desc: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="eyebrow text-ink-muted mb-3">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-sm border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-terracotta",
              value === option.value ? "border-terracotta bg-terracotta-light/60" : "border-rule hover:border-ink/50"
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="block font-serif text-lg text-ink">{option.title}</span>
            <span className="mt-1 block text-sm text-ink-muted">{option.desc}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
