"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { refineTravelPlan } from "@/lib/api";
import { cachePlan } from "@/lib/planCache";
import type { TravelPlan } from "@/lib/types";

const SUGGESTIONS = [
  "Make the pace more relaxed",
  "More local food, fewer museums",
  "Bring it under budget",
  "Swap outdoor plans on rainy days",
];

export default function RefinePanel({ plan }: { plan: TravelPlan }) {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = instruction.trim();
    if (text.length < 3 || pending) return;
    setPending(true);
    setError(null);
    abortRef.current = new AbortController();
    try {
      const refined = await refineTravelPlan(plan.id, text, abortRef.current.signal);
      cachePlan(refined);
      setInstruction("");
      router.push(`/results?id=${refined.id}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not refine the plan.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section id="refine" className="bg-teal-dark text-paper print:hidden scroll-mt-20" aria-labelledby="refine-heading">
      <div className="container py-14 md:py-20 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="eyebrow text-ochre">Notes for the editor</p>
          <h2 id="refine-heading" className="mt-3 text-4xl md:text-5xl">Want something changed?</h2>
          <p className="mt-4 text-paper/75 leading-relaxed max-w-md">
            Say it in plain words. The planner rewrites the itinerary, the editor checks it again, and it&apos;s saved as a new
            version. Research, weather and bookings are kept.
          </p>
          {(plan.refinements.length > 0 || plan.parent_id) && (
            <div className="mt-8 text-sm text-paper/70">
              <p>
                You&apos;re reading version {plan.version}
                {plan.parent_id && (
                  <>
                    {" · "}
                    <Link href={`/results?id=${plan.parent_id}`} className="underline underline-offset-4 hover:text-paper">
                      previous version
                    </Link>
                  </>
                )}
              </p>
              {plan.refinements.length > 0 && (
                <ol className="mt-3 space-y-1 list-decimal pl-5 font-serif italic">
                  {plan.refinements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="self-end">
          <label htmlFor="refine-instruction" className="sr-only">
            What should change?
          </label>
          <textarea
            id="refine-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Move the museum to day 3 and find a sunset spot for day 2…"
            maxLength={500}
            rows={3}
            disabled={pending}
            className="w-full resize-none border-b-2 border-paper/40 bg-transparent pb-3 font-serif text-2xl text-paper placeholder:text-paper/35 focus:border-ochre focus:outline-none"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInstruction(s)}
                disabled={pending}
                className="rounded-full border border-paper/25 px-3 py-1.5 text-xs text-paper/85 hover:border-paper hover:text-paper disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={pending || instruction.trim().length < 3}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-ochre px-6 py-3 font-medium text-ink hover:bg-paper transition-colors disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Rewriting…
              </>
            ) : (
              <>
                Send to the planner <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-terracotta-light">
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
