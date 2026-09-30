import type { Reminder } from "@/lib/prep";
import type { TravelPlan } from "@/lib/types";

// Builds iCalendar (.ics) files: one event per itinerary slot, or one all-day
// event per pre-trip reminder.

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 lines must be folded at 75 octets. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function parseTime(value: string): [number, number] | null {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(value.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours < 24 && minutes < 60 ? [hours, minutes] : null;
}

const DEFAULT_START: Record<string, [number, number]> = {
  morning: [9, 0],
  afternoon: [13, 0],
  evening: [18, 30],
};

const pad = (n: number) => String(n).padStart(2, "0");

export function buildIcs(plan: TravelPlan): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TravelOrchestrator//Itinerary//EN", "CALSCALE:GREGORIAN"];

  for (const day of plan.itinerary?.days ?? []) {
    const date = day.date.replace(/-/g, "");
    day.slots.forEach((slot, index) => {
      const [h, m] = parseTime(slot.start_time) ?? DEFAULT_START[slot.period];
      const endHour = Math.min(h + 2, 23);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${plan.id}-${day.day}-${index}@travelorchestrator`,
        `DTSTAMP:${stamp}`,
        // Floating local time: shown at the same clock time in the destination.
        `DTSTART:${date}T${pad(h)}${pad(m)}00`,
        `DTEND:${date}T${pad(endHour)}${pad(m)}00`,
        fold(`SUMMARY:${escapeText(slot.activity)}`),
        fold(`LOCATION:${escapeText(slot.location)}`),
        fold(`DESCRIPTION:${escapeText(`Day ${day.day}: ${day.theme}`)}`),
        "END:VEVENT"
      );
    });
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

export function buildRemindersIcs(plan: TravelPlan, reminders: Reminder[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TravelOrchestrator//Prep//EN", "CALSCALE:GREGORIAN"];
  for (const r of reminders) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${plan.root_id ?? plan.id}-${r.id.replace(/[^a-z0-9-]/gi, "-")}@travelorchestrator`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${r.due.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${nextDay(r.due)}`,
      fold(`SUMMARY:${escapeText(`${r.title} (${plan.trip.destination})`)}`),
      ...(r.detail || r.href ? [fold(`DESCRIPTION:${escapeText([r.detail, r.href].filter(Boolean).join("\n"))}`)] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:PT9H",
      fold(`DESCRIPTION:${escapeText(r.title)}`),
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function download(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const slug = (plan: TravelPlan) => plan.trip.destination.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

export function downloadIcs(plan: TravelPlan): void {
  download(buildIcs(plan), `${slug(plan)}-itinerary.ics`);
}

export function downloadRemindersIcs(plan: TravelPlan, reminders: Reminder[]): void {
  download(buildRemindersIcs(plan, reminders), `${slug(plan)}-prep.ics`);
}

export function mapsUrl(place: string, destination: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, ${destination}`)}`;
}
