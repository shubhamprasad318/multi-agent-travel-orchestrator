"use client";

// Planning a trip together: who's in, and everyone's votes and comments on stops.
// Loaded once per plan and shared by the itinerary and the sharing dialog.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addComment, deleteComment, getCollab, voteOnStop } from "@/lib/api";
import { useUser } from "@/lib/auth";
import type { Collab, TravelPlan, TripComment, VoteTally } from "@/lib/types";

interface CollabState {
  collab: Collab | null;
  /** True when the signed-in user is the owner or an invited friend. */
  isParticipant: boolean;
  /** Whether this user may change the plan (refine, re-plan, edit). */
  canEdit: boolean;
  reload: () => void;
  vote: (slotId: string, value: -1 | 0 | 1) => Promise<void>;
  comment: (slotId: string, text: string) => Promise<void>;
  removeComment: (comment: TripComment) => Promise<void>;
}

const CollabContext = createContext<CollabState | null>(null);

// Plans made while signed out: anyone with the link can change them.
const OPEN: Collab = { role: "open", can_edit: true, owner: null, members: [], invite_code: null, votes: {}, comments: {} };

export function CollabProvider({ plan, children }: { plan: TravelPlan; children: React.ReactNode }) {
  const user = useUser();
  const [collab, setCollab] = useState<Collab | null>(plan.owner_id ? null : OPEN);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!plan.owner_id) {
      setCollab(OPEN);
      return;
    }
    const controller = new AbortController();
    getCollab(plan.id, controller.signal)
      .then(setCollab)
      .catch(() => {
        // Offline or the server is asleep: treat as view-only rather than failing the page.
        if (!controller.signal.aborted) setCollab({ ...OPEN, role: "viewer", can_edit: false });
      });
    return () => controller.abort();
    // Re-check when the user signs in or out.
  }, [plan.id, plan.owner_id, user?.id, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const vote = useCallback(
    async (slotId: string, value: -1 | 0 | 1) => {
      const tally: VoteTally = await voteOnStop(plan.id, slotId, value);
      setCollab((prev) => (prev ? { ...prev, votes: { ...prev.votes, [slotId]: tally } } : prev));
    },
    [plan.id]
  );

  const comment = useCallback(
    async (slotId: string, text: string) => {
      const created = await addComment(plan.id, slotId, text);
      setCollab((prev) =>
        prev ? { ...prev, comments: { ...prev.comments, [slotId]: [...(prev.comments[slotId] ?? []), created] } } : prev
      );
    },
    [plan.id]
  );

  const removeComment = useCallback(
    async (target: TripComment) => {
      await deleteComment(plan.id, target.id);
      setCollab((prev) =>
        prev
          ? { ...prev, comments: { ...prev.comments, [target.slot_id]: (prev.comments[target.slot_id] ?? []).filter((c) => c.id !== target.id) } }
          : prev
      );
    },
    [plan.id]
  );

  const value = useMemo<CollabState>(
    () => ({
      collab,
      isParticipant: collab?.role === "owner" || collab?.role === "member",
      canEdit: collab?.can_edit ?? !plan.owner_id,
      reload,
      vote,
      comment,
      removeComment,
    }),
    [collab, plan.owner_id, reload, vote, comment, removeComment]
  );

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}

export function useCollab(): CollabState {
  const value = useContext(CollabContext);
  if (!value) throw new Error("useCollab must be used inside <CollabProvider>");
  return value;
}
