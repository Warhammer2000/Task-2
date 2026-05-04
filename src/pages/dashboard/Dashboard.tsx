import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EndedPill, LivePill } from "@/components/events/EndedPill";
import { formatEventWindow, isEnded } from "@/lib/events";
import { toast } from "sonner";
import { RefreshCw, Plus, Users, Download, Eye, EyeOff, Copy, Lock } from "lucide-react";

type EvState = "draft" | "published";
type EvVisibility = "public" | "unlisted";

interface DashEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  capacity: number;
  host_id: string;
  host_name: string;
  state: EvState;
  visibility: EvVisibility;
  description: string | null;
  venue_address: string | null;
  venue_online_link: string | null;
  cover_image_url: string | null;
  is_paid: boolean;
  confirmed_count: number;
  waitlist_count: number;
  checked_in_count: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<DashEvent[] | null>(null);
  const [hasHost, setHasHost] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
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
    if (hostMap.size === 0) { setEvents([]); return; }

    const { data: evs } = await supabase
      .from("events")
      .select("id, title, start_at, end_at, timezone, capacity, host_id, state, visibility, description, venue_address, venue_online_link, cover_image_url, is_paid")
      .in("host_id", Array.from(hostMap.keys()))
      .order("start_at", { ascending: true });

    if (!evs) { setEvents([]); return; }

    const enriched = await Promise.all(
      evs.map(async (e) => {
        const [{ count: c }, { count: w }, { data: tickets }] = await Promise.all([
          supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "confirmed"),
          supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "waitlist"),
          supabase.from("rsvps").select("tickets ( checked_in_at )").eq("event_id", e.id),
        ]);
        const checkedIn = (tickets ?? []).reduce((acc, r) => {
          const raw = (r as unknown as { tickets?: Array<{ checked_in_at: string | null }> | { checked_in_at: string | null } | null }).tickets;
          const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
          return acc + arr.filter((x) => x.checked_in_at).length;
        }, 0);
        return {
          ...e,
          host_name: hostMap.get(e.host_id) ?? "—",
          confirmed_count: c ?? 0,
          waitlist_count: w ?? 0,
          checked_in_count: checkedIn,
        } satisfies DashEvent;
      }),
    );
    setEvents(enriched);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const { upcoming, past } = useMemo(() => {
    const u: DashEvent[] = []; const p: DashEvent[] = [];
    (events ?? []).forEach((e) => (isEnded(e.end_at) ? p.push(e) : u.push(e)));
    p.reverse(); // most recent past first
    return { upcoming: u, past: p };
  }, [events]);

  const rebalance = async (eventId: string) => {
    setBusyId(eventId);
    try {
      const { data, error } = await supabase.functions.invoke("waitlist-rebalance", { body: { event_id: eventId } });
      if (error) { toast.error(error.message); return; }
      const promoted = (data as { promoted: number }).promoted ?? 0;
      toast.success(promoted > 0 ? `promoted ${promoted} from waitlist` : "no promotions — already balanced");
      await load();
    } finally { setBusyId(null); }
  };

  const togglePublish = async (e: DashEvent) => {
    setBusyId(e.id);
    try {
      const next: EvState = e.state === "published" ? "draft" : "published";
      const { error } = await supabase.from("events").update({ state: next }).eq("id", e.id);
      if (error) { toast.error(error.message); return; }
      toast.success(next === "published" ? "published" : "unpublished");
      await load();
    } finally { setBusyId(null); }
  };

  const duplicate = async (e: DashEvent) => {
    setBusyId(e.id);
    try {
      const { data, error } = await supabase.from("events").insert({
        host_id: e.host_id,
        title: `${e.title}_copy`,
        description: e.description,
        start_at: e.start_at,
        end_at: e.end_at,
        timezone: e.timezone,
        capacity: e.capacity,
        is_paid: e.is_paid,
        state: "draft",
        visibility: e.visibility,
        cover_image_url: e.cover_image_url,
        venue_address: e.venue_address,
        venue_online_link: e.venue_online_link,
      }).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "duplicate failed"); return; }
      toast.success("duplicated as draft");
      await load();
    } finally { setBusyId(null); }
  };

  const exportCsv = async (e: DashEvent) => {
    setBusyId(e.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { toast.error("session expired"); return; }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-csv-export?event_id=${encodeURIComponent(e.id)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const txt = await res.text();
        toast.error(`export failed: ${txt.slice(0, 120)}`);
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      a.href = objUrl;
      a.download = m?.[1] ?? `${e.title}_rsvps.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } finally { setBusyId(null); }
  };

  const renderRow = (e: DashEvent) => {
    const ended = isEnded(e.end_at);
    return (
      <article key={e.id} className="border border-border/70 rounded-md bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {ended ? <EndedPill /> : <LivePill />}
              <span className={`font-mono-accent text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                e.state === "published"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-muted/40 text-muted-foreground"
              }`}>
                {e.state}
              </span>
              {e.visibility === "unlisted" && (
                <span className="inline-flex items-center gap-1 font-mono-accent text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-accent/40 bg-accent/10 text-accent">
                  <Lock className="h-3 w-3" /> unlisted
                </span>
              )}
              <span className="font-mono-accent text-[10px] sm:text-xs text-muted-foreground">./{e.host_name}</span>
            </div>
            <Link to={`/events/${e.id}`} className="font-display text-base sm:text-lg hover:text-primary transition-colors">
              {e.title}
            </Link>
            <p className="font-mono-accent text-xs text-muted-foreground mt-0.5">
              {formatEventWindow(e.start_at, e.end_at, e.timezone)}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs sm:text-sm font-mono-accent text-muted-foreground">
              <span><Users className="h-3.5 w-3.5 inline mr-1" />going: <span className="text-primary">{e.confirmed_count}</span>/{e.capacity || "∞"}</span>
              <span>waitlist: <span className="text-secondary">{e.waitlist_count}</span></span>
              <span>checked-in: <span className="text-accent">{e.checked_in_count}</span></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => togglePublish(e)} disabled={busyId === e.id} className="font-mono-accent">
              {e.state === "published" ? <><EyeOff className="h-3.5 w-3.5 mr-1" /> unpublish</> : <><Eye className="h-3.5 w-3.5 mr-1" /> publish</>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => duplicate(e)} disabled={busyId === e.id} className="font-mono-accent">
              <Copy className="h-3.5 w-3.5 mr-1" /> duplicate
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(e)} disabled={busyId === e.id} className="font-mono-accent">
              <Download className="h-3.5 w-3.5 mr-1" /> csv
            </Button>
            <Button variant="outline" size="sm" onClick={() => rebalance(e.id)}
              disabled={busyId === e.id || ended} className="font-mono-accent"
              title={ended ? "event ended" : "promote waitlist to fill open seats"}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busyId === e.id ? "animate-spin" : ""}`} /> re-balance
            </Button>
            <Button asChild variant="ghost" size="sm" className="font-mono-accent">
              <Link to={`/dashboard/events/${e.id}/edit`}>edit</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="font-mono-accent">
              <Link to={`/dashboard/events/${e.id}/checkin`}>check-in</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="font-mono-accent">
              <Link to={`/dashboard/events/${e.id}/gallery-review`}>gallery</Link>
            </Button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <>
      <PageMeta title="host dashboard · null_collective" />
      <section className="container py-6 sm:py-10 max-w-6xl">
        <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./dashboard</p>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-glow text-primary">host dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">events you organize · live counts · waitlist control</p>
          </div>
          {hasHost && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="font-mono-accent">
                <Link to="/dashboard/members">members</Link>
              </Button>
              <Button asChild variant="outline" className="font-mono-accent">
                <Link to="/dashboard/reports">reports</Link>
              </Button>
              <Button asChild className="font-mono-accent shadow-glow">
                <Link to="/dashboard/events/new"><Plus className="h-4 w-4 mr-1" /> new event</Link>
              </Button>
            </div>
          )}
        </header>

        {events === null ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}</div>
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
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="font-mono-accent">
              <TabsTrigger value="upcoming">upcoming · {upcoming.length}</TabsTrigger>
              <TabsTrigger value="past">past · {past.length}</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="space-y-3 sm:space-y-4 mt-4">
              {upcoming.length === 0
                ? <p className="font-mono-accent text-sm text-muted-foreground">// no upcoming events.</p>
                : upcoming.map(renderRow)}
            </TabsContent>
            <TabsContent value="past" className="space-y-3 sm:space-y-4 mt-4">
              {past.length === 0
                ? <p className="font-mono-accent text-sm text-muted-foreground">// archive is empty.</p>
                : past.map(renderRow)}
            </TabsContent>
          </Tabs>
        )}
      </section>
    </>
  );
};

export default Dashboard;
