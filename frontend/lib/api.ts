import type { ChatMessage, ChatReply, Itinerary, ProgressEvent, TravelPlan, TravelRequest } from "@/lib/types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

// Planning runs several LLM calls; the backend gives up at 240s.
const PLAN_TIMEOUT_MS = 300_000;

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const detail = typeof body?.detail === "string" ? body.detail : null;
  const fallback: Record<number, string> = {
    429: "Too many requests. Please wait a minute and try again.",
    503: "The planner is not available right now.",
  };
  return new ApiError(detail || fallback[response.status] || `Server error (${response.status})`, response.status);
}

function networkError(error: unknown, signal: AbortSignal): Error {
  if (signal.aborted) {
    return signal.reason instanceof Error && signal.reason.name === "TimeoutError"
      ? new ApiError("The planner took too long to respond. Please try again.")
      : new DOMException("Aborted", "AbortError");
  }
  if (error instanceof ApiError) return error;
  return new ApiError(`Can't reach the planning server at ${API_URL}. Is the backend running?`);
}

/** Create a plan, reporting per-agent progress from the SSE stream. */
export async function createTravelPlan(
  request: TravelRequest,
  { onProgress, signal }: { onProgress?: (event: ProgressEvent) => void; signal?: AbortSignal } = {}
): Promise<TravelPlan> {
  const timeout = AbortSignal.timeout(PLAN_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const response = await fetch(`${API_URL}/api/v1/plan/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: combined,
    });
    if (!response.ok) throw await errorFromResponse(response);
    if (!response.body) throw new ApiError("Empty response from server");

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseBlock(block);
        if (!event) continue;
        if (event.name === "progress") onProgress?.(event.data as ProgressEvent);
        if (event.name === "result") return event.data as TravelPlan;
        if (event.name === "error") throw new ApiError((event.data as { detail?: string }).detail || "Planning failed");
      }
    }
    throw new ApiError("The connection closed before the plan was ready. Please try again.");
  } catch (error) {
    throw networkError(error, combined);
  }
}

function parseSseBlock(block: string): { name: string; data: unknown } | null {
  let name = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // keep-alive comment
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return { name, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

/** JSON request to the API with a timeout and friendly errors. */
async function callApi<T>(
  path: string,
  { method = "GET", body, signal, timeoutMs = 30_000 }: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
    if (!response.ok) throw await errorFromResponse(response);
    return (response.status === 204 ? undefined : await response.json()) as T;
  } catch (error) {
    throw networkError(error, combined);
  }
}

const planPath = (id: string) => `/api/v1/plans/${encodeURIComponent(id)}`;

export function getTravelPlan(id: string, signal?: AbortSignal): Promise<TravelPlan> {
  return callApi<TravelPlan>(planPath(id), { signal });
}

/** Apply a change request; the backend returns a new plan version. */
export function refineTravelPlan(id: string, instruction: string, signal?: AbortSignal): Promise<TravelPlan> {
  return callApi<TravelPlan>(`${planPath(id)}/refine`, { method: "POST", body: { instruction }, signal, timeoutMs: PLAN_TIMEOUT_MS });
}

/** Save a hand-edited itinerary; the backend re-scores it and returns a new plan version. */
export function saveItinerary(id: string, itinerary: Itinerary, signal?: AbortSignal): Promise<TravelPlan> {
  return callApi<TravelPlan>(`${planPath(id)}/itinerary`, { method: "PUT", body: { itinerary }, signal, timeoutMs: PLAN_TIMEOUT_MS });
}

export function askAboutPlan(id: string, messages: ChatMessage[], signal?: AbortSignal): Promise<ChatReply> {
  return callApi<ChatReply>(`${planPath(id)}/chat`, { method: "POST", body: { messages }, signal, timeoutMs: 90_000 });
}

export function deleteTravelPlan(id: string, signal?: AbortSignal): Promise<void> {
  return callApi<void>(planPath(id), { method: "DELETE", signal });
}
