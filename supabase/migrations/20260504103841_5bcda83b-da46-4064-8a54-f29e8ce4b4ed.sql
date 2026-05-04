-- Helper: next FIFO waitlist position for an event
CREATE OR REPLACE FUNCTION public.next_waitlist_position(_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(position), 0) + 1
  FROM public.rsvps
  WHERE event_id = _event_id AND status = 'waitlist';
$$;

GRANT EXECUTE ON FUNCTION public.next_waitlist_position(uuid) TO authenticated;

-- Core: promote_waitlist — promotes one waitlisted user per available seat,
-- atomic via FOR UPDATE SKIP LOCKED, idempotent.
CREATE OR REPLACE FUNCTION public.promote_waitlist(_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_confirmed integer;
  v_seats_open integer;
  v_promoted integer := 0;
  r record;
BEGIN
  -- Lock the event row to serialize promotions for this event.
  SELECT capacity INTO v_capacity
  FROM public.events
  WHERE id = _event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Capacity = 0 is treated as "sold out / no auto-promotion".
  IF v_capacity <= 0 THEN
    RETURN 0;
  END IF;

  LOOP
    SELECT COUNT(*) INTO v_confirmed
    FROM public.rsvps
    WHERE event_id = _event_id AND status = 'confirmed';

    v_seats_open := v_capacity - v_confirmed;
    EXIT WHEN v_seats_open <= 0;

    -- Pick the oldest waitlisted RSVP not currently locked.
    SELECT id, user_id
      INTO r
    FROM public.rsvps
    WHERE event_id = _event_id AND status = 'waitlist'
    ORDER BY position ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    UPDATE public.rsvps
    SET status = 'confirmed',
        confirmed_at = now(),
        position = NULL
    WHERE id = r.id;

    -- Issue ticket if not already present.
    INSERT INTO public.tickets (rsvp_id, code)
    VALUES (r.id, encode(gen_random_bytes(16), 'hex'))
    ON CONFLICT (rsvp_id) DO NOTHING;

    -- Notify the user.
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      r.user_id,
      'waitlist_promoted',
      jsonb_build_object('event_id', _event_id)
    );

    v_promoted := v_promoted + 1;
  END LOOP;

  RETURN v_promoted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_waitlist(uuid) TO authenticated;

-- Unique constraint so ON CONFLICT works for tickets.rsvp_id (one ticket per rsvp).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_rsvp_id_key'
  ) THEN
    ALTER TABLE public.tickets ADD CONSTRAINT tickets_rsvp_id_key UNIQUE (rsvp_id);
  END IF;
END $$;

-- Trigger: on RSVP UPDATE (cancellation/status change) or DELETE, attempt promotion.
CREATE OR REPLACE FUNCTION public.trg_rsvp_change_promote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
    -- Only attempt promotion if a confirmed seat freed up.
    IF OLD.status = 'confirmed' THEN
      PERFORM public.promote_waitlist(v_event_id);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_event_id := NEW.event_id;
    -- Promotion is needed when a confirmed RSVP transitions away from confirmed.
    IF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
      PERFORM public.promote_waitlist(v_event_id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS rsvps_change_promote ON public.rsvps;
CREATE TRIGGER rsvps_change_promote
AFTER UPDATE OR DELETE ON public.rsvps
FOR EACH ROW EXECUTE FUNCTION public.trg_rsvp_change_promote();

-- Trigger: on capacity grown, attempt promotion.
CREATE OR REPLACE FUNCTION public.trg_event_capacity_promote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.capacity > OLD.capacity THEN
    PERFORM public.promote_waitlist(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_capacity_promote ON public.events;
CREATE TRIGGER events_capacity_promote
AFTER UPDATE OF capacity ON public.events
FOR EACH ROW EXECUTE FUNCTION public.trg_event_capacity_promote();

-- Index to make FIFO ordering fast.
CREATE INDEX IF NOT EXISTS idx_rsvps_event_status_position
  ON public.rsvps (event_id, status, position, created_at);