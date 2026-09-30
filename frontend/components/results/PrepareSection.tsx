"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Cloud, Loader2, Plus, X } from "lucide-react";
import { getChecklist, saveChecklist } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { downloadRemindersIcs } from "@/lib/calendar";
import { formatDate, toISODate } from "@/lib/format";
import { PACKING_LABEL, PACKING_ORDER, packingItems, packingKey, relativeDay, reminders as buildReminders } from "@/lib/prep";
import type { Checklist, PackingCategory, TravelPlan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { newSlotId } from "./edit/model";
import { EmptyState, ExternalLink, Section } from "./shared";

const EMPTY: Checklist = { checked: [], custom: [], updated_at: null };
const localKey = (root: string) => `checklist:${root}`;

function readLocal(root: string): Checklist {
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey(root)) ?? "null");
    return parsed && Array.isArray(parsed.checked) ? { ...EMPTY, ...parsed } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeLocal(root: string, checklist: Checklist): void {
  try {
    localStorage.setItem(localKey(root), JSON.stringify(checklist));
  } catch {
    /* storage disabled */
  }
}

/**
 * This traveller's checklist for the trip: saved to their account when signed
 * in (so it follows them to their phone), otherwise to this browser.
 */
function useChecklist(plan: TravelPlan) {
  const user = useUser();
  const root = plan.root_id ?? plan.id;
  const [checklist, setChecklist] = useState<Checklist>(EMPTY);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(checklist);

  useEffect(() => {
    const local = readLocal(root);
    setChecklist(local);
    latest.current = local;
    if (!user) {
      setStatus("ready");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    getChecklist(plan.id, controller.signal)
      .then(async (remote) => {
        // First sign-in on this trip: bring along what was ticked while signed out.
        const merged: Checklist =
          remote.updated_at || (local.checked.length === 0 && local.custom.length === 0)
            ? remote
            : await saveChecklist(plan.id, local).catch(() => local);
        setChecklist(merged);
        latest.current = merged;
        writeLocal(root, merged);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("ready"); // offline: this browser's copy
      });
    return () => controller.abort();
  }, [plan.id, root, user]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const update = useCallback(
    (change: (prev: Checklist) => Checklist) => {
      const next = change(latest.current);
      latest.current = next;
      setChecklist(next);
      writeLocal(root, next);
      if (!user) return;
      // Ticking several items quickly makes one request.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setStatus("saving");
      saveTimer.current = setTimeout(() => {
        saveChecklist(plan.id, latest.current)
          .then(() => setStatus("ready"))
          .catch(() => setStatus("error"));
      }, 600);
    },
    [plan.id, root, user]
  );

  const toggle = (key: string) =>
    update((prev) => ({ ...prev, checked: prev.checked.includes(key) ? prev.checked.filter((k) => k !== key) : [...prev.checked, key] }));

  return { checklist, status, signedIn: Boolean(user), toggle, update };
}

export default function PrepareSection({ plan }: { plan: TravelPlan }) {
  const { checklist, status, signedIn, toggle, update } = useChecklist(plan);
  const today = useMemo(() => toISODate(new Date()), []);
  const items = packingItems(plan);
  const todos = useMemo(() => buildReminders(plan, today), [plan, today]);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState<PackingCategory>("other");

  const all = [
    ...items.map((i) => ({ key: packingKey(i.item), item: i.item, category: i.category, reason: i.reason, custom: null as string | null })),
    ...checklist.custom.map((c) => ({ key: packingKey(c.item), item: c.item, category: c.category, reason: null, custom: c.id })),
  ].filter((entry, index, list) => list.findIndex((e) => e.key === entry.key) === index);
  const packed = all.filter((e) => checklist.checked.includes(e.key)).length;
  const started = plan.trip.start_date <= today;

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newItem.trim();
    if (!text || all.some((entry) => entry.key === packingKey(text))) return;
    update((prev) => ({ ...prev, custom: [...prev.custom, { id: newSlotId(), item: text.slice(0, 80), category: newCategory }].slice(-60) }));
    setNewItem("");
  };

  const removeCustom = (id: string, key: string) =>
    update((prev) => ({ ...prev, custom: prev.custom.filter((c) => c.id !== id), checked: prev.checked.filter((k) => k !== key) }));

  const syncNote =
    status === "loading" ? (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading your list
      </span>
    ) : signedIn ? (
      <span className={cn("inline-flex items-center gap-1.5 text-sm", status === "error" ? "text-terracotta" : "text-ink-muted")}>
        <Cloud className="h-3.5 w-3.5" aria-hidden />
        {status === "saving" ? "Saving…" : status === "error" ? "Not saved, will retry on your next tick" : "Saved to your account"}
      </span>
    ) : (
      <span className="text-sm text-ink-muted">Saved on this device. Sign in to have it on your phone too.</span>
    );

  return (
    <Section eyebrow="Before you go" title="Get ready" aside={syncNote}>
      <div className="grid gap-16 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="packing-heading">
          <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
            <h3 id="packing-heading" className="font-serif text-2xl text-ink">
              Packing list
            </h3>
            {all.length > 0 && (
              <p className="text-sm tabular-nums text-ink-muted" aria-live="polite">
                {packed} of {all.length} packed
              </p>
            )}
          </div>
          {all.length > 0 && (
            <div className="mt-3 h-1 bg-rule" aria-hidden>
              <div className="h-1 bg-teal transition-all" style={{ width: `${(packed / all.length) * 100}%` }} />
            </div>
          )}
          {items.length === 0 && checklist.custom.length === 0 && (
            <div className="mt-6">
              <EmptyState message="No packing suggestions for this plan. Add your own below." />
            </div>
          )}
          <div className="mt-6 space-y-8">
            {PACKING_ORDER.map((category) => {
              const group = all.filter((e) => e.category === category);
              if (group.length === 0) return null;
              return (
                <fieldset key={category}>
                  <legend className="eyebrow text-ink-muted">{PACKING_LABEL[category]}</legend>
                  <ul className="mt-2 divide-y divide-rule">
                    {group.map((entry) => {
                      const checked = checklist.checked.includes(entry.key);
                      return (
                        <li key={entry.key} className="flex items-start gap-3 py-2.5">
                          <input
                            id={`pack-${entry.key}`}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(entry.key)}
                            className="mt-1 h-4 w-4 shrink-0 accent-teal"
                          />
                          <label htmlFor={`pack-${entry.key}`} className="min-w-0 flex-1 cursor-pointer">
                            <span className={cn("text-ink", checked && "text-ink-muted line-through")}>{entry.item}</span>
                            {entry.reason && <span className="block text-sm text-ink-muted">{entry.reason}</span>}
                          </label>
                          {entry.custom && (
                            <button
                              type="button"
                              onClick={() => removeCustom(entry.custom!, entry.key)}
                              aria-label={`Remove ${entry.item}`}
                              className="rounded p-1 text-ink-muted hover:text-terracotta print:hidden"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })}
          </div>
          <form onSubmit={addItem} className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
            <label htmlFor="new-pack-item" className="sr-only">
              Add an item
            </label>
            <input
              id="new-pack-item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              maxLength={80}
              placeholder="Add something to pack"
              className="min-w-[12rem] flex-1 border-b border-ink/30 bg-transparent pb-1.5 text-ink placeholder:text-ink/35 focus:border-terracotta focus:outline-none"
            />
            <label htmlFor="new-pack-category" className="sr-only">
              Category
            </label>
            <select
              id="new-pack-category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as PackingCategory)}
              className="border-b border-ink/30 bg-transparent pb-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
            >
              {PACKING_ORDER.map((c) => (
                <option key={c} value={c}>
                  {PACKING_LABEL[c]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!newItem.trim()}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add
            </button>
          </form>
        </section>

        <section aria-labelledby="todo-heading">
          <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
            <h3 id="todo-heading" className="font-serif text-2xl text-ink">
              To do
            </h3>
            {!started && (
              <button
                type="button"
                onClick={() => downloadRemindersIcs(plan, todos.filter((t) => !checklist.checked.includes(`todo:${t.id}`)))}
                className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-terracotta print:hidden"
              >
                <BellRing className="h-4 w-4" aria-hidden /> Add reminders to calendar
              </button>
            )}
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            {started
              ? "Your trip has started. Enjoy it!"
              : `Your trip starts ${relativeDay(plan.trip.start_date, today)}. Suggested dates are working back from ${formatDate(plan.trip.start_date, { month: "long", day: "numeric" })}.`}
          </p>
          <ol className="mt-4 divide-y divide-rule">
            {todos.map((todo) => {
              const key = `todo:${todo.id}`;
              const done = checklist.checked.includes(key);
              const overdue = !done && !started && todo.due <= today;
              return (
                <li key={todo.id} className="flex items-start gap-3 py-3">
                  <input
                    id={key}
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(key)}
                    className="mt-1 h-4 w-4 shrink-0 accent-teal"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={key} className={cn("cursor-pointer text-ink", done && "text-ink-muted line-through")}>
                      {todo.title}
                    </label>
                    {todo.detail && <p className="text-sm text-ink-muted">{todo.detail}</p>}
                    {todo.href && !done && (
                      <ExternalLink href={todo.href} className="mt-1 text-sm">
                        Search options
                      </ExternalLink>
                    )}
                  </div>
                  {!started && (
                    <span className={cn("shrink-0 text-xs tabular-nums", overdue ? "font-medium text-terracotta" : "text-ink-muted")}>
                      {overdue ? "now" : relativeDay(todo.due, today)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </Section>
  );
}
