"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, Loader2, MessageCircle, Wand2, X } from "lucide-react";
import { askAboutPlan, refineTravelPlan } from "@/lib/api";
import { safeUrl } from "@/lib/format";
import { cachePlan } from "@/lib/planCache";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatReply, TravelPlan } from "@/lib/types";

// The backend accepts at most 20 messages of up to 2000 characters, ending with the user's.
const MAX_HISTORY = 20;
const MAX_LENGTH = 2000;

/** One turn in the conversation; assistant turns keep the full reply for sources/suggestions. */
interface Turn {
  role: ChatMessage["role"];
  content: string;
  reply?: ChatReply;
}

const storageKey = (planId: string) => `tripChat:${planId}`;

function loadTurns(planId: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(storageKey(planId));
    return raw ? (JSON.parse(raw) as Turn[]) : [];
  } catch {
    return [];
  }
}

function saveTurns(planId: string, turns: Turn[]): void {
  try {
    sessionStorage.setItem(storageKey(planId), JSON.stringify(turns));
  } catch {
    /* storage unavailable */
  }
}

function starterQuestions(plan: TravelPlan): string[] {
  const destination = plan.trip.destination.split(",")[0].trim() || "the destination";
  const firstStop = plan.itinerary?.days[0]?.slots[0]?.location;
  const hotelArea = plan.bookings?.hotels[0]?.area;
  return [
    "What should I pack for day 1?",
    firstStop ? `Where can I eat near ${firstStop}?` : `What should I eat in ${destination}?`,
    hotelArea ? `Is ${hotelArea} a good base?` : "Which area is the best base for this trip?",
    `What's the best way to get around ${destination}?`,
  ];
}

