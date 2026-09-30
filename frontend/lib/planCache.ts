import { recordTrip } from "@/lib/tripsIndex";
import type { TravelPlan } from "@/lib/types";

// Session cache so the results page renders instantly after planning; the
// backend (GET /api/v1/plans/:id) remains the source of truth for shared links.
const key = (id: string) => `travelPlan:${id}`;

export function cachePlan(plan: TravelPlan): void {
  try {
    sessionStorage.setItem(key(plan.id), JSON.stringify(plan));
  } catch {
    /* quota exceeded or storage disabled */
  }
  // Every plan the user opens also appears on the "My trips" page.
  recordTrip(plan);
}

export function getCachedPlan(id: string): TravelPlan | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as TravelPlan) : null;
  } catch {
    return null;
  }
}
