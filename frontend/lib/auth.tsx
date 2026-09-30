"use client";

// Google sign-in with Google Identity Services (https://developers.google.com/identity/gsi/web).
// Google gives the browser an ID token; the backend checks it and returns our own
// session token (see lib/session.ts). Sign-in is off unless the backend has a
// GOOGLE_CLIENT_ID; NEXT_PUBLIC_GOOGLE_CLIENT_ID skips asking the backend for it.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getAuthConfig, signInWithGoogle } from "@/lib/api";
import { getSession, setSession, subscribeSession } from "@/lib/session";
import type { User } from "@/lib/types";

const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean; ux_mode?: "popup" }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; shape?: string; text?: string; width?: number; logo_alignment?: string }
  ): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

/** The signed-in user, or null. Re-renders on sign-in / sign-out in any tab. */
export function useUser(): User | null {
  const session = useSyncExternalStore(subscribeSession, getSession, () => null);
  return session?.user ?? null;
}

let clientIdPromise: Promise<string | null> | null = null;

/** The Google OAuth client id, or null when the backend has accounts turned off. */
export function loadGoogleClientId(): Promise<string | null> {
  const fromEnv = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (fromEnv) return Promise.resolve(fromEnv);
  clientIdPromise ??= getAuthConfig()
    .then((config) => (config.enabled ? config.google_client_id : null))
    .catch(() => {
      clientIdPromise = null; // try again next time (backend may have been asleep)
      return null;
    });
  return clientIdPromise;
}

let scriptPromise: Promise<GoogleIdApi> | null = null;

function loadGoogleScript(): Promise<GoogleIdApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("Google sign-in unavailable")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Whether accounts are available: null while checking. */
export function useAuthEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    loadGoogleClientId().then((id) => alive && setEnabled(Boolean(id)));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

/**
 * Google's own "Sign in with Google" button (Google requires its branded button).
 * Renders nothing when accounts are turned off on the server.
 */
export function GoogleSignInButton({
  onSignedIn,
  onError,
  width = 240,
  text = "signin_with",
}: {
  onSignedIn?: (user: User) => void;
  onError?: (message: string) => void;
  width?: number;
  text?: "signin_with" | "continue_with" | "signup_with";
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSignedIn, onError });
  callbacks.current = { onSignedIn, onError };
  const [state, setState] = useState<"loading" | "ready" | "off" | "error">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      const clientId = await loadGoogleClientId();
      if (!alive) return;
      if (!clientId) {
        setState("off");
        return;
      }
      try {
        const google = await loadGoogleScript();
        if (!alive || !container.current) return;
        google.initialize({
          client_id: clientId,
          ux_mode: "popup",
          callback: async ({ credential }) => {
            try {
              const session = await signInWithGoogle(credential);
              callbacks.current.onSignedIn?.(session.user);
            } catch (err) {
              callbacks.current.onError?.(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
            }
          },
        });
        container.current.replaceChildren();
        google.renderButton(container.current, { theme: "outline", size: "large", shape: "pill", text, width, logo_alignment: "left" });
        setState("ready");
      } catch (err) {
        if (!alive) return;
        setState("error");
        callbacks.current.onError?.(err instanceof Error ? err.message : "Google sign-in unavailable.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [text, width]);

  if (state === "off") return null;
  return (
    <div className="min-h-[44px]">
      <div ref={container} aria-busy={state === "loading"} />
      {state === "loading" && <span className="sr-only">Loading sign-in…</span>}
      {state === "error" && <p className="text-sm text-ink-muted">Google sign-in couldn&apos;t load here.</p>}
    </div>
  );
}

export function signOut(): void {
  window.google?.accounts?.id.disableAutoSelect();
  setSession(null);
}
