// Trips saved for offline use: the full plan JSON in localStorage, plus the
// service worker (public/sw.js) caching the app's pages and assets. Together
// they let a saved itinerary open with no signal.

import type { TravelPlan } from "@/lib/types";

const PREFIX = "offlinePlan:";
const INDEX_KEY = "offlinePlans:v1";
const CHANGE_EVENT = "offline-plans-change";
// Plans are ~50-150 KB; keep well inside the ~5 MB localStorage budget.
const MAX_SAVED = 12;

export interface OfflineEntry {
  id: string;
  root_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  saved_at: string;
}

function readIndex(): OfflineEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: OfflineEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function listOffline(): OfflineEntry[] {
  return readIndex();
}

export function getOfflinePlan(id: string): TravelPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as TravelPlan) : null;
  } catch {
    return null;
  }
}

/** The offline copy of any version of this trip, if one is saved. */
export function offlineEntryForTrip(plan: TravelPlan): OfflineEntry | null {
  const root = plan.root_id ?? plan.id;
  return readIndex().find((e) => e.root_id === root || e.id === plan.id) ?? null;
}

/**
 * Save a plan for offline use, replacing any older version of the same trip.
 * Returns false if the browser refused (storage full or disabled).
 */
export function saveOffline(plan: TravelPlan): boolean {
  const root = plan.root_id ?? plan.id;
  const entries = readIndex();
  const replaced = entries.filter((e) => e.root_id === root || e.id === plan.id);
  const kept = entries.filter((e) => !replaced.includes(e));
  try {
    localStorage.setItem(PREFIX + plan.id, JSON.stringify(plan));
    replaced.filter((e) => e.id !== plan.id).forEach((e) => localStorage.removeItem(PREFIX + e.id));
    const entry: OfflineEntry = {
      id: plan.id,
      root_id: root,
      destination: plan.trip.destination,
      start_date: plan.trip.start_date,
      end_date: plan.trip.end_date,
      saved_at: new Date().toISOString(),
    };
    const next = [entry, ...kept];
    next.slice(MAX_SAVED).forEach((e) => localStorage.removeItem(PREFIX + e.id));
    writeIndex(next.slice(0, MAX_SAVED));
  } catch {
    return false;
  }
  // Warm the service worker's cache with the page shell so it opens offline.
  navigator.serviceWorker?.controller?.postMessage({ type: "cache-urls", urls: ["/results", "/trips", "/offline"] });
  return true;
}

export function subscribeOffline(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === INDEX_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}
