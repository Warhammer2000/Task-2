import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type RsvpStatus = "confirmed" | "waitlist" | "cancelled";

export interface MyRsvp {
  id: string;
  status: RsvpStatus;
  position: number | null;
  ticket_code: string | null;
}

/** Loads the current user's RSVP for an event (if any) and exposes mutators. */
export function useMyRsvp(eventId: string | undefined) {
  const { user, session } = useAuth();
  const [rsvp, setRsvp] = useState<MyRsvp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!eventId || !user) {
      setRsvp(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("rsvps")
      .select("id, status, position, tickets ( code )")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const ticketCode = Array.isArray(data.tickets)
        ? (data.tickets[0]?.code ?? null)
        : ((data.tickets as { code: string } | null)?.code ?? null);
      setRsvp({
        id: data.id,
        status: data.status as RsvpStatus,
        position: data.position,
        ticket_code: ticketCode,
      });
    } else {
      setRsvp(null);
    }
    setLoading(false);
  }, [eventId, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(async () => {
    if (!eventId || !session) return { ok: false, error: "unauthenticated" as const };
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("rsvp-create", {
        body: { event_id: eventId },
      });
      if (error) return { ok: false, error: error.message };
      await reload();
      return { ok: true, ...(data as { status: RsvpStatus; position: number | null }) };
    } finally {
      setBusy(false);
    }
  }, [eventId, session, reload]);

  const cancel = useCallback(async () => {
    if (!rsvp || !session) return { ok: false };
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("rsvp-cancel", {
        body: { rsvp_id: rsvp.id },
      });
      if (error) return { ok: false, error: error.message };
      await reload();
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [rsvp, session, reload]);

  return { rsvp, loading, busy, create, cancel, reload };
}
