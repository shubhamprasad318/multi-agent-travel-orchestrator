"use client";

import { cn } from "@/lib/utils";
import type { AgentName, TraceStep } from "@/lib/types";
import { formatDuration, formatTokens } from "./format";

export type NodeStatus = "pending" | "running" | "completed" | "failed";

export interface NodeState {
  status: NodeStatus;
  step?: TraceStep;
}

type GraphNode = AgentName | "start" | "end";

// Mirrors the LangGraph topology in orchestrator_backend/orchestrator.py.
const NODES: Record<GraphNode, { x: number; y: number; label: string }> = {
  start: { x: 40, y: 150, label: "Brief" },
  research: { x: 210, y: 80, label: "Researcher" },
  weather: { x: 210, y: 250, label: "Forecaster" },
  activity: { x: 430, y: 30, label: "Curator" },
  booking: { x: 430, y: 150, label: "Scout" },
  itinerary: { x: 650, y: 150, label: "Planner" },
  validator: { x: 870, y: 150, label: "Editor" },
  revision: { x: 870, y: 280, label: "Second draft" },
  end: { x: 1060, y: 150, label: "Done" },
};

const EDGES: [GraphNode, GraphNode][] = [
  ["start", "research"],
  ["start", "weather"],
  ["research", "activity"],
  ["research", "booking"],
  ["activity", "itinerary"],
  ["booking", "itinerary"],
  ["weather", "itinerary"],
  ["itinerary", "validator"],
  ["validator", "end"],
];

const NODE_W = 150;
const NODE_H = 58;

function edgePath(from: GraphNode, to: GraphNode): string {
  const a = NODES[from];
  const b = NODES[to];
  const x1 = from === "start" ? a.x + 14 : a.x + NODE_W / 2;
  const x2 = to === "end" ? b.x - 14 : b.x - NODE_W / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${x2} ${b.y}`;
}

const STATUS_CLASSES: Record<"dark" | "light", Record<NodeStatus, string>> = {
  dark: {
    pending: "fill-paper/5 stroke-paper/25",
    running: "fill-terracotta/30 stroke-terracotta-light",
    completed: "fill-teal/40 stroke-teal-light",
    failed: "fill-red-500/20 stroke-red-300",
  },
  light: {
    pending: "fill-paper stroke-rule",
    running: "fill-terracotta-light stroke-terracotta",
    completed: "fill-teal-light stroke-teal",
    failed: "fill-red-50 stroke-red-600",
  },
};

interface AgentGraphProps {
  nodes: Partial<Record<AgentName, NodeState>>;
  finished?: boolean;
  theme?: "dark" | "light";
  className?: string;
}

export default function AgentGraph({ nodes, finished = false, theme = "dark", className }: AgentGraphProps) {
  const status = (node: GraphNode): NodeStatus => {
    if (node === "start") return "completed";
    if (node === "end") return finished ? "completed" : "pending";
    return nodes[node]?.status ?? "pending";
  };
  const reached = (node: GraphNode) => status(node) !== "pending";
  const revisionUsed = reached("revision");

  const faint = theme === "dark" ? "stroke-paper/20" : "stroke-rule";
  const edgeClass = (from: GraphNode, to: GraphNode) => {
    const done = status(from) === "completed";
    if (done && status(to) === "running") return "stroke-terracotta [stroke-dasharray:6_6] animate-[dash_0.8s_linear_infinite]";
    if (done && reached(to)) return theme === "dark" ? "stroke-teal-light" : "stroke-teal";
    return faint;
  };

  const text = theme === "dark" ? "fill-paper" : "fill-ink";
  const subtext = theme === "dark" ? "fill-paper/60" : "fill-ink-muted";

  return (
    <svg
      viewBox="0 -20 1100 350"
      className={cn("w-full h-auto", className)}
      role="img"
      aria-label="Agent workflow graph showing the status of each agent"
    >
      <defs>
        <marker id={`arrow-${theme}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" className={theme === "dark" ? "fill-paper/50" : "fill-ink-muted"} />
        </marker>
      </defs>

      {EDGES.map(([from, to]) => (
        <path
          key={`${from}-${to}`}
          d={edgePath(from, to)}
          fill="none"
          strokeWidth={2}
          markerEnd={`url(#arrow-${theme})`}
          className={cn("transition-colors duration-500", edgeClass(from, to))}
        />
      ))}

      {/* Conditional revision loop: validator -> revision -> validator */}
      <path
        d={`M ${NODES.validator.x - 30} ${NODES.validator.y + NODE_H / 2} L ${NODES.revision.x - 30} ${NODES.revision.y - NODE_H / 2}`}
        fill="none"
        strokeWidth={2}
        markerEnd={`url(#arrow-${theme})`}
        className={revisionUsed ? "stroke-ochre" : cn("[stroke-dasharray:4_5]", faint)}
      />
      <path
        d={`M ${NODES.revision.x + 30} ${NODES.revision.y - NODE_H / 2} L ${NODES.validator.x + 30} ${NODES.validator.y + NODE_H / 2}`}
        fill="none"
        strokeWidth={2}
        markerEnd={`url(#arrow-${theme})`}
        className={status("revision") === "completed" ? "stroke-ochre" : cn("[stroke-dasharray:4_5]", faint)}
      />
      {!revisionUsed && (
        <text x={NODES.revision.x + NODE_W / 2 + 10} y={NODES.revision.y + 5} className={cn("text-[13px]", subtext)}>
          only if score &lt; 60
        </text>
      )}

      {(["start", "end"] as const).map((node) => (
        <g key={node}>
          <circle
            cx={NODES[node].x}
            cy={NODES[node].y}
            r={14}
            strokeWidth={2}
            className={cn("transition-colors duration-500", STATUS_CLASSES[theme][status(node)])}
          />
          <text x={NODES[node].x} y={NODES[node].y + 34} textAnchor="middle" className={cn("text-[13px]", subtext)}>
            {NODES[node].label}
          </text>
        </g>
      ))}

      {(Object.keys(NODES) as GraphNode[])
        .filter((node): node is AgentName => node !== "start" && node !== "end")
        .map((node) => {
          const { x, y, label } = NODES[node];
          const state = nodes[node];
          const nodeStatus = status(node);
          const step = state?.step;
          const faded = node === "revision" && !revisionUsed;
          return (
            <g key={node} opacity={faded ? 0.5 : 1}>
              <rect
                x={x - NODE_W / 2}
                y={y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={14}
                strokeWidth={2}
                className={cn(
                  "transition-colors duration-500",
                  STATUS_CLASSES[theme][nodeStatus],
                  nodeStatus === "running" && "animate-pulse"
                )}
              />
              <text x={x} y={y - 3} textAnchor="middle" className={cn("font-serif text-[18px]", text)}>
                {label}
              </text>
              <text x={x} y={y + 16} textAnchor="middle" className={cn("text-[12px]", subtext)}>
                {nodeStatus === "running"
                  ? "working…"
                  : nodeStatus === "failed"
                  ? "failed"
                  : step
                  ? `${formatDuration(step.duration_ms)} · ${formatTokens(step.input_tokens + step.output_tokens)}${step.grounded ? " · 🌐" : ""}`
                  : ""}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

/** Folds a list of trace steps (later steps win) into per-agent node state. */
export function nodesFromTrace(trace: TraceStep[]): Partial<Record<AgentName, NodeState>> {
  const nodes: Partial<Record<AgentName, NodeState>> = {};
  for (const step of trace) nodes[step.agent] = { status: step.status, step };
  return nodes;
}
