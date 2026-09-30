"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const NAV_LINKS = [
  { href: "/#agents", label: "The agents" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#sample", label: "Sample itinerary" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300 print:hidden",
        scrolled || open ? "bg-paper/95 backdrop-blur border-b border-rule" : "bg-paper border-b border-transparent"
      )}
    >
      <nav aria-label="Main" className="container flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span className="font-serif text-2xl tracking-tight text-ink">{BRAND.short}</span>
          <span className="hidden sm:inline text-[11px] uppercase tracking-eyebrow text-ink-muted group-hover:text-terracotta transition-colors">
            travel desk
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-ink-soft hover:text-terracotta transition-colors">
              {link.label}
            </Link>
          ))}
          <Link
            href="/trips"
            aria-current={pathname === "/trips" ? "page" : undefined}
            className="text-sm text-ink-soft hover:text-terracotta transition-colors aria-[current=page]:text-terracotta"
          >
            My trips
          </Link>
          <Link
            href="/plan"
            aria-current={pathname === "/plan" ? "page" : undefined}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:bg-terracotta transition-colors"
          >
            Plan a trip
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden -mr-2 p-2 text-ink"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="md:hidden container pb-6 pt-2 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="block py-3 border-b border-rule font-serif text-xl text-ink">
              {link.label}
            </Link>
          ))}
          <Link href="/trips" className="block py-3 border-b border-rule font-serif text-xl text-ink">
            My trips
          </Link>
          <Link href="/plan" className="mt-4 block rounded-full bg-ink px-5 py-3 text-center font-medium text-paper">
            Plan a trip
          </Link>
        </div>
      )}
    </header>
  );
}
