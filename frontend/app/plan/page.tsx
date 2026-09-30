"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import PlanForm from "@/components/plan/PlanForm";
import AgentGraph, { type NodeState } from "@/components/trace/AgentGraph";
import TraceTimeline from "@/components/trace/TraceTimeline";
import { createTravelPlan } from "@/lib/api";
import { cachePlan } from "@/lib/planCache";
import type { AgentName, ProgressEvent, TraceStep, TravelRequest } from "@/lib/types";

const LAST_REQUEST_KEY = "travelPlanLastRequest";

export default function PlanPage() {
  return (
    <Suspense>
      <Planner />
    </Suspense>
  );
}

function Planner() {
  const router = useRouter();
  const destinationParam = useSearchParams().get("destination") ?? undefined;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Partial<Record<AgentName, NodeState>>>({});
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [lastRequest, setLastRequest] = useState<TravelRequest | null>(null);
  const [destination, setDestination] = useState<string | undefined>(destinationParam);
  const [formKey, setFormKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Restore the previous request so a failed attempt doesn't wipe the form.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(LAST_REQUEST_KEY);
      if (saved) {
        setLastRequest(JSON.parse(saved));
        setFormKey((k) => k + 1);
      }
    } catch {
      /* storage unavailable */
    }
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleProgress = (event: ProgressEvent) => {
    const { agent, status, step } = event;
    setNodes((prev) => ({
      ...prev,
      [agent]: status === "started" ? { status: "running" } : { status, step },
      // A revision is followed by a second validation.
      ...(agent === "revision" && status === "started" ? { validator: { status: "pending" as const } } : {}),
    }));
    if (step) setSteps((prev) => [...prev, step]);
  };

  const handleSubmit = async (request: TravelRequest) => {
    setLastRequest(request);
    setDestination(undefined);
    try {
      sessionStorage.setItem(LAST_REQUEST_KEY, JSON.stringify(request));
    } catch {
      /* storage unavailable */
    }
    setIsLoading(true);
    setError(null);
    setNodes({});
    setSteps([]);
    setElapsed(0);
    window.scrollTo({ top: 0 });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const plan = await createTravelPlan(request, { onProgress: handleProgress, signal: controller.signal });
      cachePlan(plan);
      router.push(`/results?id=${plan.id}`);
      // Stay in the loading state while navigating.
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setIsLoading(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to create travel plan. Please try again.");
      setFormKey((k) => k + 1);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    const latest = steps.at(-1);
    return (
      <div className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-6">
          <div>
            <p className="eyebrow">In progress</p>
            <h1 className="mt-3 text-4xl md:text-5xl text-ink">
              Your trip to <em className="italic text-terracotta">{lastRequest?.destination}</em> is being written.
            </h1>
          </div>
          <p className="font-serif text-3xl tabular-nums text-ink-muted" aria-label={`${elapsed} seconds elapsed`}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </p>
        </div>

        <div className="mt-10 overflow-x-auto">
          <AgentGraph nodes={nodes} theme="light" className="min-w-[680px]" />
        </div>

        <p className="mt-6 font-serif text-xl italic text-ink-soft min-h-[2rem]" aria-live="polite">
          {latest?.detail ?? "The researcher and the forecaster start together…"}
        </p>

        {steps.length > 0 && (
          <div className="mt-8 border-t border-rule pt-8">
            <p className="eyebrow text-ink-muted mb-5">The desk log</p>
            <TraceTimeline trace={steps} />
          </div>
        )}

        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          className="mt-10 text-sm text-ink-muted link-underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="container py-12 md:py-16 grid gap-14 lg:grid-cols-[1fr_22rem] lg:gap-20">
      <div>
        <p className="eyebrow">New trip</p>
        <h1 className="mt-3 text-5xl md:text-6xl text-ink">Brief the desk.</h1>
        <p className="mt-4 max-w-xl text-lg text-ink-soft leading-relaxed">
          The more you tell the agents, the better the plan. Everything except the destination and dates has a sensible default.
        </p>

        {error && (
          <div role="alert" className="mt-8 flex gap-3 border-l-4 border-terracotta bg-terracotta-light/50 px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-terracotta mt-0.5" aria-hidden />
            <p className="text-sm text-ink">{error}</p>
          </div>
        )}

        <div className="mt-12">
          <PlanForm key={formKey} onSubmit={handleSubmit} initialValues={lastRequest} initialDestination={destination} />
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm">
            <Image
              src="/images/planning.jpg"
              alt="A paper map with a notebook, pencil, camera and backpack"
              fill
              sizes="22rem"
              className="object-cover"
            />
          </div>
          <div className="mt-6 space-y-4 text-sm text-ink-soft">
            <p className="eyebrow">What you&apos;ll get</p>
            <ul className="space-y-2">
              {[
                "A day-by-day itinerary with times and costs",
                "A map of every stop",
                "Flight & hotel estimates with live-price links",
                "Weather, packing list and local etiquette",
                "A quality score, and a second draft if needed",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="text-terracotta" aria-hidden>—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
