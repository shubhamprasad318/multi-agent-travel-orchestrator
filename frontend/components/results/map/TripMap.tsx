"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { formatUSD } from "@/lib/format";
import type { DayPlan } from "@/lib/types";
import { dayColor } from "./colors";

interface Stop {
  day: number;
  index: number;
  lat: number;
  lng: number;
  activity: string;
  location: string;
  time: string;
  cost: number;
}

function stopIcon(stop: Stop) {
  // Inline HTML icon: avoids Leaflet's default marker images, which break under bundlers.
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
    html: `<div style="background:${dayColor(stop.day)};width:30px;height:30px;border-radius:9999px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);color:white;font:600 12px/26px system-ui;text-align:center">${stop.day}.${stop.index}</div>`,
  });
}

function FitBounds({ stops }: { stops: Stop[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length === 0) return;
    const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, stops]);
  return null;
}

export function stopsFor(days: DayPlan[]): Stop[] {
  return days.flatMap((day) =>
    day.slots
      .filter((slot) => slot.lat !== null && slot.lng !== null)
      .map((slot, i) => ({
        day: day.day,
        index: i + 1,
        lat: slot.lat as number,
        lng: slot.lng as number,
        activity: slot.activity,
        location: slot.location,
        time: slot.start_time,
        cost: slot.cost,
      }))
  );
}

export default function TripMap({ days }: { days: DayPlan[] }) {
  const stops = useMemo(() => stopsFor(days), [days]);
  const routes = useMemo(() => {
    const byDay = new Map<number, [number, number][]>();
    for (const stop of stops) byDay.set(stop.day, [...(byDay.get(stop.day) ?? []), [stop.lat, stop.lng]]);
    return [...byDay.entries()];
  }, [stops]);

  const centre: [number, number] = stops.length ? [stops[0].lat, stops[0].lng] : [20, 0];

  return (
    <MapContainer center={centre} zoom={12} scrollWheelZoom={false} className="h-[480px] w-full z-0 border border-rule">
      <TileLayer
        // Muted CARTO "Positron" basemap so the coloured day routes stand out.
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds stops={stops} />
      {routes.map(([day, points]) => (
        <Polyline key={day} positions={points} pathOptions={{ color: dayColor(day), weight: 4, opacity: 0.8, dashArray: "6 8" }} />
      ))}
      {stops.map((stop) => (
        <Marker key={`${stop.day}-${stop.index}`} position={[stop.lat, stop.lng]} icon={stopIcon(stop)}>
          <Popup>
            <strong>
              Day {stop.day} · {stop.time}
            </strong>
            <br />
            {stop.activity}
            <br />
            <span style={{ color: "#6b7280" }}>
              {stop.location} · {stop.cost > 0 ? formatUSD(stop.cost) : "Free"}
            </span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
