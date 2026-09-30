const STEPS = [
  {
    title: "Tell us the brief",
    body: "Destination, dates, budget, who's coming and what you love. A departure city adds flight estimates.",
  },
  {
    title: "Watch the desk work",
    body: "A live diagram shows each agent picking up its part, what it found, and how long it took. It usually takes about a minute.",
  },
  {
    title: "Read, refine, go",
    body: "Get a checked itinerary with a map, budget and packing list. Ask for changes in plain words, then export it to your calendar.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-teal-dark text-paper scroll-mt-16">
      <div className="container py-20 md:py-24">
        <p className="eyebrow text-ochre">How it works</p>
        <h2 className="mt-4 max-w-2xl text-4xl md:text-5xl">From a one-line brief to a day-by-day plan.</h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t border-paper/25 pt-6">
              <span className="font-serif text-6xl text-ochre/90 leading-none">{i + 1}</span>
              <h3 className="mt-5 text-2xl">{step.title}</h3>
              <p className="mt-3 leading-relaxed text-paper/75">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
