import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EndedPill, LivePill } from "@/components/events/EndedPill";
import { formatEventWindow, isEnded } from "@/lib/events";
import { toast } from "sonner";
import { RefreshCw, Plus, Users } from "lucide-react";

interface DashEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  capacity: number;
  host_id: string;
  host_name: string;
  confirmed_count: number;
  waitlist_count: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<DashEvent[] | null>(null);
  const [hasHost, setHasHost] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    // Hosts owned/managed by the user.
    const { data: members } = await supabase
      .from("host_members")
      .select("host_id, role, hosts!inner ( id, name )")
      .eq("user_id", user.id)
      .eq("role", "host");

    const hostMap = new Map<string, string>();
    (members ?? []).forEach((m) => {
      const h = (m as { hosts: { id: string; name: string } }).hosts;
      hostMap.set(h.id, h.name);
    });
    setHasHost(hostMap.size > 0);
    if (hostMap.size === 0) {
      setEvents([]);
      return;
    }

    const { data: evs } = await supabase
      .from("events")
      .select("id, title, start_at, end_at, timezone, capacity, host_id")
      .in("host_id", Array.from(hostMap.keys()))
      .order("start_at", { ascending: true });

    if (!evs) { setEvents([]); return; }

    // Per-event counts (lightweight: two separate counts per event via head:true).
    const enriched = await Promise.all(
      evs.map(async (e) => {
        const [{ count: c }, { count: w }] = await Promise.all([
          supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "confirmed"),
          supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "waitlist"),
        ]);
        return {
          ...e,
          host_name: hostMap.get(e.host_id) ?? "—",
          confirmed_count: c ?? 0,
          waitlist_count: w ?? 0,
        } satisfies DashEvent;
      }),
    );
    setEvents(enriched);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const rebalance = async (eventId: string) => {
    setBusyId(eventId);
    try {
      const { data, error } = await supabase.functions.invoke("waitlist-rebalance", {
        body: { event_id: eventId },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const promoted = (data as { promoted: number }).promoted ?? 0;
      toast.success(promoted > 0 ? `promoted ${promoted} from waitlist` : "no promotions — already balanced");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageMeta title="host dashboard · null_collective" />
      <section className="container py-6 sm:py-10 max-w-5xl">
        <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./dashboard</p>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-glow text-primary">host dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">events you organize · live counts · waitlist control</p>
          </div>
          {hasHost && (
            <Button asChild className="font-mono-accent shadow-glow">
              <Link to="/dashboard/events/new"><Plus className="h-4 w-4 mr-1" /> new event</Link>
            </Button>
          )}
        </header>

        {events === null ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-md" />)}</div>
        ) : !hasHost ? (
          <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
            <pre className="ascii-empty">{`┌────────────────────────────────────────┐
│  no host profile yet                   │
│  create one to publish events.         │
└────────────────────────────────────────┘`}</pre>
            <Button asChild variant="outline" className="mt-4 font-mono-accent">
              <Link to="/onboarding/host">→ create host profile</Link>
            </Button>
          </div>
        ) : events.length === 0 ? (
          <p className="font-mono-accent text-sm text-muted-foreground">// no events yet — create one to get started.</p>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {events.map((e) => {
              const ended = isEnded(e.end_at);
              return (
                <article key={e.id} className="border border-border/70 rounded-md bg-card/60 p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {ended ? <EndedPill /> : <LivePill />}
                        <span className="font-mono-accent text-[10px] sm:text-xs text-muted-foreground">./{e.host_name}</span>
                      </div>
                      <Link to={`/events/${e.id}`} className="font-display text-base sm:text-lg hover:text-primary transition-colors">
                        {e.title}
                      </Link>
                      <p className="font-mono-accent text-xs text-muted-foreground mt-0.5">
                        {formatEventWindow(e.start_at, e.end_at, e.timezone)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs sm:text-sm font-mono-accent text-muted-foreground">
                        <span><Users className="h-3.5 w-3.5 inline mr-1" />confirmed: <span className="text-primary">{e.confirmed_count}</span>/{e.capacity || "∞"}</span>
                        <span>waitlist: <span className="text-secondary">{e.waitlist_count}</span></span>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rebalance(e.id)}
                        disabled={busyId === e.id || ended}
                        className="font-mono-accent"
                        title={ended ? "event ended" : "promote waitlist to fill open seats"}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busyId === e.id ? "animate-spin" : ""}`} />
                        re-balance
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="font-mono-accent">
                        <Link to={`/dashboard/events/${e.id}/edit`}>edit</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="font-mono-accent">
                        <Link to={`/dashboard/events/${e.id}/checkin`}>check-in</Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
};

export default Dashboard;
