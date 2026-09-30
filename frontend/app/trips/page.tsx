"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Cloud, Search } from "lucide-react";
import { SignInPrompt } from "@/components/layout/AccountMenu";
import CompareTrips from "@/components/trips/CompareTrips";
import TripCard from "@/components/trips/TripCard";
import { ApiError, deleteTravelPlan, listMyTrips, removeMember, saveTrips, unsaveTrip } from "@/lib/api";
import { useAuthEnabled, useUser } from "@/lib/auth";
import { toISODate } from "@/lib/format";
import { groupFamilies, listTrips, removeTrip, subscribeTrips, type TripEntry, type TripFamily } from "@/lib/tripsIndex";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "upcoming" | "cost";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "upcoming", label: "Upcoming" },
  { value: "cost", label: "Lowest cost" },
];

function sortFamilies(families: TripFamily[], sort: SortKey): TripFamily[] {
  const today = toISODate(new Date());
  return [...families].sort((x, y) => {
    const a = x.latest;
    const b = y.latest;
    if (sort === "cost") return a.estimated_total_usd - b.estimated_total_usd;
    if (sort === "upcoming") {
      const aFuture = a.end_date >= today;
      const bFuture = b.end_date >= today;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      // Soonest first for upcoming trips, most recent first for past ones.
      return aFuture ? a.start_date.localeCompare(b.start_date) : b.start_date.localeCompare(a.start_date);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

/**
 * Signed out: trips from this browser's history. Signed in: the account's trips
 * (own, shared with you, saved), after saving this browser's trips to the account.
 */
function useTrips(): { entries: TripEntry[]; loaded: boolean; synced: boolean; reload: () => void; loadError: string | null } {
  const user = useUser();
  const [local, setLocal] = useState<TripEntry[]>([]);
  const [remote, setRemote] = useState<TripEntry[] | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // localStorage is only available in the browser, so load after mount.
  useEffect(() => {
    const refresh = () => setLocal(listTrips());
    refresh();
    setLocalLoaded(true);
    return subscribeTrips(refresh);
  }, []);

  useEffect(() => {
    if (!user) {
      setRemote(null);
      return;
    }
    const controller = new AbortController();
    setLoadError(null);
    (async () => {
      try {
        let trips = await listMyTrips(controller.signal);
        const known = new Set(trips.map((t) => t.id));
        const unsynced = listTrips()
          .map((e) => e.id)
          .filter((id) => !known.has(id))
          .slice(0, 100);
        if (unsynced.length > 0) {
          await saveTrips(unsynced);
          trips = await listMyTrips(controller.signal);
        }
        setRemote(trips);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : "Couldn't load your trips.");
        setRemote(null);
      }
    })();
    return () => controller.abort();
  }, [user, version]);

  const signedInAndLoaded = user !== null && remote !== null;
  return {
    entries: signedInAndLoaded ? remote : local,
    // Signed in: wait for the account's list, unless it failed (then show this browser's).
    loaded: localLoaded && (user === null || remote !== null || loadError !== null),
    synced: signedInAndLoaded,
    reload: () => setVersion((v) => v + 1),
    loadError,
  };
}

export default function TripsPage() {
  const { entries, loaded, synced, reload, loadError } = useTrips();
  const user = useUser();
  const authEnabled = useAuthEnabled();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<{ message: string; family: TripFamily } | null>(null);

  const families = useMemo(() => groupFamilies(entries.filter((e) => !hidden.has(e.id))), [entries, hidden]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? families.filter((f) => f.latest.destination.toLowerCase().includes(q)) : families;
    return sortFamilies(filtered, sort);
  }, [families, query, sort]);

  const selectedTrips = selected
    .map((id) => families.find((f) => f.latest.id === id)?.latest)
    .filter((t): t is TripEntry => !!t);

  const toggleSelect = (id: string) => {
    setComparing(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev));
  };

  const exitCompare = () => {
    setCompareMode(false);
    setSelected([]);
    setComparing(false);
  };

  const deleteFamily = async (family: TripFamily) => {
    const ids = family.versions.map((v) => v.id);
    setError(null);
    // Optimistic: hide now, restore if the server refuses.
    setHidden((prev) => new Set([...prev, ...ids]));
    setSelected((prev) => prev.filter((id) => !ids.includes(id)));
    const { latest } = family;
    const root = latest.root_id ?? family.versions[family.versions.length - 1].id;
    try {
      if (latest.role === "saved") {
        await unsaveTrip(root);
      } else if (latest.role === "member" && user) {
        await removeMember(latest.id, user.id);
      } else {
        await Promise.all(
          ids.map((id) =>
            deleteTravelPlan(id).catch((err) => {
              // Already gone on the server (expired or deleted elsewhere): fine.
              if (err instanceof ApiError && err.status === 404) return;
              throw err;
            })
          )
        );
      }
      ids.forEach(removeTrip);
      if (synced) reload();
    } catch (err) {
      setError({
        message: `Couldn't remove your trip to ${family.latest.destination}. ${err instanceof Error ? err.message : ""}`.trim(),
        family,
      });
    } finally {
      // On success the entries are gone from the index; on failure this restores them.
      setHidden((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    }
  };

  const removeFromListOnly = (family: TripFamily) => {
    family.versions.forEach((v) => removeTrip(v.id));
    setError(null);
  };

  if (!loaded) {
    return <div className="container min-h-[60vh] py-16" aria-busy="true" />;
  }

  return (
    <div className="container py-12 md:py-16 pb-32">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
        <div>
          <p className="eyebrow">Your travel desk</p>
          <h1 className="mt-3 text-5xl md:text-6xl text-ink">My trips</h1>
          {families.length > 0 && (
            <p className="mt-3 flex items-center gap-2 text-ink-soft">
              {synced && <Cloud className="h-4 w-4 text-teal" aria-hidden />}
              {families.length} trip{families.length === 1 ? "" : "s"} {synced ? "in your account" : "planned on this device"}
            </p>
          )}
        </div>
        <Link
          href="/plan"
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-paper transition-colors hover:bg-terracotta-dark"
        >
          Plan a new trip <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      {loadError && (
        <p role="alert" className="mt-6 border-l-4 border-ochre bg-ochre-light/50 px-4 py-3 text-sm text-ink">
          Couldn&apos;t load the trips in your account ({loadError}). Showing the ones on this device.
        </p>
      )}
      {!user && authEnabled && (
        <div className="mt-8 flex flex-wrap items-start gap-6 border border-rule bg-paper-deep p-6">
          <div className="max-w-md">
            <p className="font-serif text-xl text-ink">Take your trips everywhere</p>
            <p className="mt-1 text-sm text-ink-soft">Sign in to keep these trips on all your devices and plan them with friends.</p>
          </div>
          <SignInPrompt compact />
        </div>
      )}

      {families.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-rule py-5">
            <label className="flex flex-1 min-w-[12rem] items-center gap-2 border-b border-ink/30 pb-1.5 focus-within:border-terracotta">
              <Search className="h-4 w-4 text-ink-muted" aria-hidden />
              <span className="sr-only">Filter trips by destination</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by destination"
                className="w-full bg-transparent text-ink placeholder:text-ink/35 focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-2" role="group" aria-label="Sort trips">
              <span className="text-xs uppercase tracking-eyebrow text-ink-muted">Sort</span>
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={sort === s.value}
                  onClick={() => setSort(s.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    sort === s.value ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:border-ink"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {families.length >= 2 && (
              <button
                type="button"
                aria-pressed={compareMode}
                onClick={() => (compareMode ? exitCompare() : setCompareMode(true))}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  compareMode ? "border-terracotta bg-terracotta-light/60 text-ink" : "border-rule text-ink-soft hover:border-ink"
                )}
              >
                {compareMode ? "Cancel compare" : "Compare trips"}
              </button>
            )}
          </div>

          {compareMode && !comparing && (
            <p className="mt-5 text-sm text-ink-soft" aria-live="polite">
              Select two trips to compare ({selected.length}/2 selected).
            </p>
          )}

          {error && (
            <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 border-l-4 border-terracotta bg-terracotta-light/50 px-4 py-3 text-sm text-ink">
              <span className="flex-1">{error.message}</span>
              <button type="button" onClick={() => removeFromListOnly(error.family)} className="link-underline">
                Remove from this list only
              </button>
              <button type="button" onClick={() => setError(null)} className="link-underline text-ink-muted">
                Dismiss
              </button>
            </div>
          )}

          {comparing && selectedTrips.length === 2 && (
            <div className="mt-10">
              <CompareTrips a={selectedTrips[0]} b={selectedTrips[1]} onClose={() => setComparing(false)} />
            </div>
          )}

          {visible.length === 0 ? (
            <p className="py-16 text-center font-serif text-xl italic text-ink-muted">No trips match “{query}”.</p>
          ) : (
            <div className="mt-10 grid gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((family) => (
                <TripCard
                  key={family.latest.id}
                  family={family}
                  compareMode={compareMode}
                  selected={selected.includes(family.latest.id)}
                  selectionFull={selected.length >= 2}
                  onToggleSelect={() => toggleSelect(family.latest.id)}
                  onDelete={() => deleteFamily(family)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {compareMode && selected.length > 0 && !comparing && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur">
          <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-ink-soft">
              {selectedTrips.map((t) => t.destination).join(" and ")}
              {selected.length === 1 && " · pick one more"}
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSelected([])} className="link-underline text-sm text-ink-muted">
                Clear
              </button>
              <button
                type="button"
                disabled={selected.length !== 2}
                onClick={() => {
                  setComparing(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="rounded-full bg-ink px-5 py-2 text-sm text-paper transition-colors hover:bg-terracotta disabled:opacity-40"
              >
                Compare 2 trips
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid items-center gap-10 py-16 md:grid-cols-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm">
        <Image
          src="/images/planning.jpg"
          alt="A paper map with a notebook, pencil, camera and backpack"
          fill
          sizes="(min-width: 768px) 45vw, 90vw"
          className="object-cover"
        />
      </div>
      <div>
        <p className="font-serif text-3xl italic leading-snug text-ink-soft">
          Nothing here yet. Every trip you plan will be kept on this page.
        </p>
        <Link
          href="/plan"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-paper transition-colors hover:bg-terracotta"
        >
          Plan your first trip <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
