DROP POLICY IF EXISTS feedbacks_insert_confirmed_after_end ON public.feedbacks;

CREATE POLICY feedbacks_insert_confirmed_after_end
ON public.feedbacks
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = feedbacks.event_id
      AND e.end_at < now()
  )
  AND EXISTS (
    SELECT 1 FROM public.rsvps r
    WHERE r.event_id = feedbacks.event_id
      AND r.user_id = auth.uid()
      AND r.status = 'confirmed'::rsvp_status
  )
);