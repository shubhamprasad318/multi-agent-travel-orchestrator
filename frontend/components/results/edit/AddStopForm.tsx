"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useMoney } from "@/lib/money";
import type { Slot } from "@/lib/types";

const inputClass =
  "w-full border-b border-ink/30 bg-transparent pb-1 text-ink placeholder:text-ink/30 focus:border-terracotta focus:outline-none";

/** Inline "add a stop" form. New stops have no coordinates, so they don't appear on the map. */
export default function AddStopForm({ dayNumber, onAdd }: { dayNumber: number; onAdd: (slot: Slot) => void }) {
  const money = useMoney();
  const rate = money.convert(1) || 1;
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState("");
  const [location, setLocation] = useState("");
  const [time, setTime] = useState("");
  const [period, setPeriod] = useState<Slot["period"]>("afternoon");
  const [cost, setCost] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-soft link-underline hover:text-terracotta"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add a stop
      </button>
    );
  }

  const reset = () => {
    setActivity("");
    setLocation("");
    setTime("");
    setCost("");
    setOpen(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity.trim()) return;
    const amount = Number(cost);
    onAdd({
      activity: activity.trim(),
      location: location.trim(),
      start_time: time.trim() || { morning: "09:00", afternoon: "14:00", evening: "19:00" }[period],
      period,
      cost: Number.isFinite(amount) && amount > 0 ? amount / rate : 0,
      lat: null,
      lng: null,
    });
    reset();
  };

  return (
    <form onSubmit={submit} className="mt-3 border border-dashed border-rule bg-paper-deep/50 p-4" aria-label={`Add a stop to day ${dayNumber}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="eyebrow text-ink-muted">Activity</span>
          <input autoFocus value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Sunset at the harbour" className={`${inputClass} font-serif text-lg`} required />
        </label>
        <label>
          <span className="eyebrow text-ink-muted">Where</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Neighbourhood or place" className={inputClass} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label>
            <span className="eyebrow text-ink-muted">Time</span>
            <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="18:30" maxLength={12} className={inputClass} />
          </label>
          <label>
            <span className="eyebrow text-ink-muted">When</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Slot["period"])} className={`${inputClass} capitalize`}>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </label>
          <label>
            <span className="eyebrow text-ink-muted">{money.currency}</span>
            <input type="number" min={0} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" className={`${inputClass} tabular-nums`} />
          </label>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={!activity.trim()} className="rounded-full bg-ink px-4 py-1.5 text-sm text-paper hover:bg-terracotta disabled:opacity-40">
          Add stop
        </button>
        <button type="button" onClick={reset} className="text-sm text-ink-muted link-underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
