import { formatDate } from "@/lib/format";
import type { BudgetStatus, ValidationStatus } from "@/lib/types";

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
}

export function tripDates(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

export const BUDGET_TONE: Record<BudgetStatus, string> = {
  "Within Budget": "text-teal",
  "Slightly Over": "text-ochre",
  "Over Budget": "text-terracotta",
  Unknown: "text-ink-muted",
};

export const STATUS_TONE: Record<ValidationStatus, string> = {
  Approved: "text-teal",
  "Needs Review": "text-ochre",
  Rejected: "text-terracotta",
};
