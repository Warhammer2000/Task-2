import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EndedPill, LivePill } from "@/components/events/EndedPill";
import { formatEventWindow, isEnded } from "@/lib/events";
import { Lock } from "lucide-react";

interface HostOpt { id: string; name: string; slug: string; role: string; }
interface Row {
  id: string; title: string; start_at: string; end_at: string; timezone: string;
  host_id: string; visibility: "public" | "unlisted"; state: "draft" | "published";
  venue_address: string | null;
}

const MyEvents = () => {
  const { user } = useAuth();
  const [hosts, setHosts] = useState<HostOpt[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("host_members")
        .select("role, hosts!inner ( id, name, slug )")
        .eq("user_id", user.id);
      const list: HostOpt[] = (data ?? []).map((m) => {
        const h = (m as { hosts: { id: string; name: string; slug: string } }).hosts;
        return { id: h.id, name: h.name, slug: h.slug, role: (m as { role: string }).role };
      });
      // Dedupe by host id (could appear with multiple roles)
      const seen = new Map<string, HostOpt>();
      list.forEach((h) => seen.set(h.id, h));
      const unique = Array.from(seen.values());
      setHosts(unique);
      setSelectedHosts(new Set(unique.map((h) => h.id)));

      if (unique.length === 0) { setRows([]); return; }

      const { data: evs } = await supabase
        .from("events")
        .select("id, title, start_at, end_at, timezone, host_id, visibility, state, venue_address")
        .in("host_id", unique.map((h) => h.id))
        .order("start_at", { ascending: false });
      setRows((evs ?? []) as Row[]);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const qx = q.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : -Infinity;
    const toTs = to ? new Date(to).getTime() + 24 * 3600 * 1000 - 1 : Infinity;
    return rows.filter((r) => {
      if (!selectedHosts.has(r.host_id)) return false;
      const ts = new Date(r.start_at).getTime();
      if (ts < fromTs || ts > toTs) return false;
      if (qx && !r.title.toLowerCase().includes(qx) && !(r.venue_address ?? "").toLowerCase().includes(qx)) return false;
      return true;
    });
  }, [rows, selectedHosts, from, to, q]);

  const toggleHost = (id: string) => {
    setSelectedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const hostName = (id: string) => hosts?.find((h) => h.id === id)?.slug ?? "—";

  return (
    <>
      <PageMeta title="my events · null_collective" />
      <section className="container py-6 sm:py-10 max-w-5xl">
        <header className="mb-6">
          <p className="font-mono-accent text-xs text-muted-foreground mb-2">$ ./my/events</p>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow">my events</h1>
          <p className="mt-1 text-sm text-muted-foreground">events from hosts you organize or check at</p>
        </header>

        {hosts === null ? (
          <Skeleton className="h-48 w-full rounded-md" />
        ) : hosts.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
            <pre className="ascii-empty">{`> not a member of any host yet.`}</pre>
            <Button asChild variant="outline" className="mt-4 font-mono-accent">
              <Link to="/onboarding/host">→ become a host</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-6">
              <div className="space-y-1">
                <Label className="font-mono-accent text-xs text-muted-foreground">search</Label>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="title, venue…" className="font-mono-accent" />
              </div>
              <div className="space-y-1">
                <Label className="font-mono-accent text-xs text-muted-foreground">from</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="font-mono-accent text-xs text-muted-foreground">to</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            <div className="mb-6">
              <Label className="font-mono-accent text-xs text-muted-foreground">hosts</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {hosts.map((h) => {
                  const on = selectedHosts.has(h.id);
                  return (
                    <button key={h.id} type="button" onClick={() => toggleHost(h.id)}
                      className={`font-mono-accent text-xs px-2.5 py-1 rounded-sm border transition-colors ${
                        on ? "border-primary/60 bg-primary/15 text-primary" : "border-border/70 bg-muted/30 text-muted-foreground hover:text-foreground"
                      }`}>
                      ./{h.slug} <span className="opacity-60">[{h.role}]</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {rows === null ? (
              <Skeleton className="h-40 w-full" />
            ) : filtered.length === 0 ? (
              <p className="font-mono-accent text-sm text-muted-foreground">// no events match the current filters.</p>
            ) : (
              <div className="space-y-3">
                {filtered.map((e) => {
                  const ended = isEnded(e.end_at);
                  return (
                    <article key={e.id} className="border border-border/70 rounded-md bg-card/60 p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {ended ? <EndedPill /> : <LivePill />}
                        <span className={`font-mono-accent text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                          e.state === "published" ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 bg-muted/40 text-muted-foreground"
                        }`}>
                          {e.state}
                        </span>
                        {e.visibility === "unlisted" && (
                          <span className="inline-flex items-center gap-1 font-mono-accent text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-accent/40 bg-accent/10 text-accent">
                            <Lock className="h-3 w-3" /> unlisted
                          </span>
                        )}
                        <span className="font-mono-accent text-[10px] text-muted-foreground">./{hostName(e.host_id)}</span>
                      </div>
                      <Link to={`/events/${e.id}`} className="font-display text-base sm:text-lg hover:text-primary transition-colors">
                        {e.title}
                      </Link>
                      <p className="font-mono-accent text-xs text-muted-foreground mt-0.5">
                        {formatEventWindow(e.start_at, e.end_at, e.timezone)}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
};

export default MyEvents;
