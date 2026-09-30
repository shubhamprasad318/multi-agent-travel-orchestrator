import { formatUSD } from "@/lib/format";
import type { BookingsResult } from "@/lib/types";
import { BulletList, EmptyState, ExternalLink, Section } from "./shared";

function UsedInBudget() {
  return <span className="ml-2 align-middle text-[10px] uppercase tracking-eyebrow text-teal">In budget</span>;
}

export default function BookingsSection({ bookings }: { bookings: BookingsResult | null }) {
  if (!bookings) return <EmptyState message="Booking suggestions are unavailable for this plan." />;

  return (
    <Section eyebrow="Getting there & staying" title="Flights and hotels">
      {bookings.prices_are_estimates && (
        <p className="mb-10 max-w-2xl border-l-2 border-ochre pl-4 text-sm text-ink-soft">
          Prices are estimates for your dates, not live fares. Follow the links to see real-time prices and availability.
        </p>
      )}

      <div className="grid gap-14 lg:grid-cols-2">
        <div>
          <h3 className="text-2xl text-ink">Flights</h3>
          {bookings.flights.length === 0 ? (
            <p className="mt-4 text-ink-muted">No flight estimates. Add a departure city when planning to get them.</p>
          ) : (
            <ul className="mt-4 divide-y divide-rule border-t border-rule">
              {bookings.flights.map((flight, i) => (
                <li key={i} className="py-5">
                  <div className="flex items-baseline">
                    <span className="font-serif text-xl text-ink">
                      {flight.airline}
                      {i === 0 && <UsedInBudget />}
                    </span>
                    <span className="leader" aria-hidden />
                    <span className="font-serif text-xl tabular-nums text-ink">{formatUSD(flight.total_price)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {flight.departure_airport} → {flight.arrival_airport} · {flight.duration} ·{" "}
                    {flight.stops === 0 ? "non-stop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`} ·{" "}
                    {formatUSD(flight.price_per_person)} per person, return
                  </p>
                  <ExternalLink href={flight.search_url} className="mt-2">Live prices on Google Flights</ExternalLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-2xl text-ink">Where to stay</h3>
          {bookings.hotels.length === 0 ? (
            <p className="mt-4 text-ink-muted">No accommodation needed for a same-day trip.</p>
          ) : (
            <ul className="mt-4 divide-y divide-rule border-t border-rule">
              {bookings.hotels.map((hotel, i) => (
                <li key={i} className="py-5">
                  <div className="flex items-baseline">
                    <span className="font-serif text-xl text-ink">
                      {hotel.name}
                      {i === 0 && <UsedInBudget />}
                    </span>
                    <span className="leader" aria-hidden />
                    <span className="font-serif text-xl tabular-nums text-ink">{formatUSD(hotel.total_price)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {hotel.area} · {hotel.type}
                    {hotel.rating !== null && ` · ${hotel.rating.toFixed(1)}★`} · {formatUSD(hotel.price_per_night)}/night × {hotel.nights}
                    {hotel.rooms > 1 && ` × ${hotel.rooms} rooms`}
                  </p>
                  {hotel.amenities.length > 0 && <p className="mt-1 text-sm text-ink-soft">{hotel.amenities.join(" · ")}</p>}
                  <ExternalLink href={hotel.search_url} className="mt-2">Availability on Booking.com</ExternalLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {bookings.notes.length > 0 && <BulletList items={bookings.notes} className="mt-10 text-sm" />}
    </Section>
  );
}
