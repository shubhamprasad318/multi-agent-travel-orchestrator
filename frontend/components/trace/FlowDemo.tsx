"use client";

import { useEffect, useState } from "react";
import type { AgentName } from "@/lib/types";
import AgentGraph, { type NodeState, type NodeStatus } from "./AgentGraph";

// A looping replay of a typical planning run on the real agent graph, timed like the live one
// (research and weather in parallel, then activities and bookings, then the planner and editor).
const SCRIPT: { at: number; agent: AgentName; status: NodeStatus; caption: string }[] = [
  { at: 0, agent: "research", status: "running", caption: "Reading up on the destination" },
  { at: 0, agent: "weather", status: "running", caption: "Checking the weather" },
  { at: 1400, agent: "weather", status: "completed", caption: "Forecast in" },
  { at: 2000, agent: "research", status: "completed", caption: "Neighbourhoods and etiquette found" },
  { at: 2000, agent: "activity", status: "running", caption: "Curating things to do" },
  { at: 2000, agent: "booking", status: "running", caption: "Scouting flights and hotels" },
  { at: 3300, agent: "booking", status: "completed", caption: "Flights and hotels priced" },
  { at: 3800, agent: "activity", status: "completed", caption: "14 activities picked" },
  { at: 3800, agent: "itinerary", status: "running", caption: "Writing the day-by-day plan" },
  { at: 6000, agent: "itinerary", status: "completed", caption: "Itinerary drafted" },
  { at: 6000, agent: "validator", status: "running", caption: "The editor checks every day" },
  { at: 7300, agent: "validator", status: "completed", caption: "Approved: 88/100" },
];
const FINISHED_AT = 7300;
const LOOP_MS = 10000;
const TICK_MS = 100;

function stateAt(ms: number): { nodes: Partial<Record<AgentName, NodeState>>; caption: string } {
  const nodes: Partial<Record<AgentName, NodeState>> = {};
  let caption = "A brief comes in";
  for (const step of SCRIPT) {
    if (step.at > ms) break;
    nodes[step.agent] = { status: step.status };
    caption = step.caption;
  }
  return { nodes, caption };
}

export default function FlowDemo({ className }: { className?: string }) {
  const [ms, setMs] = useState(FINISHED_AT);

  useEffect(() => {
    // Respect reduced motion: show the finished graph, without the loop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const started = performance.now();
    const timer = setInterval(() => setMs((performance.now() - started) % LOOP_MS), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const { nodes, caption } = stateAt(ms);
  return (
    <figure className={className}>
      <AgentGraph nodes={nodes} finished={ms >= FINISHED_AT} theme="light" />
      <figcaption className="mt-3 flex items-center gap-2 text-sm text-ink-soft" aria-live="off">
        <span className={`h-2 w-2 rounded-full ${ms >= FINISHED_AT ? "bg-teal" : "animate-pulse bg-terracotta"}`} aria-hidden />
        {caption}
      </figcaption>
    </figure>
  );
}
