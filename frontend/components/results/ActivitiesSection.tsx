import { Price } from "@/lib/money";
import { mapsUrl } from "@/lib/calendar";
import type { Activity, ActivityCategory } from "@/lib/types";
import { EmptyState, ExternalLink, Section } from "./shared";

const CATEGORIES: { key: ActivityCategory; title: string }[] = [
  { key: "must_do", title: "Must-do" },
  { key: "food", title: "Eat & drink" },
  { key: "culture", title: "Culture & history" },
  { key: "hidden_gem", title: "Hidden gems" },
  { key: "nature", title: "Outdoors" },
  { key: "nightlife", title: "After dark" },
  { key: "day_trip", title: "Day trips" },
  { key: "shopping", title: "Shopping" },
  { key: "wellness", title: "Slow down" },
];

export default function ActivitiesSection({ activities, destination }: { activities: Activity[] | null; destination: string }) {
  if (!activities || activities.length === 0) return <EmptyState message="No activity recommendations available." />;

  return (
    <Section eyebrow="The curator's picks" title="Things to do">
      <div className="space-y-14">
        {CATEGORIES.map((category) => {
          const items = activities.filter((a) => a.category === category.key);
          if (items.length === 0) return null;
          return (
            <div key={category.key} className="grid gap-6 md:grid-cols-[12rem_1fr]">
              <h3 className="text-2xl text-ink md:border-t md:border-rule md:pt-3">{category.title}</h3>
              <div className="grid gap-x-10 border-t border-ink sm:grid-cols-2">
                {items.map((activity) => (
                  <article key={activity.name} className="border-b border-rule py-5 break-inside-avoid">
                    <div className="flex items-baseline">
                      <h4 className="font-serif text-xl text-ink">{activity.name}</h4>
                      <span className="leader" aria-hidden />
                      <Price usd={activity.estimated_cost} free className="text-ink-soft" />
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{activity.description}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {activity.duration} · best {activity.best_time.toLowerCase()}
                    </p>
                    <ExternalLink href={mapsUrl(activity.location || activity.name, destination)} className="mt-1 text-xs">
                      {activity.location || "Map"}
                    </ExternalLink>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
