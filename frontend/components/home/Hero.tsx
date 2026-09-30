"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

const SUGGESTIONS = ["Kyoto, Japan", "Lisbon, Portugal", "Oaxaca, Mexico", "Hanoi, Vietnam"];

export default function Hero() {
  const router = useRouter();
  const [destination, setDestination] = useState("");

  const go = (place: string) => {
    const value = place.trim();
    router.push(value ? `/plan?destination=${encodeURIComponent(value)}` : "/plan");
  };

  return (
    <section className="relative overflow-hidden paper-grain">
      <div className="container grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="animate-rise-in">
          <p className="eyebrow">A travel desk staffed by six AI agents</p>
          <h1 className="mt-5 text-5xl sm:text-6xl lg:text-7xl text-ink">
            Your next trip,
            <br />
            planned by <em className="italic text-terracotta">six specialists</em>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            A researcher, a weather analyst, an activity curator, a booking scout and an itinerary planner work in
            parallel, then an editor checks every day before it reaches you.
          </p>

          <form
            className="mt-10 max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              go(destination);
            }}
          >
            <label htmlFor="hero-destination" className="eyebrow text-ink-muted">
              Where to?
            </label>
            <div className="mt-2 flex items-center gap-2 border-b-2 border-ink pb-2 focus-within:border-terracotta transition-colors">
              <input
                id="hero-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="A city, region or country"
                maxLength={100}
                autoComplete="off"
                className="flex-1 bg-transparent font-serif text-2xl sm:text-3xl text-ink placeholder:text-ink/30 focus:outline-none"
              />
              <button
                type="submit"
                className="flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors"
              >
                Start <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
              <span>Try</span>
              {SUGGESTIONS.map((place) => (
                <button key={place} type="button" onClick={() => go(place)} className="link-underline text-ink-soft">
                  {place}
                </button>
              ))}
            </div>
          </form>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <figure className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-sm shadow-[0_30px_60px_-30px_rgba(31,27,22,0.45)]">
              <Image
                src="/images/kyoto.jpg"
                alt="Yasaka Pagoda in Kyoto at dusk, seen from a quiet lane in Higashiyama"
                fill
                priority
                sizes="(min-width: 1024px) 45vw, 90vw"
                className="object-cover"
              />
            </div>
            <figcaption className="mt-3 flex justify-between text-xs text-ink-muted">
              <span className="font-serif italic text-sm text-ink-soft">Higashiyama, Kyoto — at dusk</span>
              <span>Cover</span>
            </figcaption>
          </figure>

          <div className="absolute bottom-16 -left-4 sm:-left-10 w-40 sm:w-52 rotate-[-3deg] bg-paper p-2 pb-8 shadow-xl hidden sm:block">
            <div className="relative aspect-square">
              <Image src="/images/braies.jpg" alt="Wooden boat on the emerald water of Lago di Braies" fill sizes="208px" className="object-cover" />
            </div>
            <p className="absolute bottom-2 left-3 font-serif italic text-xs text-ink-soft">Lago di Braies</p>
          </div>
        </div>
      </div>
    </section>
  );
}
