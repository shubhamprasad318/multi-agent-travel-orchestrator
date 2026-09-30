import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeUrl } from "@/lib/format";

/** A magazine-style section: eyebrow, serif title, rule, content. */
export function Section({
  eyebrow,
  title,
  aside,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("break-inside-avoid-page", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-2 text-3xl md:text-4xl text-ink">{title}</h2>
        </div>
        {aside}
      </div>
      <div className="pt-8">{children}</div>
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-rule px-6 py-14 text-center">
      <p className="font-serif text-xl italic text-ink-muted">{message}</p>
    </div>
  );
}

/** External link that only renders for http(s) URLs. */
export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const url = safeUrl(href);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 text-sm text-ink-soft link-underline hover:text-terracotta", className)}
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function BulletList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("space-y-2 text-ink-soft", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 leading-relaxed">
          <span className="text-terracotta" aria-hidden>—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Label ........ value" row. */
export function LeaderRow({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline", className)}>
      <span className="text-ink">{label}</span>
      <span className="leader" aria-hidden />
      <span className="tabular-nums text-ink-soft whitespace-nowrap">{value}</span>
    </div>
  );
}
