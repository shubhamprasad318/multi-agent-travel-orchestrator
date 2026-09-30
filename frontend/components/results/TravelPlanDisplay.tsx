"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MoneyProvider, moneyFor } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TravelPlan } from "@/lib/types";
import { AGENT_LABEL } from "@/components/trace/TraceTimeline";
import TripChat from "@/components/chat/TripChat";
import ActivitiesSection from "./ActivitiesSection";
import BehindTheScenesSection from "./BehindTheScenesSection";
import BookingsSection from "./BookingsSection";
import BudgetSection from "./BudgetSection";
import ItinerarySection from "./ItinerarySection";
import MapSection from "./map/MapSection";
import RefinePanel from "./RefinePanel";
import ResearchSection from "./ResearchSection";
import ValidationSection, { BUDGET_TONE, STATUS_STYLE } from "./ValidationSection";
import WeatherSection from "./WeatherSection";

// `print: false` tabs are skipped when printing (interactive-only content).
// The map also mounts only while visible: Leaflet can't size a hidden container.
const TABS = [
  { value: "itinerary", label: "Itinerary", print: true },
  { value: "map", label: "Map", print: false },
  { value: "budget", label: "Budget", print: true },
  { value: "bookings", label: "Flights & hotels", print: true },
  { value: "weather", label: "Weather", print: true },
  { value: "activities", label: "Things to do", print: true },
  { value: "guide", label: "Guide", print: true },
  { value: "validation", label: "Quality", print: true },
  { value: "trace", label: "Behind the scenes", print: false },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function TravelPlanDisplay({ plan }: { plan: TravelPlan }) {
  const { trip, budget, validation } = plan;
  const destination = trip.destination;
  const money = moneyFor(plan);
  const [tab, setTab] = useState<TabValue>("itinerary");

  // The open tab lives in the URL hash (#budget, #map…) so links can point at it.
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (TABS.some((t) => t.value === hash)) setTab(hash as TabValue);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const changeTab = (value: string) => {
    setTab(value as TabValue);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${value}`);
  };

  const glance = [
    { label: "Duration", value: `${trip.days} day${trip.days === 1 ? "" : "s"}`, note: `${trip.nights} night${trip.nights === 1 ? "" : "s"}` },
    { label: "Estimated cost", value: money.format(budget.estimated_total), note: <span className={BUDGET_TONE[budget.status]}>{budget.status.toLowerCase()} · budget {money.format(budget.total_budget)}</span> },
    { label: "Per traveler", value: money.format(budget.estimated_total / trip.travelers), note: `${trip.travelers} traveler${trip.travelers === 1 ? "" : "s"}` },
    {
      label: "Editor's score",
      value: validation ? `${validation.overall_score}` : "—",
      note: validation ? <span className={STATUS_STYLE[validation.status].tone}>{STATUS_STYLE[validation.status].label.toLowerCase()}</span> : "not validated",
    },
  ];

  const sections: Record<TabValue, React.ReactNode> = {
    itinerary: <ItinerarySection itinerary={plan.itinerary} destination={destination} planId={plan.id} />,
    map: <MapSection itinerary={plan.itinerary} />,
    budget: <BudgetSection budget={budget} itinerary={plan.itinerary} bookings={plan.bookings} travelers={trip.travelers} />,
    bookings: <BookingsSection bookings={plan.bookings} />,
    weather: <WeatherSection weather={plan.weather} />,
    activities: <ActivitiesSection activities={plan.activities?.activities ?? null} destination={destination} />,
    guide: <ResearchSection research={plan.research} />,
    validation: <ValidationSection validation={validation} budget={budget} />,
    trace: <BehindTheScenesSection plan={plan} />,
  };

  return (
    <MoneyProvider plan={plan}>
      <div className="container">
        <dl className="grid grid-cols-2 lg:grid-cols-4 border-b border-rule">
          {glance.map((item, i) => (
            <div key={item.label} className={cn("py-6 pr-4", i > 0 && "lg:border-l lg:border-rule lg:pl-6", i % 2 === 1 && "border-l border-rule pl-6 lg:pl-6")}>
              <dt className="text-xs uppercase tracking-eyebrow text-ink-muted">{item.label}</dt>
              <dd className="mt-1 font-serif text-3xl md:text-4xl text-ink tabular-nums">{item.value}</dd>
              <dd className="mt-1 text-sm text-ink-muted">{item.note}</dd>
            </div>
          ))}
        </dl>

        {plan.errors.length > 0 && (
          <div role="status" className="mt-8 flex gap-3 border-l-4 border-ochre bg-ochre-light/50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-ochre mt-0.5" aria-hidden />
            <p className="text-sm text-ink">
              Some parts of this plan couldn&apos;t be written: <strong>{plan.errors.map((e) => AGENT_LABEL[e.agent]).join(", ")}</strong>.{" "}
              {plan.errors.find((e) => e.retryable)?.message ?? "The rest of the plan is still usable."}
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={changeTab} className="mt-10">
          <div className="sticky top-16 z-30 -mx-5 md:-mx-8 bg-paper/95 backdrop-blur px-5 md:px-8 print:hidden">
            <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-rule bg-transparent p-0">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="relative flex-none h-auto shrink-0 rounded-none border-0 bg-transparent px-0 py-4 text-sm text-ink-muted shadow-none hover:text-ink data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent data-[state=active]:after:bg-terracotta"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Printable sections stay mounted so "Save as PDF" includes all of them. */}
          {TABS.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              forceMount={tab.print ? true : undefined}
              className={cn("mt-12 pb-20 data-[state=inactive]:hidden", tab.print ? "print:!block print:mt-10 print:pb-0" : "print:!hidden")}
            >
              {sections[tab.value]}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <RefinePanel plan={plan} />
      <TripChat plan={plan} />
    </MoneyProvider>
  );
}
