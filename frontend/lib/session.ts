// The signed-in session (Google sign-in → our API token), kept in localStorage
// so it survives reloads. Plain module state rather than React context so the
// API client can read the token without being a hook.

import type { Session } from "@/lib/types";

const STORAGE_KEY = "session:v1";
const CHANGE_EVENT = "session-change";

let cached: Session | null | undefined;

function read(): Session | null {
  if (typeof window === "undefined") return null;
  if (cached !== undefined) return cached;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    cached = parsed && typeof parsed.token === "string" && parsed.user ? (parsed as Session) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function getSession(): Session | null {
  return read();
}

export function getToken(): string | null {
  return read()?.token ?? null;
}

export function setSession(session: Session | null): void {
  cached = session;
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage disabled: the session lasts until the tab closes */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Calls `cb` when the session changes in this tab or another. Returns an unsubscribe function. */
export function subscribeSession(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cached = undefined;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}
