import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageMeta } from "@/components/PageMeta";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/events/EventCard";
import { fetchHostBySlug, fetchHostEvents, isEnded } from "@/lib/events";
import { Mail } from "lucide-react";

const HostPublic = () => {
  const { slug } = useParams();

  const { data: host, isLoading: loadingHost } = useQuery({
    queryKey: ["host", slug],
    queryFn: () => (slug ? fetchHostBySlug(slug) : Promise.resolve(null)),
    enabled: !!slug,
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["host-events", host?.id],
    queryFn: () => (host?.id ? fetchHostEvents(host.id) : Promise.resolve([])),
    enabled: !!host?.id,
  });

  if (loadingHost) {
    return (
      <section className="container py-8 sm:py-12 max-w-4xl">
        <Skeleton className="h-24 w-24 mb-4" />
        <Skeleton className="h-8 w-2/3 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </section>
    );
  }

  if (!host) {
    return (
      <section className="container py-8 sm:py-12 max-w-2xl">
        <PageMeta title="host not found · null_collective" />
        <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
          <pre className="ascii-empty">
{`┌──────────────────────────────────┐
│  404 · host offline              │
│  no host with that slug.         │
└──────────────────────────────────┘`}
          </pre>
          <Button asChild variant="outline" className="mt-4 font-mono-accent">
            <Link to="/">← back to explore</Link>
          </Button>
        </div>
      </section>
    );
  }

  const upcoming = events.filter((e) => !isEnded(e.end_at));
  const past = events.filter((e) => isEnded(e.end_at)).reverse();

  const desc = host.bio?.trim() || `${host.name} — community host on null_collective.`;

  return (
    <>
      <PageMeta
        title={`${host.name} · null_collective`}
        description={desc.length > 160 ? desc.slice(0, 157) + "…" : desc}
        image={host.logo_url ?? undefined}
        type="profile"
      />
      <section className="container py-6 sm:py-10 max-w-5xl">
        {/* Host header */}
        <header className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 mb-8 sm:mb-10 border-b border-border/60 pb-6 sm:pb-8">
          <div className="h-20 w-20 sm:h-28 sm:w-28 rounded-md border border-border/70 bg-muted/40 overflow-hidden grid place-items-center shrink-0">
            {host.logo_url ? (
              <img src={host.logo_url} alt={`${host.name} logo`} className="h-full w-full object-cover" />
            ) : (
              <span className="font-mono-accent text-primary text-glow text-2xl">▮</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono-accent text-xs text-muted-foreground">$ ./hosts/{host.slug}</p>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-glow text-primary mt-1">{host.name}</h1>
            {host.bio && (
              <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl whitespace-pre-wrap">{host.bio}</p>
            )}
            {host.contact_email && (
              <a
                href={`mailto:${host.contact_email}`}
                className="mt-3 inline-flex items-center gap-2 font-mono-accent text-xs sm:text-sm text-primary hover:underline"
              >
                <Mail className="h-3.5 w-3.5" /> {host.contact_email}
              </a>
            )}
          </div>
        </header>

        {/* Upcoming */}
        <div className="mb-10">
          <h2 className="font-mono-accent text-sm text-muted-foreground mb-3 sm:mb-4">$ upcoming ({upcoming.length})</h2>
          {loadingEvents ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-md" />)}
            </div>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground font-mono-accent">// nothing scheduled.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {upcoming.map((ev) => (
                <EventCard key={ev.id} event={{ ...ev, hosts: { id: host.id, name: host.name, slug: host.slug, logo_url: host.logo_url, bio: host.bio, contact_email: host.contact_email } }} />
              ))}
            </div>
          )}
        </div>

        {/* Past */}
        <div>
          <h2 className="font-mono-accent text-sm text-muted-foreground mb-3 sm:mb-4">$ archive ({past.length})</h2>
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground font-mono-accent">// no past events yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {past.map((ev) => (
                <EventCard key={ev.id} event={{ ...ev, hosts: { id: host.id, name: host.name, slug: host.slug, logo_url: host.logo_url, bio: host.bio, contact_email: host.contact_email } }} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default HostPublic;
