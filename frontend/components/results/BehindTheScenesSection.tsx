import AgentGraph, { nodesFromTrace } from "@/components/trace/AgentGraph";
import TraceTimeline from "@/components/trace/TraceTimeline";
import { formatDuration, formatTokens } from "@/components/trace/format";
import type { TravelPlan } from "@/lib/types";
import { EmptyState, Section } from "./shared";

export default function BehindTheScenesSection({ plan }: { plan: TravelPlan }) {
  const trace = plan.trace ?? [];
  if (trace.length === 0) return <EmptyState message="No agent trace was recorded for this plan." />;

  const wall = Math.max(...trace.map((s) => s.started_ms + s.duration_ms));
  const busy = trace.reduce((sum, s) => sum + s.duration_ms, 0);
  const tokens = trace.reduce((sum, s) => sum + s.input_tokens + s.output_tokens, 0);
  const calls = trace.reduce((sum, s) => sum + s.llm_calls, 0);
  const sources = trace.reduce((sum, s) => sum + s.sources, 0);
  const isRefinement = plan.version > 1;

  const stats = [
    { label: "Total time", value: formatDuration(wall) },
    // How much faster running agents in parallel was than running them one by one.
    { label: "Parallel speed-up", value: `${(busy / Math.max(wall, 1)).toFixed(1)}×` },
    { label: "Gemini calls", value: String(calls) },
    { label: "Tokens", value: formatTokens(tokens).replace(" tok", "") },
    { label: "Web sources", value: String(sources) },
  ];

  return (
    <Section eyebrow="How this plan was made" title="Behind the scenes">
      <p className="max-w-3xl text-lg leading-relaxed text-ink-soft">
        {isRefinement
          ? `This is version ${plan.version}. To apply your change, only the planner and the editor ran again; everything else was reused.`
          : "The researcher and the forecaster started together. The curator and the scout then worked in parallel, and the planner waited for all of them before the editor scored the result."}
      </p>

      <dl className="mt-10 grid grid-cols-2 sm:grid-cols-5 border-y border-rule divide-rule sm:divide-x">
        {stats.map((stat) => (
          <div key={stat.label} className="px-4 py-5">
            <dt className="text-xs uppercase tracking-eyebrow text-ink-muted">{stat.label}</dt>
            <dd className="mt-1 font-serif text-3xl text-ink tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {!isRefinement && (
        <div className="mt-10 overflow-x-auto">
          <AgentGraph nodes={nodesFromTrace(trace)} finished theme="light" className="min-w-[680px]" />
        </div>
      )}

      <h3 className="mt-12 text-2xl text-ink">The desk log</h3>
      <div className="mt-6">
        <TraceTimeline trace={trace} />
      </div>
    </Section>
  );
}
