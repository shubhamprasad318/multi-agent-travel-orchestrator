"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Link2, Loader2, LogOut, UserMinus, Users, X } from "lucide-react";
import { PersonAvatar, SignInPrompt } from "@/components/layout/AccountMenu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { copyPlan, createInvite, disableInvite, joinTrip, removeMember } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { useCollab } from "@/lib/collab";
import { cachePlan } from "@/lib/planCache";
import type { TravelPlan } from "@/lib/types";
import { cn } from "@/lib/utils";

function inviteUrl(planId: string, code: string): string {
  const url = new URL("/results", window.location.origin);
  url.searchParams.set("id", planId);
  url.searchParams.set("invite", code);
  return url.toString();
}

/** Hero action: who's planning this trip, invite link and members. */
export function PlanTogetherButton({ plan, className }: { plan: TravelPlan; className?: string }) {
  const { collab } = useCollab();
  const [open, setOpen] = useState(false);
  const members = collab?.members ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={className}>
        {members.length > 1 ? (
          <span className="flex -space-x-2" aria-hidden>
            {members.slice(0, 3).map((m) => (
              <PersonAvatar key={m.id} person={m} className="size-5 text-[9px]" />
            ))}
          </span>
        ) : (
          <Users className="h-4 w-4" aria-hidden />
        )}
        Plan together
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Plan together</DialogTitle>
          <DialogDescription>Friends you invite can vote on stops, comment and change the plan with you.</DialogDescription>
        </DialogHeader>
        <PlanTogetherBody plan={plan} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PlanTogetherBody({ plan, onClose }: { plan: TravelPlan; onClose: () => void }) {
  const router = useRouter();
  const user = useUser();
  const { collab, reload } = useCollab();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!collab) {
    return <Loader2 className="mx-auto h-6 w-6 animate-spin text-ink-muted" aria-label="Loading" />;
  }

  // Made while signed out: needs an owner before friends can join.
  if (collab.role === "open") {
    if (!user) {
      return <SignInPrompt reason="Sign in to save this trip to your account, then invite friends to plan it with you." />;
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          This plan was made while signed out, so anyone with its link can change it. Save your own copy to invite friends and
          decide who can edit.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("copy", async () => {
              const copy = await copyPlan(plan.id);
              cachePlan(copy);
              onClose();
              router.push(`/results?id=${copy.id}`);
            })
          }
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm text-paper hover:bg-terracotta-dark disabled:opacity-60"
        >
          {busy === "copy" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save my copy
        </button>
        {error && <ErrorText message={error} />}
      </div>
    );
  }

  if (collab.role === "viewer") {
    return user ? (
      <p className="text-sm text-ink-soft">
        This is {collab.owner?.name ?? "someone"}&apos;s trip. Ask them for an invite link to plan it together.
      </p>
    ) : (
      <SignInPrompt reason={`This is ${collab.owner?.name ?? "someone"}'s trip. If they invited you, sign in to join.`} />
    );
  }

  const isOwner = collab.role === "owner";
  const link = collab.invite_code ? inviteUrl(plan.id, collab.invite_code) : null;

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  return (
    <div className="space-y-6">
      {isOwner && (
        <section aria-labelledby="invite-heading" className="space-y-3">
          <h3 id="invite-heading" className="eyebrow text-ink-muted">
            Invite link
          </h3>
          {link ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                  aria-label="Invite link"
                  className="min-w-0 flex-1 truncate border-b border-ink/30 bg-transparent pb-1 text-sm text-ink"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs text-paper hover:bg-terracotta"
                >
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-ink-muted">
                Anyone with this link who signs in can join.{" "}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("disable", async () => {
                    await disableInvite(plan.id);
                    reload();
                  })}
                  className="link-underline text-ink-soft"
                >
                  Turn the link off
                </button>{" "}
                or{" "}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("invite", async () => {
                    await createInvite(plan.id);
                    reload();
                  })}
                  className="link-underline text-ink-soft"
                >
                  make a new one
                </button>
                .
              </p>
            </>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("invite", async () => {
                await createInvite(plan.id);
                reload();
              })}
              className="inline-flex items-center gap-2 rounded-full bg-terracotta px-4 py-2 text-sm text-paper hover:bg-terracotta-dark disabled:opacity-60"
            >
              {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
              Create invite link
            </button>
          )}
        </section>
      )}

      <section aria-labelledby="members-heading">
        <h3 id="members-heading" className="eyebrow text-ink-muted">
          Who&apos;s planning
        </h3>
        <ul className="mt-3 divide-y divide-rule">
          {collab.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <PersonAvatar person={m} />
              <span className="flex-1 text-sm text-ink">
                {m.name}
                {m.id === user?.id && <span className="text-ink-muted"> (you)</span>}
              </span>
              <span className="text-xs text-ink-muted">{m.role === "owner" ? "Owner" : "Member"}</span>
              {m.role === "member" && (isOwner || m.id === user?.id) && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`remove-${m.id}`, async () => {
                      await removeMember(plan.id, m.id);
                      if (m.id === user?.id) onClose();
                      reload();
                    })
                  }
                  aria-label={m.id === user?.id ? "Leave this trip" : `Remove ${m.name}`}
                  className="rounded p-1 text-ink-muted hover:text-terracotta"
                >
                  {m.id === user?.id ? <LogOut className="h-4 w-4" aria-hidden /> : <UserMinus className="h-4 w-4" aria-hidden />}
                </button>
              )}
            </li>
          ))}
        </ul>
        {collab.members.length === 1 && isOwner && (
          <p className="mt-2 text-sm text-ink-muted">Just you so far. Share the invite link with your travel companions.</p>
        )}
      </section>
      {error && <ErrorText message={error} />}
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-terracotta">
      {message}
    </p>
  );
}

