import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageMeta } from "@/components/PageMeta";
import { EventForm } from "@/components/events/EventForm";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { EventRow } from "@/lib/events";

const EventEdit = () => {
  const { id } = useParams();
  const [event, setEvent] = useState<EventRow | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, host_id, title, description, start_at, end_at, timezone, capacity, is_paid, state, visibility, cover_image_url, venue_address, venue_online_link")
        .eq("id", id)
        .maybeSingle();
      setEvent((data as EventRow) ?? null);
    })();
  }, [id]);

  return (
    <>
      <PageMeta title="edit event · null_collective" />
      <section className="container py-6 sm:py-10 max-w-3xl">
        <header className="mb-6">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./dashboard/events/{id}/edit</p>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow">edit event</h1>
        </header>
        {event === undefined ? (
          <Skeleton className="h-96 w-full rounded-md" />
        ) : event === null ? (
          <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
            <pre className="ascii-empty">{`> event not found or you don't have access.`}</pre>
            <Button asChild variant="outline" className="mt-4 font-mono-accent">
              <Link to="/dashboard">← back to dashboard</Link>
            </Button>
          </div>
        ) : (
          <EventForm mode="edit" initial={event} />
        )}
      </section>
    </>
  );
};
export default EventEdit;
