const AGENTS = [
  {
    role: "The Researcher",
    title: "Destination research",
    body: "Reads the web through Google Search: neighbourhoods, etiquette, safety, getting around, and anything happening on your dates. Sources included.",
  },
  {
    role: "The Forecaster",
    title: "Weather",
    body: "Checks the published forecast for trips in the next ten days, and typical conditions for later ones. It never passes an average off as a forecast.",
  },
  {
    role: "The Curator",
    title: "Activities",
    body: "Picks real, named places to eat, see and do, weighted towards your interests and priced for your group.",
  },
  {
    role: "The Scout",
    title: "Flights & hotels",
    body: "Finds the airlines that fly your route and hotels in the right areas, with links that open live prices for your exact dates.",
  },
  {
    role: "The Planner",
    title: "Day-by-day itinerary",
    body: "Groups nearby places, respects opening hours, moves outdoor plans to the best-weather days and stays within what's left of your budget.",
  },
  {
    role: "The Editor",
    title: "Validation",
    body: "Scores every plan on six criteria. If it falls short, the Planner gets notes and a second draft, and the better version wins.",
  },
];

export default function Agents() {
  return (
    <section id="agents" className="border-t border-rule bg-paper scroll-mt-16">
      <div className="container py-20 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="eyebrow">The masthead</p>
            <h2 className="mt-4 text-4xl md:text-5xl text-ink">Six specialists, one itinerary.</h2>
            <p className="mt-5 text-ink-soft leading-relaxed max-w-sm">
              Each agent is a separate Gemini call with its own brief, working in parallel where it can, orchestrated
              with LangGraph.
            </p>
          </div>

          <ol className="grid sm:grid-cols-2 border-t border-ink">
            {AGENTS.map((agent, i) => (
              <li
                key={agent.role}
                className="border-b border-rule py-7 sm:odd:pr-8 sm:even:pl-8 sm:even:border-l"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-serif text-sm text-terracotta tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <p className="eyebrow text-ink-muted">{agent.role}</p>
                </div>
                <h3 className="mt-2 text-2xl text-ink">{agent.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{agent.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
