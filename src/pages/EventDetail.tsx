import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EndedPill, LivePill } from "@/components/events/EndedPill";
import { fetchEventById, formatEventWindow, isEnded } from "@/lib/events";
import { useAuth } from "@/contexts/AuthContext";
import { useMyRsvp } from "@/hooks/useMyRsvp";
import { CalendarClock, MapPin, Globe2, Users, Lock, CheckCircle2, Clock3, X } from "lucide-react";
import { toast } from "sonner";

const EventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => (id ? fetchEventById(id) : Promise.resolve(null)),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <section className="container py-8 sm:py-12 max-w-4xl">
        <Skeleton className="h-8 w-2/3 mb-4" />
        <Skeleton className="aspect-[16/9] w-full mb-6" />
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  if (error || !event) {
    return (
      <section className="container py-8 sm:py-12 max-w-2xl">
        <PageMeta title="event not found · null_collective" />
        <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
          <pre className="ascii-empty">
{`┌──────────────────────────────────┐
│  404 · signal lost               │
│  this event does not exist or    │
│  is no longer published.         │
└──────────────────────────────────┘`}
          </pre>
          <Button asChild variant="outline" className="mt-4 font-mono-accent">
            <Link to="/">← back to explore</Link>
          </Button>
        </div>
      </section>
    );
  }

  const ended = isEnded(event.end_at);
  const host = event.hosts;
  const desc = event.description ?? "";
  const shortDesc = desc.length > 160 ? desc.slice(0, 157) + "…" : desc;

  const handleRsvp = () => {
    if (!user) {
      navigate(`/auth/sign-in?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    // RSVP transaction lives in Phase 3 — wire up CTA target there.
    navigate(`/events/${event.id}?rsvp=pending`, { replace: true });
  };

  return (
    <>
      <PageMeta
        title={`${event.title} · null_collective`}
        description={shortDesc || `${host?.name ?? "Underground host"} — ${formatEventWindow(event.start_at, event.end_at, event.timezone)}`}
        image={event.cover_image_url ?? undefined}
        type="article"
      />
      <article className="container py-6 sm:py-10 max-w-4xl">
        {/* Cover */}
        <div className="relative aspect-[16/9] rounded-md overflow-hidden border border-border/70 bg-muted/40 mb-5 sm:mb-7">
          {event.cover_image_url ? (
            <img src={event.cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <pre className="ascii-empty text-primary/50">{`> ${event.title}`}</pre>
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {ended ? <EndedPill /> : <LivePill />}
            {event.visibility === "unlisted" && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono-accent text-[10px] sm:text-xs uppercase tracking-wider text-accent">
                <Lock className="h-3 w-3" /> unlisted
              </span>
            )}
          </div>
        </div>

        {/* Header */}
        <header className="mb-6">
          {host && (
            <Link
              to={`/hosts/${host.slug}`}
              className="font-mono-accent text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ./{host.slug}
            </Link>
          )}
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-glow text-primary mt-1 leading-tight">
            {event.title}
          </h1>
        </header>

        {/* Meta grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8 text-sm">
          <MetaRow icon={<CalendarClock className="h-4 w-4" />} label="when">
            {formatEventWindow(event.start_at, event.end_at, event.timezone)}
          </MetaRow>
          {event.venue_address && (
            <MetaRow icon={<MapPin className="h-4 w-4" />} label="where">
              {event.venue_address}
            </MetaRow>
          )}
          {event.venue_online_link && (
            <MetaRow icon={<Globe2 className="h-4 w-4" />} label="online">
              <a
                href={event.venue_online_link}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline break-all"
              >
                {event.venue_online_link}
              </a>
            </MetaRow>
          )}
          <MetaRow icon={<Users className="h-4 w-4" />} label="capacity">
            {event.capacity > 0 ? `${event.capacity} seats` : "unlimited"}
          </MetaRow>
        </dl>

        {/* Description */}
        {desc && (
          <div className="prose prose-invert max-w-none mb-8">
            <p className="text-sm sm:text-base text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {desc}
            </p>
          </div>
        )}

        {/* RSVP CTA — entirely hidden when ended (R hard rule, not just disabled) */}
        {!ended && (
          <div className="sticky bottom-3 sm:static z-10 border border-primary/40 rounded-md bg-card/80 backdrop-blur p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-glow">
            <div>
              <p className="font-mono-accent text-xs text-muted-foreground">$ rsvp</p>
              <p className="text-sm sm:text-base">
                {user ? "secure your spot — first-come, first-served" : "sign in to reserve a spot"}
              </p>
            </div>
            <Button onClick={handleRsvp} size="lg" className="font-mono-accent shadow-glow w-full sm:w-auto">
              {user ? "rsvp →" : "sign in to rsvp →"}
            </Button>
          </div>
        )}
        {ended && (
          <div className="border border-dashed border-border/80 rounded-md bg-muted/20 p-4 sm:p-5 font-mono-accent text-sm text-muted-foreground">
            this event has ended. rsvps are closed.
          </div>
        )}
      </article>
    </>
  );
};

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border border-border/50 rounded-md p-3 bg-card/40">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <dt className="font-mono-accent text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="text-sm sm:text-base break-words">{children}</dd>
      </div>
    </div>
  );
}

export default EventDetail;
