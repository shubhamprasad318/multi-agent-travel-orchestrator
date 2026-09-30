import type { BudgetStatus, MoneyInfo, TravelPlan, ValidationStatus } from "@/lib/types";

// A per-browser list of every plan the user has made or opened, stored as
// compact summaries so the "My trips" page renders without fetching plans.

const STORAGE_KEY = "tripsIndex:v1";
const CHANGE_EVENT = "trips-index-change";
const MAX_ENTRIES = 100;

export interface TripEntry {
  id: string;
  parent_id: string | null;
  version: number;
  destination: string;
  start_date: string;
  end_date: string;
  days: number;
  travelers: number;
  created_at: string;
  estimated_total_usd: number;
  total_budget_usd: number;
  budget_status: BudgetStatus;
  score: number | null;
  validation_status: ValidationStatus | null;
  money: MoneyInfo | null;
  hotel: string | null;
  activities: number;
  refinements: number;
}

function read(): TripEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as TripEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: TripEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* quota exceeded or storage disabled */
  }
}

export function toTripEntry(plan: TravelPlan): TripEntry {
  return {
    id: plan.id,
    parent_id: plan.parent_id ?? null,
    version: plan.version ?? 1,
    destination: plan.trip.destination,
    start_date: plan.trip.start_date,
    end_date: plan.trip.end_date,
    days: plan.trip.days,
    travelers: plan.trip.travelers,
    created_at: plan.created_at,
    estimated_total_usd: plan.budget.estimated_total,
    total_budget_usd: plan.budget.total_budget,
    budget_status: plan.budget.status,
    score: plan.validation?.overall_score ?? null,
    validation_status: plan.validation?.status ?? null,
    money: plan.money ?? null,
    hotel: plan.bookings?.hotels[0]?.name ?? null,
    activities: plan.activities?.activities.length ?? 0,
    refinements: plan.refinements?.length ?? 0,
  };
}

/** Insert or update the summary for a plan. */
export function recordTrip(plan: TravelPlan): void {
  const entry = toTripEntry(plan);
  const others = read().filter((e) => e.id !== entry.id);
  const next = [entry, ...others]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ENTRIES);
  write(next);
}

export function listTrips(): TripEntry[] {
  return read();
}

export function removeTrip(id: string): void {
  write(read().filter((e) => e.id !== id));
}

/** Calls `cb` whenever the index changes, in this tab or another. Returns an unsubscribe function. */
export function subscribeTrips(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

export interface TripFamily {
  /** Latest version (highest version number, then newest). */
  latest: TripEntry;
  /** All versions, newest first, including `latest`. */
  versions: TripEntry[];
}

/** Group entries linked by parent_id chains into one family per trip. */
export function groupFamilies(entries: TripEntry[]): TripFamily[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const rootOf = (entry: TripEntry): string => {
    let current = entry;
    const seen = new Set<string>();
    while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parent_id)!;
    }
    // A parent that is no longer in the index still identifies the family.
    return current.parent_id ?? current.id;
  };
  const families = new Map<string, TripEntry[]>();
  for (const entry of entries) {
    const root = rootOf(entry);
    families.set(root, [...(families.get(root) ?? []), entry]);
  }
  return [...families.values()].map((versions) => {
    const sorted = [...versions].sort((a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at));
    return { latest: sorted[0], versions: sorted };
  });
}
