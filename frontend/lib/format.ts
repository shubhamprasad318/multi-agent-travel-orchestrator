const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatUSD(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? usd.format(value) : "—";
}

/** Format a YYYY-MM-DD date without the UTC-midnight off-by-one that `new Date("2025-01-02")` causes. */
export function formatDate(isoDate: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", options);
}

/** Local-calendar YYYY-MM-DD for a Date (toISOString would shift it to UTC). */
export function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysBetween(start: string, end: string): number {
  const toUTC = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(end) - toUTC(start)) / 86_400_000);
}

/** Only allow http(s) links from model/search output into hrefs. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
