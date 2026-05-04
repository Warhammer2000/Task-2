import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQrDataUrl } from "@/hooks/useQrDataUrl";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { formatEventWindow } from "@/lib/events";
import { CalendarPlus, MapPin, Globe2 } from "lucide-react";

interface TicketRow {
  ticket_id: string;
  ticket_code: string;
  rsvp_id: string;
  status: "confirmed" | "waitlist" | "cancelled";
  position: number | null;
  event_id: string;
  event_title: string;
  event_description: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  venue_address: string | null;
  venue_online_link: string | null;
}

const MyTickets = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<TicketRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("rsvps")
        .select(`
          id, status, position, event_id,
          events!inner ( id, title, description, start_at, end_at, timezone, venue_address, venue_online_link ),
          tickets ( id, code )
        `)
        .eq("user_id", user.id)
        .eq("status", "confirmed")
        .gte("events.end_at", new Date().toISOString())
        .order("start_at", { foreignTable: "events", ascending: true });

      if (!data) {
        setRows([]);
        return;
      }
      const flat: TicketRow[] = (data as unknown as Array<{
        id: string;
        status: TicketRow["status"];
        position: number | null;
        event_id: string;
        events: {
          id: string; title: string; description: string | null;
          start_at: string; end_at: string; timezone: string;
          venue_address: string | null; venue_online_link: string | null;
        };
        tickets: { id: string; code: string }[] | { id: string; code: string } | null;
      }>)
        .map((r) => {
          const ticket = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
          if (!ticket) return null;
          return {
            ticket_id: ticket.id,
            ticket_code: ticket.code,
            rsvp_id: r.id,
            status: r.status,
            position: r.position,
            event_id: r.events.id,
            event_title: r.events.title,
            event_description: r.events.description,
            start_at: r.events.start_at,
            end_at: r.events.end_at,
            timezone: r.events.timezone,
            venue_address: r.events.venue_address,
            venue_online_link: r.events.venue_online_link,
          } satisfies TicketRow;
        })
        .filter((x): x is TicketRow => x !== null);
      setRows(flat);
    })();
  }, [user]);

  return (
    <>
      <PageMeta title="my tickets · null_collective" />
      <section className="container py-6 sm:py-10 max-w-3xl">
        <header className="mb-6 sm:mb-8">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./my/tickets</p>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-glow text-primary">your tickets</h1>
          <p className="mt-2 text-sm text-muted-foreground">upcoming confirmed RSVPs only</p>
        </header>

        {rows === null ? (
          <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-md" />)}</div>
        ) : rows.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
            <pre className="ascii-empty">{`┌──────────────────────────────────┐
│  no upcoming tickets             │
│  RSVP to an event to see one     │
│  here. find events at ./explore  │
└──────────────────────────────────┘`}</pre>
            <Button asChild variant="outline" className="mt-4 font-mono-accent">
              <Link to="/">browse events →</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {rows.map((r) => <TicketCard key={r.ticket_id} row={r} />)}
          </div>
        )}
      </section>
    </>
  );
};

function TicketCard({ row }: { row: TicketRow }) {
  const qrPayload = `null_collective:ticket:${row.ticket_code}`;
  const qr = useQrDataUrl(qrPayload, 220);

  const handleAddToCalendar = () => {
    const ics = buildIcs({
      uid: row.ticket_id,
      title: row.event_title,
      description: row.event_description ?? undefined,
      startISO: row.start_at,
      endISO: row.end_at,
      location: row.venue_address ?? row.venue_online_link ?? undefined,
      url: typeof window !== "undefined" ? `${window.location.origin}/events/${row.event_id}` : undefined,
    });
    downloadIcs(`${row.event_title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.ics`, ics);
  };

  return (
    <article className="border border-primary/40 rounded-md bg-card/60 overflow-hidden shadow-soft">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-0">
        <div className="p-4 sm:p-5 min-w-0">
          <Link
            to={`/events/${row.event_id}`}
            className="font-display text-lg sm:text-xl text-foreground hover:text-primary transition-colors leading-tight block"
          >
            {row.event_title}
          </Link>
          <p className="font-mono-accent text-xs text-muted-foreground mt-1">
            {formatEventWindow(row.start_at, row.end_at, row.timezone)}
          </p>
          <div className="mt-3 space-y-1.5 text-xs sm:text-sm">
            {row.venue_address && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words">{row.venue_address}</span>
              </p>
            )}
            {row.venue_online_link && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <Globe2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <a href={row.venue_online_link} className="text-primary underline break-all" target="_blank" rel="noreferrer">
                  {row.venue_online_link}
                </a>
              </p>
            )}
          </div>
          <p className="mt-3 font-mono-accent text-[10px] sm:text-xs text-muted-foreground break-all">
            ticket: {row.ticket_code}
          </p>
          <Button onClick={handleAddToCalendar} variant="outline" size="sm" className="mt-3 font-mono-accent">
            <CalendarPlus className="h-4 w-4 mr-1.5" /> add to calendar (.ics)
          </Button>
        </div>
        <div className="bg-background/80 border-t sm:border-t-0 sm:border-l border-primary/30 p-4 grid place-items-center">
          {qr ? (
            <img src={qr} alt={`QR for ticket ${row.ticket_code}`} width={180} height={180} className="rounded-sm" />
          ) : (
            <Skeleton className="h-44 w-44" />
          )}
        </div>
      </div>
    </article>
  );
}

export default MyTickets;
