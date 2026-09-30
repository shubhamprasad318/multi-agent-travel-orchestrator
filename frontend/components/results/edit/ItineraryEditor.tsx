"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertTriangle, Loader2 } from "lucide-react";
import { saveItinerary } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Price } from "@/lib/money";
import { cachePlan } from "@/lib/planCache";
import { cn } from "@/lib/utils";
import type { Itinerary, Slot } from "@/lib/types";
import AddStopForm from "./AddStopForm";
import {
  containerId,
  dayTotal,
  findDayIndex,
  fromDraft,
  isContainerId,
  newSlotId,
  signature,
  toDraft,
  tripTotal,
  type EditDay,
  type EditSlot,
} from "./model";
import { SlotCardOverlay, SortableSlotCard } from "./SlotCard";

interface ItineraryEditorProps {
  planId: string;
  itinerary: Itinerary;
  onCancel: () => void;
}

/** Counts real differences from the original (moves, edits, additions, removals), not keystrokes. */
function countChanges(original: EditDay[], draft: EditDay[]): number {
  const before = new Map<string, { day: number; slot: EditSlot }>();
  original.forEach((d) => d.slots.forEach((slot) => before.set(slot.id, { day: d.day, slot })));
  let changes = 0;
  const seen = new Set<string>();
  draft.forEach((d, dayIndex) => {
    if (d.theme !== original[dayIndex]?.theme) changes++;
    // Compare order only among stops that stayed in this day, so removing or
    // adding one stop doesn't count its neighbours as "moved".
    const stayed = d.slots.filter((s) => before.get(s.id)?.day === d.day).map((s) => s.id);
    const originalOrder = (original[dayIndex]?.slots ?? []).map((s) => s.id).filter((id) => stayed.includes(id));
    d.slots.forEach((slot) => {
      seen.add(slot.id);
      const prev = before.get(slot.id);
      if (!prev) return void changes++;
      const moved = prev.day !== d.day || stayed.indexOf(slot.id) !== originalOrder.indexOf(slot.id);
      const edited =
        prev.slot.activity !== slot.activity ||
        prev.slot.start_time !== slot.start_time ||
        prev.slot.period !== slot.period ||
        Math.abs(prev.slot.cost - slot.cost) > 0.005;
      if (moved || edited) changes++;
    });
  });
  before.forEach((_, id) => !seen.has(id) && changes++);
  return changes;
}

