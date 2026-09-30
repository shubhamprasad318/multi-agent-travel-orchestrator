import type { DayPlan, Itinerary, Slot } from "@/lib/types";

// Draft model for the itinerary editor. dnd-kit needs stable, unique ids for
// every draggable item and container. Stops keep their server ids through an
// edit (so votes and comments stay attached); new stops get a fresh random id.

export type EditSlot = Slot & { id: string };
export type EditDay = Omit<DayPlan, "slots"> & { slots: EditSlot[] };

export const newSlotId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const containerId = (day: number) => `day-${day}`;
export const isContainerId = (id: string) => id.startsWith("day-");
export const dayFromContainerId = (id: string) => Number(id.slice("day-".length));

export function toDraft(itinerary: Itinerary): EditDay[] {
  return itinerary.days.map((day) => ({
    ...day,
    meals: day.meals.map((m) => ({ ...m })),
    backup_options: [...day.backup_options],
    slots: day.slots.map((slot) => ({ ...slot, id: slot.id ?? newSlotId() })),
  }));
}

export function dayTotal(day: EditDay): number {
  return day.slots.reduce((sum, s) => sum + s.cost, 0) + day.meals.reduce((sum, m) => sum + m.cost, 0);
}

export function tripTotal(days: EditDay[]): number {
  return days.reduce((sum, day) => sum + dayTotal(day), 0);
}

/** Back to the API shape. The server recomputes dates and totals anyway. */
export function fromDraft(days: EditDay[], original: Itinerary): Itinerary {
  return {
    highlights: original.highlights,
    tips: original.tips,
    days: days.map((day) => ({
      ...day,
      theme: day.theme.trim() || `Day ${day.day}`,
      total_cost: Math.round(dayTotal(day) * 100) / 100,
      slots: day.slots.map((slot) => ({ ...slot, activity: slot.activity.trim(), cost: Math.max(0, slot.cost) })),
    })),
  };
}

/** Stable comparison key: ignores ids, which don't change what the plan says. */
export function signature(days: EditDay[]): string {
  return JSON.stringify(
    days.map((d) => ({
      theme: d.theme,
      slots: d.slots.map((s) => [s.period, s.start_time, s.activity, s.location, Math.round(s.cost * 100), s.lat, s.lng]),
    }))
  );
}

export function findDayIndex(days: EditDay[], id: string): number {
  if (isContainerId(id)) return days.findIndex((d) => d.day === dayFromContainerId(id));
  return days.findIndex((d) => d.slots.some((s) => s.id === id));
}