/**
 * Opened from an invite link (?invite=…): joins the trip once signed in, then
 * removes the code from the address bar.
 */
export function InviteBanner({ plan }: { plan: TravelPlan }) {
  const code = useSearchParams().get("invite");
  const user = useUser();
  const { collab, reload } = useCollab();
  const [state, setState] = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const attempted = useRef<string | null>(null);

  const alreadyIn = collab?.role === "owner" || collab?.role === "member";

  useEffect(() => {
    if (!code || !user || !collab || collab.role === "open") return;
    const clearCode = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState(null, "", url.toString());
    };
    if (alreadyIn) {
      clearCode();
      return;
    }
    const key = `${user.id}:${code}`;
    if (attempted.current === key) return;
    attempted.current = key;
    setState("joining");
    joinTrip(plan.id, code)
      .then(() => {
        setState("joined");
        clearCode();
        reload();
      })
      .catch((err) => {
        setState("error");
        setError(err instanceof Error ? err.message : "Couldn't join this trip.");
      });
  }, [code, user, collab, alreadyIn, plan.id, reload]);

  if (!code || dismissed || collab?.role === "open") return null;
  if (alreadyIn && state !== "joined") return null;

  return (
    <div className="container print:hidden">
      <div
        role="status"
        className={cn(
          "mt-6 flex flex-wrap items-start gap-4 border-l-4 px-5 py-4",
          state === "error" ? "border-terracotta bg-terracotta-light/40" : "border-teal bg-teal-light/30"
        )}
      >
        <div className="flex-1 min-w-[14rem]">
          {state === "joined" ? (
            <p className="text-ink">
              You&apos;ve joined {collab?.owner?.name ? `${collab.owner.name}'s` : "this"} trip. Vote on stops you like, comment, and
              suggest changes.
            </p>
          ) : state === "error" ? (
            <p className="text-ink">{error}</p>
          ) : state === "joining" ? (
            <p className="flex items-center gap-2 text-ink">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Joining the trip…
            </p>
          ) : (
            <>
              <p className="font-serif text-xl text-ink">
                {collab?.owner?.name ?? "A friend"} invited you to plan this trip together
              </p>
              <p className="mt-1 text-sm text-ink-soft">Sign in to join. You&apos;ll be able to vote, comment and change the plan.</p>
            </>
          )}
        </div>
        {!user && state === "idle" && <SignInPrompt compact />}
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded p-1 text-ink-muted hover:text-ink">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
