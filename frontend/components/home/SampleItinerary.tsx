import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// A static excerpt showing the shape of a real result.
const SAMPLE = [
  { time: "08:30", what: "Fushimi Inari, before the crowds", cost: "Free" },
  { time: "12:30", what: "Lunch at Nishiki Market", cost: "$36" },
  { time: "15:00", what: "Kiyomizu-dera and the Sannenzaka lanes", cost: "$8" },
  { time: "19:00", what: "Kaiseki dinner in Gion", cost: "$140" },
];

const DESTINATIONS = [
  { src: "/images/paris.jpg", alt: "The Eiffel Tower over the Seine at sunset", name: "Paris", note: "4 days · culture & food" },
  { src: "/images/tokyo.jpg", alt: "Neon-lit crossing in Akihabara, Tokyo", name: "Tokyo", note: "6 days · tech & nightlife" },
  { src: "/images/beach.jpg", alt: "Calm turquoise sea on a white-sand beach at sunrise", name: "The coast", note: "5 days · relaxed" },
];

export default function SampleItinerary() {
  return (
    <section id="sample" className="border-t border-rule scroll-mt-16">
      <div className="container py-20 md:py-28 grid gap-14 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <div>
          <p className="eyebrow">From a recent plan</p>
          <h2 className="mt-4 text-4xl md:text-5xl text-ink">It reads like a travel column, with a spreadsheet behind it.</h2>

          <article className="mt-10 border-t-2 border-ink pt-6">
            <div className="flex items-baseline justify-between">
              <p className="font-serif text-6xl text-terracotta leading-none">02</p>
              <p className="text-sm text-ink-muted">Kyoto · Tuesday</p>
            </div>
            <h3 className="mt-3 text-3xl text-ink">Shrines, markets and a slow dinner</h3>
            <ul className="mt-6 space-y-3">
              {SAMPLE.map((row) => (
                <li key={row.time} className="flex items-baseline text-[15px]">
                  <span className="w-14 shrink-0 tabular-nums text-ink-muted">{row.time}</span>
                  <span className="text-ink">{row.what}</span>
                  <span className="leader" aria-hidden />
                  <span className="tabular-nums text-ink-soft">{row.cost}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-l-2 border-ochre pl-4 font-serif italic text-ink-soft">
              &ldquo;Rain is likely after 4pm, so the temple visit moves to the morning if it turns.&rdquo;
            </p>
          </article>

          <Link
            href="/plan"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-paper hover:bg-terracotta transition-colors"
          >
            Plan your own <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {DESTINATIONS.map((d, i) => (
            <figure key={d.name} className={i === 0 ? "col-span-2" : ""}>
              <div className={`relative overflow-hidden rounded-sm ${i === 0 ? "aspect-[16/10]" : "aspect-[4/5]"}`}>
                <Image
                  src={d.src}
                  alt={d.alt}
                  fill
                  sizes={i === 0 ? "(min-width: 1024px) 40vw, 90vw" : "(min-width: 1024px) 20vw, 45vw"}
                  className="object-cover transition-transform duration-700 hover:scale-[1.03]"
                />
              </div>
              <figcaption className="mt-2 flex items-baseline justify-between">
                <span className="font-serif text-lg text-ink">{d.name}</span>
                <span className="text-xs text-ink-muted">{d.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
