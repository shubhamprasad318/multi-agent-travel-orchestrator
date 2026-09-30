import { cn } from "@/lib/utils";
import type { AgentName, TraceStep } from "@/lib/types";
import { formatDuration, formatTokens } from "./format";

export const AGENT_LABEL: Record<AgentName, string> = {
  research: "Researcher",
  weather: "Forecaster",
  activity: "Curator",
  booking: "Scout",
  itinerary: "Planner",
  validator: "Editor",
  revision: "Second draft",
};

/** Gantt-style view: overlapping bars show which agents ran in parallel. */
export default function TraceTimeline({ trace, theme = "light" }: { trace: TraceStep[]; theme?: "dark" | "light" }) {
  if (trace.length === 0) return null;
  const steps = [...trace].sort((a, b) => a.started_ms - b.started_ms);
  const total = Math.max(...steps.map((s) => s.started_ms + s.duration_ms), 1);
  const dark = theme === "dark";

  return (
    <ol className="space-y-4">
      {steps.map((step, i) => {
        const left = (step.started_ms / total) * 100;
        const width = Math.max((step.duration_ms / total) * 100, 1.5);
        return (
          <li key={`${step.agent}-${i}`} className="grid grid-cols-[6.5rem_1fr] sm:grid-cols-[8rem_1fr] gap-4 items-start">
            <span className={cn("font-serif text-lg leading-6", dark ? "text-paper" : "text-ink")}>{AGENT_LABEL[step.agent]}</span>
            <div>
              <div className={cn("relative h-6", dark ? "bg-paper/10" : "bg-paper-deep")}>
                <div
                  className={cn(
                    "absolute inset-y-0",
                    step.status === "failed" ? "bg-red-600" : step.agent === "revision" ? "bg-ochre" : "bg-teal"
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${formatDuration(step.started_ms)} → ${formatDuration(step.started_ms + step.duration_ms)}`}
                />
              </div>
              <p className={cn("text-xs mt-1.5 tabular-nums", dark ? "text-paper/70" : "text-ink-muted")}>
                {formatDuration(step.duration_ms)} · {formatTokens(step.input_tokens + step.output_tokens)}
                {step.llm_calls > 1 && ` · ${step.llm_calls} calls`}
                {step.grounded && ` · Google Search, ${step.sources} source${step.sources === 1 ? "" : "s"}`}
              </p>
              {step.detail && (
                <p className={cn("text-sm mt-0.5", dark ? "text-paper/90" : step.status === "failed" ? "text-red-700" : "text-ink-soft")}>
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
