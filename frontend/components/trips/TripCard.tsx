"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { fetchDestinationImage, type DestinationImage } from "@/lib/destinationImage";
import { moneyFor } from "@/lib/money";
import type { TripFamily } from "@/lib/tripsIndex";
import { primaryPlace, shortRoute } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BUDGET_TONE, STATUS_TONE, relativeTime, tripDates } from "./format";

interface TripCardProps {
  family: TripFamily;
  compareMode: boolean;
  selected: boolean;
  selectionFull: boolean;
  onToggleSelect: () => void;
  onDelete: () => Promise<void>;
}

/** Loads the destination photo only once the card scrolls near the viewport. */
function useLazyImage(destination: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    fetchDestinationImage(primaryPlace(destination), controller.signal).then(setImage);
    return () => controller.abort();
  }, [visible, destination]);

  return { ref, image };
}

export default function TripCard({ family, compareMode, selected, selectionFull, onToggleSelect, onDelete }: TripCardProps) {
  const { latest, versions } = family;
  const { ref, image } = useLazyImage(latest.destination);
  const [showVersions, setShowVersions] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const money = moneyFor({ money: latest.money });
  const earlier = versions.length - 1;
  const href = `/results?id=${latest.id}`;
  const checkboxId = `compare-${latest.id}`;
  // Someone else's trip is left or un-saved, never deleted.
  const action = latest.role === "member" ? "Leave" : latest.role === "saved" ? "Remove" : "Delete";
  const question =
    action === "Leave" ? "Leave this trip?" : action === "Remove" ? "Remove from your trips?" : `Delete${earlier > 0 ? ` all ${versions.length} versions` : ""}?`;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <article
      className={cn(
        "group flex flex-col border-t-2 bg-paper transition-colors",
        selected ? "border-terracotta" : "border-ink"
      )}
    >
      <div ref={ref} className="relative aspect-[16/10] overflow-hidden bg-teal-dark">
        {image ? (
          <Image
            src={image.url}
            alt={latest.destination}
            fill
            sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 90vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="font-serif text-8xl text-paper/80">{latest.destination.trim().charAt(0).toUpperCase()}</span>
          </div>
        )}
        {compareMode && (
          <label
            htmlFor={checkboxId}
            className={cn(
              "absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow",
              selected ? "bg-terracotta text-paper" : "bg-paper/95 text-ink",
              !selected && selectionFull && "cursor-not-allowed opacity-60"
            )}
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={selected}
              disabled={!selected && selectionFull}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 accent-terracotta"
            />
            {selected ? "Selected" : "Compare"}
          </label>
        )}
        {latest.version > 1 && (
          <span className="absolute right-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-medium text-paper">
            v{latest.version}
          </span>
        )}
        {(latest.role === "member" || latest.role === "saved") && (
          <span className="absolute bottom-3 left-3 rounded-full bg-paper/95 px-2.5 py-1 text-[11px] font-medium text-ink">
            {latest.role === "member" ? "Planning together" : "Saved"}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl text-ink">
            <Link href={href} className="hover:text-terracotta focus-visible:text-terracotta">
              {shortRoute(latest.destination)}
            </Link>
          </h2>
          <span className="shrink-0 text-xs text-ink-muted">{relativeTime(latest.created_at)}</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {tripDates(latest.start_date, latest.end_date)} · {latest.days} day{latest.days === 1 ? "" : "s"}
          {latest.stops ? ` · ${latest.stops} cities` : ""} · {latest.travelers} traveler{latest.travelers === 1 ? "" : "s"}
        </p>

        <dl className="mt-4 grid grid-cols-2 border-y border-rule">
          <div className="py-3 pr-3">
            <dt className="text-[11px] uppercase tracking-eyebrow text-ink-muted">Estimated</dt>
            <dd className="font-serif text-xl text-ink tabular-nums">{money.format(latest.estimated_total_usd)}</dd>
            <dd className={cn("text-xs", BUDGET_TONE[latest.budget_status])}>{latest.budget_status.toLowerCase()}</dd>
          </div>
          <div className="border-l border-rule py-3 pl-4">
            <dt className="text-[11px] uppercase tracking-eyebrow text-ink-muted">Editor&apos;s score</dt>
            <dd className="font-serif text-xl text-ink tabular-nums">{latest.score ?? "—"}</dd>
            <dd className={cn("text-xs", latest.validation_status ? STATUS_TONE[latest.validation_status] : "text-ink-muted")}>
              {latest.validation_status?.toLowerCase() ?? "not validated"}
            </dd>
          </div>
        </dl>

        {earlier > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowVersions((v) => !v)}
              aria-expanded={showVersions}
              className="flex items-center gap-1 text-sm text-ink-soft hover:text-terracotta"
            >
              v{latest.version} · {earlier} earlier version{earlier === 1 ? "" : "s"}
              <ChevronDown className={cn("h-4 w-4 transition-transform", showVersions && "rotate-180")} aria-hidden />
            </button>
            {showVersions && (
              <ol className="mt-2 space-y-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-baseline">
                    <Link href={`/results?id=${v.id}`} className="link-underline text-ink">
                      Version {v.version}
                    </Link>
                    <span className="leader" aria-hidden />
                    <span className="text-xs text-ink-muted">{relativeTime(v.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <Link
            href={href}
            className="rounded-full bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-terracotta"
          >
            Open itinerary
          </Link>
          {confirming ? (
            <div className="flex items-center gap-2 text-sm" role="group" aria-label={`Confirm ${action.toLowerCase()}`}>
              <span className="text-ink-soft">{question}</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1 rounded-full bg-terracotta px-3 py-1.5 text-paper hover:bg-terracotta-dark disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {action}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="link-underline text-ink-soft">
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-terracotta"
              aria-label={`${action} trip to ${latest.destination}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {action}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