export default function ItineraryEditor({ planId, itinerary, onCancel }: ItineraryEditorProps) {
  const router = useRouter();
  const original = useMemo(() => toDraft(itinerary), [itinerary]);
  const [days, setDays] = useState<EditDay[]>(original);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beforeDrag = useRef<EditDay[] | null>(null);
  const latest = useRef(days);
  latest.current = days;
  const abortRef = useRef<AbortController | null>(null);

  const dirty = useMemo(() => signature(days) !== signature(original), [days, original]);
  const changes = useMemo(() => countChanges(original, days), [original, days]);
  const totalStops = days.reduce((n, d) => n + d.slots.length, 0);
  const emptyDays = days.filter((d) => d.slots.length === 0).map((d) => d.day);
  const blankActivities = days.some((d) => d.slots.some((s) => !s.activity.trim()));

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short press-and-hold on touch screens, so scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const slotById = (id: string) => latest.current.flatMap((d) => d.slots).find((s) => s.id === id);
  const dayOf = (id: string) => latest.current[findDayIndex(latest.current, id)]?.day;
  const name = (id: string | number) => slotById(String(id))?.activity || "stop";

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)} from day ${dayOf(String(active.id))}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over day ${dayOf(String(over.id))}.` : undefined),
    onDragEnd: ({ active, over }) =>
      over ? `Moved ${name(active.id)} to day ${dayOf(String(active.id))}.` : `${name(active.id)} dropped back in place.`,
    onDragCancel: ({ active }) => `Cancelled. ${name(active.id)} returned to day ${dayOf(String(active.id))}.`,
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    beforeDrag.current = latest.current;
    setActiveId(String(active.id));
  };

  // Moving between days happens while dragging, so the card follows the pointer into the new list.
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    setDays((prev) => {
      const from = findDayIndex(prev, activeKey);
      const to = findDayIndex(prev, overKey);
      if (from < 0 || to < 0 || from === to) return prev;
      const moving = prev[from].slots.find((s) => s.id === activeKey);
      if (!moving) return prev;
      const target = prev[to].slots;
      const overIndex = isContainerId(overKey) ? target.length : target.findIndex((s) => s.id === overKey);
      const insertAt = overIndex < 0 ? target.length : overIndex;
      return prev.map((day, i) => {
        if (i === from) return { ...day, slots: day.slots.filter((s) => s.id !== activeKey) };
        if (i === to) return { ...day, slots: [...target.slice(0, insertAt), moving, ...target.slice(insertAt)] };
        return day;
      });
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    beforeDrag.current = null;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    setDays((prev) => {
      const dayIndex = findDayIndex(prev, activeKey);
      if (dayIndex < 0 || findDayIndex(prev, overKey) !== dayIndex || isContainerId(overKey)) return prev;
      const slots = prev[dayIndex].slots;
      const oldIndex = slots.findIndex((s) => s.id === activeKey);
      const newIndex = slots.findIndex((s) => s.id === overKey);
      if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return prev;
      return prev.map((day, i) => (i === dayIndex ? { ...day, slots: arrayMove(slots, oldIndex, newIndex) } : day));
    });
  };

  const handleDragCancel = () => {
    if (beforeDrag.current) setDays(beforeDrag.current);
    beforeDrag.current = null;
    setActiveId(null);
  };

  const updateSlot = (id: string, patch: Partial<Slot>) =>
    setDays((prev) => prev.map((d) => ({ ...d, slots: d.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) })));
  const deleteSlot = (id: string) => setDays((prev) => prev.map((d) => ({ ...d, slots: d.slots.filter((s) => s.id !== id) })));
  const addSlot = (day: number, slot: Slot) =>
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, slots: [...d.slots, { ...slot, id: newSlotId() }] } : d)));
  const setTheme = (day: number, theme: string) => setDays((prev) => prev.map((d) => (d.day === day ? { ...d, theme } : d)));

  const discard = () => {
    if (dirty && !window.confirm("Discard your changes to the itinerary?")) return;
    onCancel();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    abortRef.current = new AbortController();
    try {
      const plan = await saveItinerary(planId, fromDraft(days, itinerary), abortRef.current.signal);
      cachePlan(plan);
      router.push(`/results?id=${plan.id}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  const activeSlot = activeId ? days.flatMap((d) => d.slots).find((s) => s.id === activeId) : null;
  const canSave = dirty && totalStops > 0 && !blankActivities && !saving;
  const saveHint =
    totalStops === 0 ? "Add at least one stop." : blankActivities ? "Every stop needs a name." : !dirty ? "No changes yet." : null;

  return (
    <div>
      <p className="mb-8 max-w-2xl text-ink-soft">
        Drag stops by the handle to reorder them or move them to another day. You can also rename, retime or reprice them. Saving creates a new
        version, and the editor re-scores it.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "To pick up a stop, press space or enter. Use the arrow keys to move it, then press space or enter again to drop it, or escape to cancel.",
          },
        }}
      >
        <ol className="space-y-12">
          {days.map((day) => (
            <li key={day.day} className="grid gap-4 md:grid-cols-[8rem_1fr] md:gap-10">
              <div className="md:border-t md:border-rule md:pt-3">
                <p className="font-serif text-6xl leading-none text-terracotta tabular-nums">{String(day.day).padStart(2, "0")}</p>
                <p className="mt-2 text-sm text-ink-muted">{formatDate(day.date, { weekday: "long", month: "short", day: "numeric" })}</p>
              </div>
              <div className="border-t border-ink pt-3">
                <input
                  aria-label={`Theme for day ${day.day}`}
                  value={day.theme}
                  onChange={(e) => setTheme(day.day, e.target.value)}
                  className="w-full bg-transparent font-serif text-2xl text-ink border-b border-transparent hover:border-rule focus:border-terracotta focus:outline-none"
                />
                <SortableContext id={containerId(day.day)} items={day.slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <DayDropZone day={day.day} empty={day.slots.length === 0}>
                    {day.slots.map((slot) => (
                      <SortableSlotCard
                        key={slot.id}
                        slot={slot}
                        onChange={(patch) => updateSlot(slot.id, patch)}
                        onDelete={() => deleteSlot(slot.id)}
                      />
                    ))}
                  </DayDropZone>
                </SortableContext>
                {day.slots.length === 0 && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-ochre">
                    <AlertTriangle className="h-4 w-4" aria-hidden /> This day has no stops.
                  </p>
                )}
                <AddStopForm dayNumber={day.day} onAdd={(slot) => addSlot(day.day, slot)} />
                <div className="mt-4 flex items-baseline justify-end gap-3 border-t border-rule pt-3">
                  <span className="text-sm text-ink-muted">Day total{day.meals.length > 0 ? " incl. meals" : ""}</span>
                  <Price usd={dayTotal(day)} className="font-serif text-xl text-ink" localClassName="font-sans" />
                </div>
              </div>
            </li>
          ))}
        </ol>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }}>
          {activeSlot ? <SlotCardOverlay slot={activeSlot} /> : null}
        </DragOverlay>
      </DndContext>

      <div className="sticky bottom-0 z-40 -mx-5 mt-12 bg-ink px-5 py-4 text-paper md:-mx-8 md:px-8 print:hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="text-sm">
            <span className="font-semibold">
              {dirty ? `${changes} change${changes === 1 ? "" : "s"}` : "No changes"}
            </span>
            <span className="text-paper/70">
              {" · "}On the ground <Price usd={tripTotal(days)} local={false} className="text-paper" />
              {dirty && (
                <>
                  {" "}(was <Price usd={tripTotal(original)} local={false} />)
                </>
              )}
            </span>
            {emptyDays.length > 0 && (
              <span className="text-ochre-light">
                {" · "}Day {emptyDays.join(", ")} {emptyDays.length === 1 ? "is" : "are"} empty
              </span>
            )}
          </p>
          <span className="flex-1" />
          {saveHint && !saving && <span className="text-xs text-paper/60">{saveHint}</span>}
          <button type="button" onClick={discard} disabled={saving} className="text-sm text-paper/80 underline underline-offset-4 hover:text-paper disabled:opacity-50">
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-full bg-ochre px-5 py-2 text-sm font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving & re-scoring…
              </>
            ) : (
              "Save as new version"
            )}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-terracotta-light">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Each day is a drop target, so stops can be dropped into an empty day too. */
function DayDropZone({ day, empty, children }: { day: number; empty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId(day) });
  return (
    <ul
      ref={setNodeRef}
      className={cn(
        "mt-4 min-h-[4.5rem] space-y-2 transition-colors",
        empty && "flex items-center justify-center border border-dashed border-rule",
        isOver && empty && "border-terracotta bg-terracotta-light/40"
      )}
    >
      {empty ? <li className="list-none text-sm text-ink-muted">Drop a stop here</li> : children}
    </ul>
  );
}
