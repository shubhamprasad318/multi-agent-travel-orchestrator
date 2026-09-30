"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Price, useMoney } from "@/lib/money";
import type { Slot } from "@/lib/types";
import type { EditSlot } from "./model";

const PERIODS: Slot["period"][] = ["morning", "afternoon", "evening"];

const fieldClass =
  "bg-transparent border-b border-transparent hover:border-rule focus:border-terracotta focus:outline-none transition-colors";

interface SlotCardProps {
  slot: EditSlot;
  onChange: (patch: Partial<Slot>) => void;
  onDelete: () => void;
}

/** A sortable stop in the editor. Only the grip starts a drag, so the inputs stay usable. */
export function SortableSlotCard({ slot, onChange, onDelete }: SlotCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "opacity-30")}
    >
      <SlotCardBody
        slot={slot}
        onChange={onChange}
        onDelete={onDelete}
        handle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${slot.activity || "stop"}. Press space to pick up, arrow keys to move, space to drop.`}
            className="flex h-full cursor-grab touch-none items-start px-1 pt-1 text-ink-muted hover:text-ink active:cursor-grabbing focus-visible:text-terracotta"
          >
            <GripVertical className="h-5 w-5" aria-hidden />
          </button>
        }
      />
    </li>
  );
}

/** The lifted card shown under the pointer while dragging. */
export function SlotCardOverlay({ slot }: { slot: EditSlot }) {
  return (
    <div className="rotate-[0.6deg] shadow-[0_18px_40px_-18px_rgba(31,27,22,0.55)]">
      <SlotCardBody
        slot={slot}
        readOnly
        handle={
          <span className="flex items-start px-1 pt-1 text-terracotta">
            <GripVertical className="h-5 w-5" aria-hidden />
          </span>
        }
      />
    </div>
  );
}

function SlotCardBody({
  slot,
  handle,
  onChange,
  onDelete,
  readOnly = false,
}: {
  slot: EditSlot;
  handle: React.ReactNode;
  onChange?: (patch: Partial<Slot>) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const money = useMoney();
  // Costs are stored in USD but edited in the traveller's currency.
  const rate = money.convert(1) || 1;

  return (
    <div className="flex gap-2 border border-rule bg-card px-2 py-3">
      {handle}
      <div className="min-w-0 flex-1 space-y-2">
        {readOnly ? (
          <p className="font-serif text-lg text-ink">{slot.activity}</p>
        ) : (
          <input
            aria-label="Activity"
            value={slot.activity}
            onChange={(e) => onChange?.({ activity: e.target.value })}
            placeholder="What are you doing?"
            className={cn(fieldClass, "w-full font-serif text-lg text-ink placeholder:text-ink/30")}
          />
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
          {readOnly ? (
            <span className="tabular-nums">{slot.start_time}</span>
          ) : (
            <input
              aria-label="Start time"
              value={slot.start_time}
              onChange={(e) => onChange?.({ start_time: e.target.value })}
              placeholder="09:00"
              maxLength={12}
              className={cn(fieldClass, "w-16 tabular-nums")}
            />
          )}

          {readOnly ? (
            <span className="capitalize">{slot.period}</span>
          ) : (
            <select
              aria-label="Time of day"
              value={slot.period}
              onChange={(e) => onChange?.({ period: e.target.value as Slot["period"] })}
              className={cn(fieldClass, "capitalize")}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}

          {slot.location && (
            <span className="inline-flex min-w-0 items-center gap-1 text-ink-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{slot.location}</span>
            </span>
          )}

          <span className="ml-auto flex items-center gap-1">
            {readOnly ? (
              <Price usd={slot.cost} free local={false} />
            ) : (
              <label className="flex items-center gap-1">
                <span className="text-xs text-ink-muted">{money.currency}</span>
                <input
                  aria-label={`Cost in ${money.currency}`}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={Math.round(slot.cost * rate)}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    onChange?.({ cost: Number.isFinite(value) && value > 0 ? value / rate : 0 });
                  }}
                  className={cn(fieldClass, "w-24 text-right tabular-nums")}
                />
              </label>
            )}
          </span>
        </div>
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remove ${slot.activity || "this stop"}`}
          className="self-start p-1 text-ink-muted hover:text-terracotta"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
