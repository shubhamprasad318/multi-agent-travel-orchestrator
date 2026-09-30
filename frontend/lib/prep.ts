// Getting ready for a trip: the packing list (from the weather agent) plus
// reminders worked out from the plan itself (dates, flights, hotels, currency).
// Checked state is keyed by stable strings so it survives new plan versions.

import { daysBetween, toISODate } from "@/lib/format";
import type { PackingCategory, PackingItem, TravelPlan } from "@/lib/types";

export const PACKING_LABEL: Record<PackingCategory, string> = {
  documents: "Documents",
  clothing: "Clothing",
  gear: "Gear",
  health: "Health",
  tech: "Tech",
  other: "Other",
};

export const PACKING_ORDER: PackingCategory[] = ["documents", "clothing", "gear", "health", "tech", "other"];

export const packingKey = (item: string) => `item:${item.trim().toLowerCase()}`;

/** Categorised items; plans made before categories existed get "other". */
export function packingItems(plan: TravelPlan): PackingItem[] {
  const weather = plan.weather;
  if (!weather) return [];
  if (weather.packing_items && weather.packing_items.length > 0) return weather.packing_items;
  return weather.packing_list.map((item) => ({ item, category: "other", reason: null }));
}

export interface Reminder {
  id: string;
  title: string;
  detail?: string;
  /** YYYY-MM-DD: when to do it (never before today). */
  due: string;
  href?: string;
}

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

/** Pre-trip to-dos, soonest first. `today` is YYYY-MM-DD in the traveller's time zone. */
export function reminders(plan: TravelPlan, today: string): Reminder[] {
  const start = plan.trip.start_date;
  const due = (daysBefore: number) => {
    const date = shift(start, -daysBefore);
    return date < today ? today : date;
  };
  const list: Reminder[] = [];
  const flight = plan.bookings?.flights[0];
  const hotels = plan.bookings?.hotels ?? [];
  const transfers = plan.bookings?.transfers ?? [];

  if (plan.trip.origin) {
    list.push({
      id: "passport",
      title: "Check passports and visas",
      detail: "Passports often need 6 months of validity left; some countries need a visa or e-visa arranged in advance.",
      due: due(60),
    });
  }
  if (flight) {
    list.push({
      id: "book-flights",
      title: `Book flights to ${plan.trip.destination.split(" → ")[0].split(",")[0]}`,
      detail: flight.price_source === "recent_fare" ? "Recent fares are shown on the Flights & hotels tab." : "Estimates are on the Flights & hotels tab.",
      due: due(45),
      href: flight.search_url,
    });
  }
  hotels
    .filter((h, i, all) => all.findIndex((x) => (x.city ?? null) === (h.city ?? null)) === i)
    .forEach((hotel) =>
      list.push({
        id: `book-hotel:${(hotel.city ?? "stay").toLowerCase()}`,
        title: hotel.city ? `Book your stay in ${hotel.city.split(",")[0]}` : "Book your stay",
        detail: `${hotel.name}, ${hotel.area}`,
        due: due(30),
        href: hotel.search_url,
      })
    );
  transfers.forEach((t) =>
    list.push({
      id: `book-transfer:${t.from_city.toLowerCase()}-${t.to_city.toLowerCase()}`,
      title: `Book the ${t.mode} from ${t.from_city.split(",")[0]} to ${t.to_city.split(",")[0]}`,
      detail: t.notes ?? `${t.duration} on ${t.date}`,
      due: due(14),
    })
  );
  list.push({
    id: "insurance",
    title: "Get travel insurance",
    detail: "Best bought soon after booking, so cancellations are covered.",
    due: due(30),
  });
  if (plan.money?.local_currency && plan.money.local_currency !== plan.money.currency) {
    list.push({
      id: "currency",
      title: `Sort out ${plan.money.local_currency}`,
      detail: "Tell your bank you're travelling, and get a card without foreign fees or a little local cash.",
      due: due(7),
    });
  }
  list.push({ id: "offline", title: "Save the trip for offline use", detail: "So the itinerary opens without signal.", due: due(2) });
  list.push({ id: "weather-check", title: "Check the latest forecast", detail: "Re-plan any day the weather ruins.", due: due(3) });
  if (flight) {
    list.push({ id: "check-in", title: "Check in for your flight", detail: "Usually opens 24–48 hours before departure.", due: due(1) });
  }
  return list.sort((a, b) => a.due.localeCompare(b.due));
}

/** "in 12 days", "tomorrow", "today", "3 days ago". */
export function relativeDay(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1) return `in ${diff} days`;
  return diff === -1 ? "yesterday" : `${-diff} days ago`;
}
