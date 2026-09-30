"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { formatDate, shortRoute } from "@/lib/format";
import { listOffline, subscribeOffline, type OfflineEntry } from "@/lib/offline";

/** Shown by the service worker when a page can't load without a connection. */
export default function OfflinePage() {
  const [saved, setSaved] = useState<OfflineEntry[]>([]);

  useEffect(() => {
    const refresh = () => setSaved(listOffline());
    refresh();
    return subscribeOffline(refresh);
  }, []);

  return (
    <div className="container max-w-2xl py-20">
      <WifiOff className="h-8 w-8 text-terracotta" aria-hidden />
      <h1 className="mt-6 text-4xl text-ink md:text-5xl">You&apos;re offline</h1>
      <p className="mt-4 text-ink-soft">
        Planning needs a connection, but trips you saved for offline use still open.
      </p>
      {saved.length > 0 ? (
        <ul className="mt-10 divide-y divide-rule border-y border-rule">
          {saved.map((trip) => (
            <li key={trip.id}>
              <Link href={`/results?id=${trip.id}`} className="flex items-baseline justify-between gap-4 py-4 hover:text-terracotta">
                <span className="font-serif text-xl text-ink">{shortRoute(trip.destination)}</span>
                <span className="text-sm text-ink-muted">
                  {formatDate(trip.start_date)} – {formatDate(trip.end_date, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 border-l-4 border-ochre bg-ochre-light/50 px-4 py-3 text-sm text-ink">
          No trips saved on this device yet. Next time you&apos;re online, open a trip and choose <strong>Save offline</strong>.
        </p>
      )}
    </div>
  );
}