/** `canApply`: whether this user may change the plan (so the "apply this change" button shows). */
export default function TripChat({ plan, canApply = true }: { plan: TravelPlan; canApply?: boolean }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore this plan's conversation (sessionStorage is client-only).
  useEffect(() => {
    setTurns(loadTurns(plan.id));
    setError(null);
  }, [plan.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending, open]);

  // Auto-grow the textarea up to about five lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [draft, open]);

  const send = useCallback(
    async (history: Turn[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPending(true);
      setError(null);
      try {
        const messages: ChatMessage[] = history.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
        const reply = await askAboutPlan(plan.id, messages, controller.signal);
        const next: Turn[] = [...history, { role: "assistant", content: reply.answer, reply }];
        setTurns(next);
        saveTurns(plan.id, next);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "The concierge couldn't answer that.");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setPending(false);
        }
      }
    },
    [plan.id]
  );

  const ask = (question: string) => {
    const content = question.trim().slice(0, MAX_LENGTH);
    if (!content || pending) return;
    const history: Turn[] = [...turns, { role: "user", content }];
    setTurns(history);
    saveTurns(plan.id, history);
    setDraft("");
    void send(history);
  };

  // Retry re-sends the conversation as it stands (it already ends with the user's question).
  const retry = () => {
    if (turns.at(-1)?.role === "user") void send(turns);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Closing cancels an in-flight question; the user can ask again.
      abortRef.current?.abort();
      abortRef.current = null;
      setPending(false);
    }
  };

  const lastIsUnanswered = turns.at(-1)?.role === "user" && !pending;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Ask about this trip"
          className="fixed z-40 bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] inline-flex items-center gap-2 rounded-full bg-ink p-3.5 text-paper shadow-[0_12px_30px_-10px_rgba(31,27,22,0.6)] transition-colors hover:bg-terracotta sm:px-5 sm:py-3 print:hidden"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          <span className="hidden text-sm font-medium sm:inline">Ask about this trip</span>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby="trip-chat-description"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-paper text-ink shadow-2xl sm:w-[440px] sm:border-l sm:border-rule data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right motion-reduce:animate-none"
        >
          <header className="flex items-start justify-between gap-4 border-b border-rule px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <div>
              <p className="eyebrow">Ask anything about this trip</p>
              <DialogPrimitive.Title className="mt-1 font-serif text-3xl text-ink">Your concierge</DialogPrimitive.Title>
              <DialogPrimitive.Description id="trip-chat-description" className="mt-1 text-sm text-ink-muted">
                Answers use your itinerary for {plan.trip.destination}, plus live web search.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="-mr-1 rounded-full p-2 text-ink-muted transition-colors hover:bg-paper-deep hover:text-ink"
              aria-label="Close concierge"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
            {turns.length === 0 ? (
              <div>
                <p className="font-serif text-xl italic text-ink-soft">
                  Ask about packing, food, neighbourhoods, opening hours, or ask for a change to the plan.
                </p>
                <ul className="mt-6 space-y-2">
                  {starterQuestions(plan).map((question) => (
                    <li key={question}>
                      <button
                        type="button"
                        onClick={() => ask(question)}
                        className="w-full rounded-sm border border-rule px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink"
                      >
                        {question}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="space-y-5" aria-live="polite" aria-relevant="additions">
                {turns.map((turn, i) =>
                  turn.role === "user" ? (
                    <li key={i} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-[15px] text-paper">
                        {turn.content}
                      </p>
                    </li>
                  ) : (
                    <li key={i} className="max-w-[92%]">
                      <AssistantTurn
                        turn={turn}
                        plan={plan}
                        onAsk={ask}
                        disabled={pending}
                        latest={i === turns.length - 1}
                        onNavigate={() => setOpen(false)}
                        canApply={canApply}
                      />
                    </li>
                  )
                )}
                {pending && (
                  <li aria-label="The concierge is typing" className="flex w-fit gap-1.5 rounded-2xl rounded-bl-sm bg-paper-deep px-4 py-3.5">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-2 w-2 rounded-full bg-ink-muted animate-bounce motion-reduce:animate-none"
                        style={{ animationDelay: `${dot * 0.15}s` }}
                      />
                    ))}
                  </li>
                )}
              </ol>
            )}

            {error && lastIsUnanswered && (
              <div role="alert" className="mt-5 border-l-2 border-terracotta bg-terracotta-light/50 px-4 py-3 text-sm">
                <p className="text-ink">{error}</p>
                <button type="button" onClick={retry} className="mt-2 font-medium text-terracotta link-underline">
                  Retry
                </button>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="border-t border-rule px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
          >
            <label htmlFor="trip-chat-input" className="sr-only">
              Your question
            </label>
            <div className="flex items-end gap-2 border-b-2 border-ink pb-2 focus-within:border-terracotta transition-colors">
              <textarea
                id="trip-chat-input"
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={MAX_LENGTH}
                disabled={pending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                placeholder="Ask about your trip…"
                className="flex-1 resize-none bg-transparent py-1 text-[15px] text-ink placeholder:text-ink/35 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                aria-label="Send question"
                className="shrink-0 rounded-full bg-terracotta p-2 text-paper transition-colors hover:bg-terracotta-dark disabled:opacity-40"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink-muted">Enter to send · Shift+Enter for a new line</p>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function AssistantTurn({
  turn,
  plan,
  onAsk,
  disabled,
  latest,
  onNavigate,
  canApply,
}: {
  turn: Turn;
  plan: TravelPlan;
  onAsk: (question: string) => void;
  disabled: boolean;
  latest: boolean;
  onNavigate: () => void;
  canApply: boolean;
}) {
  const reply = turn.reply;
  const paragraphs = turn.content.split(/\n{2,}/).filter((p) => p.trim());
  const sources = (reply?.sources ?? []).map((s) => ({ ...s, url: safeUrl(s.url) })).filter((s) => s.url);

  return (
    <div>
      <div className="rounded-2xl rounded-bl-sm bg-paper-deep px-4 py-3 text-[15px] leading-relaxed text-ink">
        {paragraphs.map((p, i) => (
          <p key={i} className={cn("whitespace-pre-line", i > 0 && "mt-3")}>
            {p}
          </p>
        ))}
      </div>

      {sources.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1">
          {sources.map((source) => (
            <li key={source.url}>
              <a href={source.url!} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-muted link-underline hover:text-terracotta">
                {source.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {reply?.change_request && canApply && <ApplyChange plan={plan} instruction={reply.change_request} onNavigate={onNavigate} />}

      {latest && reply && reply.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {reply.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(suggestion)}
              className="rounded-full border border-rule px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplyChange({ plan, instruction, onNavigate }: { plan: TravelPlan; instruction: string; onNavigate: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const apply = async () => {
    setState("pending");
    setMessage(null);
    try {
      const refined = await refineTravelPlan(plan.id, instruction);
      cachePlan(refined);
      onNavigate();
      router.push(`/results?id=${refined.id}`);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Couldn't apply the change.");
    }
  };

  return (
    <div className="mt-3 border-l-2 border-ochre bg-ochre-light/40 px-4 py-3">
      <p className="eyebrow text-ink-muted">Suggested change</p>
      <p className="mt-1 font-serif italic text-ink">{instruction}</p>
      <button
        type="button"
        onClick={apply}
        disabled={state === "pending"}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-terracotta disabled:opacity-60"
      >
        {state === "pending" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Rewriting the plan…
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" aria-hidden /> Apply this change
          </>
        )}
      </button>
      {message && (
        <p role="alert" className="mt-2 text-sm text-terracotta">
          {message}
        </p>
      )}
    </div>
  );
}
