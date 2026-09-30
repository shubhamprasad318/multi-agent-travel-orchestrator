"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarPlus, Check, Loader2, Printer, Share2 } from "lucide-react";
import TravelPlanDisplay from "@/components/results/TravelPlanDisplay";
import { getTravelPlan } from "@/lib/api";
import { downloadIcs } from "@/lib/calendar";
import { fetchDestinationImage, type DestinationImage } from "@/lib/destinationImage";
import { formatDate } from "@/lib/format";
import { cachePlan, getCachedPlan } from "@/lib/planCache";
import { cn } from "@/lib/utils";
import type { TravelPlan } from "@/lib/types";

export default function ResultsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Results />
    </Suspense>
  );
}

function Results() {
  const id = useSearchParams().get("id");
  const [plan, setPlan] = useState<TravelPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!id) {
      setError("No plan selected.");
      return;
    }
    const cached = getCachedPlan(id);
    if (cached) {
      setPlan(cached);
      return;
    }
    const controller = new AbortController();
    getTravelPlan(id, controller.signal)
      .then((fetched) => {
        cachePlan(fetched);
        setPlan(fetched);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load this plan.");
      });
    return () => controller.abort();
  }, [id]);

  if (error) {
    return (
      <div className="container py-24 max-w-xl text-center">
        <p className="eyebrow">Plan unavailable</p>
        <h1 className="mt-4 text-4xl text-ink">We couldn&apos;t find that trip.</h1>
        <p className="mt-4 text-ink-soft">{error}</p>
        <Link href="/plan" className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-paper hover:bg-terracotta">
          Plan a new trip
        </Link>
      </div>
    );
  }

  if (!plan) return <LoadingState />;

  return (
    <>
      <PlanHero plan={plan} />
      <TravelPlanDisplay plan={plan} />
    </>
  );
}

function PlanHero({ plan }: { plan: TravelPlan }) {
  const { trip } = plan;
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    const controller = new AbortController();
    setImage(null);
    fetchDestinationImage(trip.destination, controller.signal).then(setImage);
    return () => controller.abort();
  }, [trip.destination]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Trip to ${trip.destination}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch (err) {
      // The user closing the share sheet is not an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setShareState("failed");
    }
    setTimeout(() => setShareState("idle"), 2500);
  };

  const dates = `${formatDate(trip.start_date, { month: "long", day: "numeric" })} – ${formatDate(trip.end_date, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <header className="relative">
      <div className={cn("relative h-[58vh] min-h-[380px] max-h-[640px] overflow-hidden print:h-auto print:min-h-0", !image && "bg-teal-dark")}>
        {image && (
          <Image
            src={image.url}
            alt={`${trip.destination}`}
            fill
            priority
            sizes="100vw"
            className="object-cover animate-in fade-in duration-700 print:hidden"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/30 to-ink/10 print:hidden" aria-hidden />

        <div className="relative z-10 flex h-full flex-col justify-end container pb-10 text-paper print:text-ink print:pb-4">
          <p className="eyebrow text-ochre print:text-terracotta">
            Your itinerary{plan.version > 1 ? ` · version ${plan.version}` : ""}
          </p>
          <h1 className="mt-3 text-5xl sm:text-6xl lg:text-8xl leading-[0.95] drop-shadow-sm">{trip.destination}</h1>
          <p className="mt-4 text-lg text-paper/85 print:text-ink-soft">
            {dates}
            {trip.origin && <> · from {trip.origin}</>}
          </p>
        </div>

        {image && (
          <a
            href={image.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-4 z-10 text-[10px] text-paper/60 hover:text-paper print:hidden"
          >
            Photo: Wikipedia
          </a>
        )}
      </div>

      <div className="container flex flex-wrap items-center gap-2 border-b border-rule py-4 print:hidden">
        <ActionLink href="/plan" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
          New trip
        </ActionLink>
        <span className="flex-1" />
        <ActionButton onClick={handleShare} icon={shareState === "copied" ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}>
          {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Share"}
        </ActionButton>
        {plan.itinerary && (
          <ActionButton onClick={() => downloadIcs(plan)} icon={<CalendarPlus className="h-4 w-4" aria-hidden />}>
            Add to calendar
          </ActionButton>
        )}
        <ActionButton onClick={() => window.print()} icon={<Printer className="h-4 w-4" aria-hidden />}>
          Print / PDF
        </ActionButton>
        <a href="#refine" className="rounded-full bg-terracotta px-4 py-2 text-sm text-paper hover:bg-terracotta-dark transition-colors">
          Request changes
        </a>
      </div>
    </header>
  );
}

const actionClass =
  "inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm text-ink-soft hover:border-ink hover:text-ink transition-colors";

function ActionButton({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={actionClass}>
      {icon}
      {children}
    </button>
  );
}

function ActionLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(actionClass, "border-transparent px-0 hover:border-transparent")}>
      {icon}
      {children}
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center text-center">
      <Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden />
      <p className="mt-4 font-serif text-xl italic text-ink-soft">Opening your itinerary…</p>
    </div>
  );
}
