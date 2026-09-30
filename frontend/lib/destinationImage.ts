// Lead photo for a destination from Wikipedia's page summary API (free, no key, CORS-enabled).

export interface DestinationImage {
  url: string;
  pageUrl: string;
  title: string;
}

interface WikiSummary {
  type?: string;
  title?: string;
  originalimage?: { source: string; width: number };
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

const cache = new Map<string, DestinationImage | null>();

async function lookup(title: string, signal?: AbortSignal): Promise<DestinationImage | null> {
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}?redirect=true`,
    { signal }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as WikiSummary;
  if (data.type === "disambiguation") return null;
  const original = data.originalimage?.source ?? data.thumbnail?.source;
  // Skip maps, flags and diagrams (often SVGs rendered to PNG), which make poor cover photos.
  if (!original || /\.svg/i.test(original) || /(map|flag|locator|marker|coat_of_arms|seal)/i.test(original)) return null;
  // Thumbnail URLs embed the width ("/3840px-"). Wikimedia only serves standard
  // widths, so ask for 1920 when the original is larger than that.
  const width = data.originalimage?.width ?? 0;
  const resized = width > 1920 ? original.replace(/\/\d+px-/, "/1920px-") : original;
  const url = resized.replace(/\?.*$/, "");
  return { url, title: data.title ?? title, pageUrl: data.content_urls?.desktop?.page ?? "https://en.wikipedia.org" };
}

/** Tries "Kyoto, Japan", then "Kyoto". Returns null when nothing suitable exists. */
export async function fetchDestinationImage(destination: string, signal?: AbortSignal): Promise<DestinationImage | null> {
  const key = destination.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  const candidates = [...new Set([destination.trim(), destination.split(",")[0].trim()])].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const found = await lookup(candidate, signal);
      if (found) {
        cache.set(key, found);
        return found;
      }
    } catch {
      if (signal?.aborted) return null;
    }
  }
  cache.set(key, null);
  return null;
}
