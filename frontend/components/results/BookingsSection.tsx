import { formatDate } from "@/lib/format";
import { Price, useMoney } from "@/lib/money";
import type { BookingsResult, Flight, Hotel } from "@/lib/types";
import { BulletList, EmptyState, ExternalLink, LeaderRow, Section } from "./shared";

function UsedInBudget() {
  return <span className="ml-2 align-middle text-[10px] uppercase tracking-eyebrow text-teal">In budget</span>;
}

function RecentFare() {
  return (
    <span
      className="ml-2 rounded-full bg-teal-light px-2 py-0.5 align-middle text-[10px] uppercase tracking-eyebrow text-teal-dark"
      title="A real fare other travellers found for this route in the last few days"
    >
      Recent fare
    </span>
  );
}

function FlightItem({ flight, budgeted }: { flight: Flight; budgeted: boolean }) {
  const money = useMoney();
  const recent = flight.price_source === "recent_fare";
  return (
    <li className="py-5">
      <div className="flex items-baseline">
        <span className="font-serif text-xl text-ink">
          {flight.airline}
          {recent && <RecentFare />}
          {budgeted && <UsedInBudget />}
        </span>
        <span className="leader" aria-hidden />
        <Price usd={flight.total_price} className="font-serif text-xl text-ink" localClassName="font-sans" />
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {flight.departure_airport} → {flight.arrival_airport} · {flight.duration} ·{" "}
        {flight.stops === 0 ? "non-stop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`} ·{" "}
        {money.format(flight.price_per_person)} per person, return
      </p>
      {recent && flight.departure_at && (
        <p className="mt-1 text-sm text-ink-soft">
          Found for {formatDate(flight.departure_at)}
          {flight.return_at && ` – ${formatDate(flight.return_at)}`}
        </p>
      )}
      <ExternalLink href={flight.search_url} className="mt-2">
        {recent ? "See this fare on Aviasales" : "Live prices on Google Flights"}
      </ExternalLink>
    </li>
  );
}

function HotelItem({ hotel, budgeted }: { hotel: Hotel; budgeted: boolean }) {
  const money = useMoney();
  return (
    <li className="py-5">
      <div className="flex items-baseline">
        <span className="font-serif text-xl text-ink">
          {hotel.name}
          {budgeted && <UsedInBudget />}
        </span>
        <span className="leader" aria-hidden />
        <Price usd={hotel.total_price} className="font-serif text-xl text-ink" localClassName="font-sans" />
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {hotel.area} · {hotel.type}
        {hotel.rating !== null && ` · ${hotel.rating.toFixed(1)}★`} · {money.format(hotel.price_per_night)}/night × {hotel.nights}
        {hotel.rooms > 1 && ` × ${hotel.rooms} rooms`}
      </p>
      {hotel.amenities.length > 0 && <p className="mt-1 text-sm text-ink-soft">{hotel.amenities.join(" · ")}</p>}
      <ExternalLink href={hotel.search_url} className="mt-2">Availability on Booking.com</ExternalLink>
    </li>
  );
}

/** Hotels grouped by city (multi-city trips), in route order; the first in each city is budgeted. */
function groupByCity(hotels: Hotel[]): { city: string | null; hotels: Hotel[] }[] {
  const groups: { city: string | null; hotels: Hotel[] }[] = [];
  for (const hotel of hotels) {
    const city = hotel.city ?? null;
    const group = groups.find((g) => g.city === city);
    if (group) group.hotels.push(hotel);
    else groups.push({ city, hotels: [hotel] });
  }
  return groups;
}

export default function BookingsSection({ bookings }: { bookings: BookingsResult | null }) {
  if (!bookings) return <EmptyState message="Booking suggestions are unavailable for this plan." />;
  const transfers = bookings.transfers ?? [];
  const hotelGroups = groupByCity(bookings.hotels);
  const hasRecentFares = bookings.flights.some((f) => f.price_source === "recent_fare");

  return (
    <Section eyebrow="Getting there & staying" title={transfers.length > 0 ? "Flights, trains and hotels" : "Flights and hotels"}>
      {bookings.prices_are_estimates && (
        <p className="mb-10 max-w-2xl border-l-2 border-ochre pl-4 text-sm text-ink-soft">
          {hasRecentFares
            ? "Flights marked “recent fare” are real prices other travellers found in the last few days; the rest are estimates. "
            : "Prices are estimates for your dates, not live fares. "}
          Follow the links to see real-time prices and availability.
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
                <FlightItem key={i} flight={flight} budgeted={i === 0} />
              ))}
            </ul>
          )}

          {transfers.length > 0 && (
            <>
              <h3 className="mt-14 text-2xl text-ink">Between cities</h3>
              <ul className="mt-4 divide-y divide-rule border-t border-rule">
                {transfers.map((t) => (
                  <li key={`${t.from_city}-${t.to_city}`} className="py-5">
                    <LeaderRow
                      label={
                        <span className="font-serif text-xl text-ink">
                          {t.from_city.split(",")[0]} → {t.to_city.split(",")[0]}
                          <UsedInBudget />
                        </span>
                      }
                      value={<Price usd={t.cost} className="font-serif text-xl text-ink" localClassName="font-sans" />}
                    />
                    <p className="mt-1 text-sm text-ink-muted">
                      {formatDate(t.date, { weekday: "short", month: "short", day: "numeric" })} · <span className="capitalize">{t.mode}</span> ·{" "}
                      {t.duration} · whole group
                    </p>
                    {t.notes && <p className="mt-1 text-sm text-ink-soft">{t.notes}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div>
          <h3 className="text-2xl text-ink">Where to stay</h3>
          {bookings.hotels.length === 0 ? (
            <p className="mt-4 text-ink-muted">No accommodation needed for a same-day trip.</p>
          ) : (
            hotelGroups.map((group) => (
              <div key={group.city ?? "all"} className={group.city ? "mt-6" : undefined}>
                {group.city && <p className="eyebrow text-ink-muted">{group.city}</p>}
                <ul className="mt-4 divide-y divide-rule border-t border-rule">
                  {group.hotels.map((hotel, i) => (
                    <HotelItem key={`${hotel.name}-${i}`} hotel={hotel} budgeted={i === 0} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>

      {bookings.notes.length > 0 && <BulletList items={bookings.notes} className="mt-10 text-sm" />}
    </Section>
  );
}
