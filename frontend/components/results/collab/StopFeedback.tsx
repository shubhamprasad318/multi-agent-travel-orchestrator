"use client";

import { useState } from "react";
import { Loader2, MessageCircle, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { PersonAvatar } from "@/components/layout/AccountMenu";
import { useCollab } from "@/lib/collab";
import { cn } from "@/lib/utils";

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Votes and a comment thread on one stop, for the trip's owner and invited friends.
 * Renders nothing for everyone else (including plans made while signed out).
 */
export default function StopFeedback({ slotId, activity }: { slotId: string | undefined; activity: string }) {
  const { collab, isParticipant, vote, comment, removeComment } = useCollab();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"vote" | "comment" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!slotId || !collab || !isParticipant) return null;
  const tally = collab.votes[slotId] ?? { up: 0, down: 0, mine: 0, up_names: [], down_names: [] };
  const thread = collab.comments[slotId] ?? [];

  const run = async (kind: "vote" | "comment", action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const castVote = (value: 1 | -1) => run("vote", () => vote(slotId, tally.mine === value ? 0 : value));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    run("comment", async () => {
      await comment(slotId, text);
      setDraft("");
    });
  };

  return (
    <div className="mt-2 print:hidden">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <VoteButton
          active={tally.mine === 1}
          count={tally.up}
          names={tally.up_names}
          label={`Keep ${activity}`}
          onClick={() => castVote(1)}
          disabled={busy !== null}
          icon={<ThumbsUp className="h-3.5 w-3.5" aria-hidden />}
          tone="teal"
        />
        <VoteButton
          active={tally.mine === -1}
          count={tally.down}
          names={tally.down_names}
          label={`Skip ${activity}`}
          onClick={() => castVote(-1)}
          disabled={busy !== null}
          icon={<ThumbsDown className="h-3.5 w-3.5" aria-hidden />}
          tone="terracotta"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-ink-muted hover:bg-rule/60 hover:text-ink transition-colors",
            thread.length > 0 && "text-ink-soft"
          )}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          {thread.length > 0 ? `${thread.length} comment${thread.length === 1 ? "" : "s"}` : "Comment"}
        </button>
        {busy === "vote" && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" aria-label="Saving vote" />}
      </div>

      {open && (
        <div className="mt-2 space-y-3 border-l-2 border-rule pl-3">
          {thread.map((c) => (
            <div key={c.id} className="flex gap-2">
              <PersonAvatar person={c.author} className="size-6 border-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-muted">
                  <span className="font-medium text-ink">{c.author.name}</span> · {when(c.created_at)}
                </p>
                <p className="whitespace-pre-line text-sm text-ink-soft">{c.text}</p>
              </div>
              {(c.mine || collab.role === "owner") && (
                <button
                  type="button"
                  onClick={() => run("comment", () => removeComment(c))}
                  aria-label="Delete comment"
                  className="self-start rounded p-1 text-ink-muted hover:text-terracotta"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
          <form onSubmit={submit} className="flex items-end gap-2">
            <label htmlFor={`comment-${slotId}`} className="sr-only">
              Comment on {activity}
            </label>
            <textarea
              id={`comment-${slotId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) submit(e);
              }}
              rows={1}
              maxLength={1000}
              placeholder="Add a comment…"
              className="min-h-[2.25rem] flex-1 resize-y border-b border-ink/30 bg-transparent py-1 text-sm text-ink placeholder:text-ink/35 focus:border-terracotta focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy !== null}
              className="rounded-full bg-ink px-3 py-1.5 text-xs text-paper hover:bg-terracotta disabled:opacity-40"
            >
              {busy === "comment" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Posting" /> : "Post"}
            </button>
          </form>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

function VoteButton({
  active,
  count,
  names,
  label,
  onClick,
  disabled,
  icon,
  tone,
}: {
  active: boolean;
  count: number;
  names: string[];
  label: string;
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  tone: "teal" | "terracotta";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${label}${count ? ` (${count}: ${names.join(", ")})` : ""}`}
      title={names.length ? names.join(", ") : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 tabular-nums transition-colors disabled:opacity-60",
        active
          ? tone === "teal"
            ? "bg-teal text-paper"
            : "bg-terracotta text-paper"
          : "text-ink-muted hover:bg-rule/60 hover:text-ink"
      )}
    >
      {icon}
      {count > 0 && count}
    </button>
  );
}
