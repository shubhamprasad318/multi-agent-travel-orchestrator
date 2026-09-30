import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function Footer() {
  return (
    <footer className="border-t border-rule bg-paper-deep print:hidden">
      <div className="container py-14 grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
        <div className="max-w-sm">
          <p className="font-serif text-3xl text-ink">{BRAND.short}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            A personal project exploring multi-agent travel planning with Gemini and LangGraph.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-4">Explore</p>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link href="/plan" className="hover:text-terracotta">Plan a trip</Link></li>
            <li><Link href="/#agents" className="hover:text-terracotta">The agents</Link></li>
            <li><Link href="/#how-it-works" className="hover:text-terracotta">How it works</Link></li>
            <li><Link href="/evals" className="hover:text-terracotta">Quality evaluations</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Good to know</p>
          <p className="text-sm leading-relaxed text-ink-soft">
            AI plans can contain mistakes. Always check prices, opening hours and travel advisories before you book.
          </p>
        </div>
      </div>
      <div className="container flex flex-col sm:flex-row justify-between gap-2 border-t border-rule py-6 text-xs text-ink-muted">
        <p>&copy; {new Date().getFullYear()} {BRAND.name}</p>
        <p>Photography via Unsplash · Maps © OpenStreetMap contributors</p>
      </div>
    </footer>
  );
}
