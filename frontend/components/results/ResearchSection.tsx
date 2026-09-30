import type { ResearchResult } from "@/lib/types";
import { BulletList, EmptyState, ExternalLink, Section } from "./shared";

export default function ResearchSection({ research }: { research: ResearchResult | null }) {
  if (!research) return <EmptyState message="Destination research is unavailable for this plan." />;

  return (
    <Section eyebrow="The researcher's notes" title="Know before you go">
      <p className="max-w-3xl font-serif text-2xl leading-snug text-ink first-letter:float-left first-letter:mr-3 first-letter:font-serif first-letter:text-7xl first-letter:leading-[0.8] first-letter:text-terracotta">
        {research.overview}
      </p>

      <div className="mt-14 grid gap-12 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <h3 className="text-xl text-ink border-t border-ink pt-3">Highlights</h3>
          <BulletList items={research.highlights} className="mt-4" />
        </div>
        <div>
          <h3 className="text-xl text-ink border-t border-ink pt-3">Where to stay</h3>
          <ul className="mt-4 space-y-4">
            {research.neighborhoods.map((n) => (
              <li key={n.name}>
                <p className="font-serif text-lg text-ink">{n.name}</p>
                <p className="text-[15px] text-ink-soft leading-relaxed">{n.description}</p>
                <p className="text-xs text-ink-muted mt-1">Good for {n.good_for.toLowerCase()}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xl text-ink border-t border-ink pt-3">Local etiquette</h3>
          <BulletList items={research.cultural_tips} className="mt-4" />
        </div>
        <div>
          <h3 className="text-xl text-ink border-t border-ink pt-3">Staying safe</h3>
          <BulletList items={research.safety_tips} className="mt-4" />
        </div>
        <div>
          <h3 className="text-xl text-ink border-t border-ink pt-3">Getting around</h3>
          <p className="mt-4 text-ink-soft leading-relaxed">{research.getting_around}</p>
        </div>
        <div>
          <h3 className="text-xl text-ink border-t border-ink pt-3">Best time to visit</h3>
          <p className="mt-4 text-ink-soft leading-relaxed">{research.best_time_to_visit}</p>
        </div>
      </div>

      {research.sources.length > 0 && (
        <div className="mt-14 border-t border-rule pt-5">
          <p className="eyebrow text-ink-muted">Sources, via Google Search</p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {research.sources.map((source) => (
              <li key={source.url}>
                <ExternalLink href={source.url}>{source.title}</ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
