import { Link } from "react-router-dom";
import { EventWithHost, EventRow, formatEventWindow, isEnded } from "@/lib/events";
import { EndedPill, LivePill } from "./EndedPill";

type AnyEvent = EventWithHost | (EventRow & { hosts?: EventWithHost["hosts"] });

export function EventCard({ event }: { event: AnyEvent }) {
  const ended = isEnded(event.end_at);
  const host = "hosts" in event ? event.hosts : undefined;

  return (
    <Link
      to={`/events/${event.id}`}
      className="group block rounded-md border border-border/70 bg-card/60 hover:bg-card hover:border-primary/60 transition-colors overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="aspect-[16/9] bg-muted/40 relative overflow-hidden">
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <pre className="ascii-empty text-primary/50">{`> ${event.title.slice(0, 24)}`}</pre>
          </div>
        )}
        <div className="absolute top-2 left-2">
          {ended ? <EndedPill /> : <LivePill />}
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-2">
        <p className="font-mono-accent text-[10px] sm:text-xs text-muted-foreground">
          {formatEventWindow(event.start_at, event.end_at, event.timezone)}
        </p>
        <h3 className="font-display text-base sm:text-lg leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {event.title}
        </h3>
        <div className="flex items-center justify-between gap-2 text-xs">
          {host ? (
            <span className="font-mono-accent text-muted-foreground truncate">
              ./{host.slug}
            </span>
          ) : (
            <span />
          )}
          {event.venue_address && (
            <span className="text-muted-foreground truncate max-w-[55%] text-right">
              {event.venue_address}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
