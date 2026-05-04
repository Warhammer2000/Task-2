import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Undo2, Users, ScanLine, ArrowLeft } from "lucide-react";

interface EventInfo {
  id: string;
  title: string;
  host_id: string;
  capacity: number;
}

interface Counters {
  confirmed: number;
  waitlist: number;
  checked_in: number;
}

type Banner =
  | { kind: "ok"; name: string; at: string }
  | { kind: "dup"; name: string; at: string; by: string | null }
  | { kind: "err"; msg: string }
  | null;

const CheckIn = () => {
  const { id: eventId } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [ev, setEv] = useState<EventInfo | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [counters, setCounters] = useState<Counters>({ confirmed: 0, waitlist: 0, checked_in: 0 });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [lastTicketId, setLastTicketId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load event + permission
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!eventId || !user) return;
      const { data: e } = await supabase
        .from("events")
        .select("id, title, host_id, capacity")
        .eq("id", eventId)
        .maybeSingle();
      if (cancel) return;
      if (!e) { setEv(null); setAllowed(false); return; }
      setEv(e as EventInfo);
      const { data: mem } = await supabase
        .from("host_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("host_id", e.host_id);
      if (cancel) return;
      const ok = (mem ?? []).some((m) => m.role === "host" || m.role === "checker");
      setAllowed(ok);
    })();
    return () => { cancel = true; };
  }, [eventId, user]);

  // Load counters
  const refreshCounters = async () => {
    if (!eventId) return;
    const [{ count: c }, { count: w }, { data: rs }] = await Promise.all([
      supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "confirmed"),
      supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "waitlist"),
      supabase.from("rsvps").select("tickets ( checked_in_at )").eq("event_id", eventId),
    ]);
    const checkedIn = (rs ?? []).reduce((acc, r) => {
      const raw = (r as unknown as { tickets?: Array<{ checked_in_at: string | null }> | { checked_in_at: string | null } | null }).tickets;
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return acc + arr.filter((x) => x.checked_in_at).length;
    }, 0);
    setCounters({ confirmed: c ?? 0, waitlist: w ?? 0, checked_in: checkedIn });
  };

  useEffect(() => { if (allowed) refreshCounters(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [allowed, eventId]);

  // Realtime subscription on rsvps + tickets
  useEffect(() => {
    if (!eventId || !allowed) return;
    const channel = supabase
      .channel(`checkin:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvps", filter: `event_id=eq.${eventId}` }, () => refreshCounters())
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => refreshCounters())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, allowed]);

  const submit = async (raw?: string) => {
    const trimmed = (raw ?? code).trim();
    if (!trimmed || !eventId) return;
    setBusy(true);
    setBanner(null);
    try {
      // Lookup ticket by code, join rsvp + profile for verification + display name.
      const { data: t, error } = await supabase
        .from("tickets")
        .select("id, code, checked_in_at, checked_in_by, rsvp_id, rsvps!inner ( event_id, user_id, profiles:user_id ( display_name ) )")
        .eq("code", trimmed)
        .maybeSingle();
      if (error) { setBanner({ kind: "err", msg: error.message }); return; }
      if (!t) { setBanner({ kind: "err", msg: "ticket not found" }); return; }
      const rsvp = (t as unknown as { rsvps: { event_id: string; user_id: string; profiles?: { display_name?: string | null } | { display_name?: string | null }[] | null } }).rsvps;
      if (rsvp.event_id !== eventId) { setBanner({ kind: "err", msg: "ticket belongs to a different event" }); return; }
      const profileRaw = rsvp.profiles;
      const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      const name = profile?.display_name ?? "guest";

      if (t.checked_in_at) {
        // Look up checker name (best effort).
        let byName: string | null = null;
        if (t.checked_in_by) {
          const { data: p } = await supabase.from("profiles").select("display_name").eq("id", t.checked_in_by).maybeSingle();
          byName = p?.display_name ?? null;
        }
        setBanner({ kind: "dup", name, at: t.checked_in_at, by: byName });
        return;
      }

      const { error: upErr } = await supabase
        .from("tickets")
        .update({ checked_in_at: new Date().toISOString(), checked_in_by: user!.id })
        .eq("id", t.id)
        .is("checked_in_at", null); // race-safe
      if (upErr) { setBanner({ kind: "err", msg: upErr.message }); return; }

      setLastTicketId(t.id);
      setBanner({ kind: "ok", name, at: new Date().toISOString() });
      setCode("");
      // Optimistic bump; realtime will confirm.
      setCounters((c) => ({ ...c, checked_in: c.checked_in + 1 }));
      // Refocus input for next scan.
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!lastTicketId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ checked_in_at: null, checked_in_by: null })
        .eq("id", lastTicketId);
      if (error) { toast.error(error.message); return; }
      toast.success("undone");
      setLastTicketId(null);
      setBanner(null);
      setCounters((c) => ({ ...c, checked_in: Math.max(0, c.checked_in - 1) }));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    catch { return iso; }
  };

  const capacityLabel = useMemo(() => ev?.capacity ? `${counters.confirmed}/${ev.capacity}` : `${counters.confirmed}`, [counters.confirmed, ev?.capacity]);

  if (allowed === null) {
    return (
      <section className="container py-6 max-w-2xl">
        <Skeleton className="h-10 w-2/3 mb-4" />
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  if (!ev) {
    return (
      <section className="container py-10 max-w-2xl">
        <p className="font-mono-accent text-sm text-muted-foreground">// event not found.</p>
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="container py-10 max-w-2xl">
        <PageMeta title={`check-in · ${ev.title}`} />
        <p className="font-mono-accent text-sm text-destructive">// permission denied — host or checker role required.</p>
        <Button asChild variant="outline" size="sm" className="mt-4 font-mono-accent">
          <Link to="/dashboard"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> back</Link>
        </Button>
      </section>
    );
  }

  return (
    <>
      <PageMeta title={`check-in · ${ev.title}`} />
      <section className="container py-4 sm:py-8 max-w-2xl">
        <header className="mb-4 sm:mb-6">
          <p className="font-mono-accent text-xs text-muted-foreground mb-1">$ ./checkin --event={ev.id.slice(0, 8)}</p>
          <h1 className="font-display text-2xl sm:text-3xl text-glow text-primary leading-tight">{ev.title}</h1>
          <Button asChild variant="ghost" size="sm" className="font-mono-accent mt-1 -ml-2">
            <Link to="/dashboard"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> dashboard</Link>
          </Button>
        </header>

        {/* Live counters */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          <div className="border border-border/70 rounded-md bg-card/60 p-3 text-center">
            <p className="font-mono-accent text-[10px] uppercase tracking-wider text-muted-foreground">going</p>
            <p className="font-display text-xl sm:text-2xl text-primary">{capacityLabel}</p>
          </div>
          <div className="border border-border/70 rounded-md bg-card/60 p-3 text-center">
            <p className="font-mono-accent text-[10px] uppercase tracking-wider text-muted-foreground">waitlist</p>
            <p className="font-display text-xl sm:text-2xl text-secondary">{counters.waitlist}</p>
          </div>
          <div className="border border-border/70 rounded-md bg-card/60 p-3 text-center">
            <p className="font-mono-accent text-[10px] uppercase tracking-wider text-muted-foreground">checked-in</p>
            <p className="font-display text-xl sm:text-2xl text-accent">{counters.checked_in}</p>
          </div>
        </div>

        {/* Code entry */}
        <div className="border border-border/70 rounded-md bg-card/60 p-4 sm:p-5">
          <label htmlFor="ticket-code" className="font-mono-accent text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
            <ScanLine className="h-3.5 w-3.5" /> ticket code
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="ticket-code"
              ref={inputRef}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="paste or scan code"
              className="font-mono-accent text-base h-12 sm:h-11"
            />
            <Button onClick={() => submit()} disabled={busy || !code.trim()} className="font-mono-accent h-12 sm:h-11 shadow-glow">
              check in
            </Button>
          </div>
          <p className="font-mono-accent text-[11px] text-muted-foreground mt-2">// press enter to submit · field re-focuses after each scan</p>
        </div>

        {/* Banner */}
        {banner && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 border rounded-md p-3 sm:p-4 flex items-start gap-3 ${
              banner.kind === "ok"
                ? "border-primary/50 bg-primary/10"
                : banner.kind === "dup"
                ? "border-accent/50 bg-accent/10"
                : "border-destructive/50 bg-destructive/10"
            }`}
          >
            {banner.kind === "ok" ? (
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${banner.kind === "dup" ? "text-accent" : "text-destructive"}`} />
            )}
            <div className="min-w-0 flex-1">
              {banner.kind === "ok" && (
                <>
                  <p className="font-display text-base">checked in: <span className="text-primary">{banner.name}</span></p>
                  <p className="font-mono-accent text-xs text-muted-foreground">at {fmt(banner.at)}</p>
                </>
              )}
              {banner.kind === "dup" && (
                <>
                  <p className="font-display text-base">already checked in: <span className="text-accent">{banner.name}</span></p>
                  <p className="font-mono-accent text-xs text-muted-foreground">
                    at {fmt(banner.at)}{banner.by ? ` by ${banner.by}` : ""}
                  </p>
                </>
              )}
              {banner.kind === "err" && (
                <p className="font-mono-accent text-sm text-destructive">{banner.msg}</p>
              )}
            </div>
            {banner.kind === "ok" && lastTicketId && (
              <Button onClick={undo} disabled={busy} variant="outline" size="sm" className="font-mono-accent shrink-0">
                <Undo2 className="h-3.5 w-3.5 mr-1" /> undo
              </Button>
            )}
          </div>
        )}

        <p className="mt-6 font-mono-accent text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3 w-3" /> live · counts update across all checkers in realtime
        </p>
      </section>
    </>
  );
};

export default CheckIn;
