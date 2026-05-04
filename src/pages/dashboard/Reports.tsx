import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EyeOff, X, Flag } from "lucide-react";
import { toast } from "sonner";

interface Report {
  id: string;
  target_type: "event" | "photo";
  target_id: string;
  reason: string;
  status: "open" | "hidden" | "dismissed";
  created_at: string;
  reporter_id: string | null;
  // hydrated:
  event_title?: string | null;
  event_id_for_link?: string | null;
  photo_url?: string | null;
}

const Reports = () => {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"open" | "hidden" | "dismissed">("open");
  const [reports, setReports] = useState<Report[] | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    setReports(null);
    // RLS automatically restricts to host's events / their photos
    const { data, error } = await supabase
      .from("reports")
      .select("id, target_type, target_id, reason, status, created_at, reporter_id")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setReports([]);
      return;
    }
    const rows = (data ?? []) as Report[];

    // Hydrate target details
    const eventIds = rows.filter((r) => r.target_type === "event").map((r) => r.target_id);
    const photoIds = rows.filter((r) => r.target_type === "photo").map((r) => r.target_id);

    const [evRes, phRes] = await Promise.all([
      eventIds.length
        ? supabase.from("events").select("id, title").in("id", eventIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      photoIds.length
        ? supabase.from("gallery_photos").select("id, url, event_id").in("id", photoIds)
        : Promise.resolve({ data: [] as { id: string; url: string; event_id: string }[] }),
    ]);
    const evMap = new Map((evRes.data ?? []).map((e: any) => [e.id, e]));
    const phMap = new Map((phRes.data ?? []).map((p: any) => [p.id, p]));

    const hydrated = rows.map((r) => {
      if (r.target_type === "event") {
        const e = evMap.get(r.target_id);
        return { ...r, event_title: e?.title ?? null, event_id_for_link: r.target_id };
      }
      const p: any = phMap.get(r.target_id);
      return { ...r, photo_url: p?.url ?? null, event_id_for_link: p?.event_id ?? null };
    });
    setReports(hydrated);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const hide = async (r: Report) => {
    // Hide the target, then mark report as hidden
    if (r.target_type === "event") {
      // No "hidden" event_state — we mark as draft (removes from public Explore)
      const { error: tgtErr } = await supabase
        .from("events")
        .update({ state: "draft" })
        .eq("id", r.target_id);
      if (tgtErr) {
        toast.error(tgtErr.message);
        return;
      }
    } else {
      const { error: tgtErr } = await supabase
        .from("gallery_photos")
        .update({ status: "hidden" })
        .eq("id", r.target_id);
      if (tgtErr) {
        toast.error(tgtErr.message);
        return;
      }
    }
    const { error } = await supabase
      .from("reports")
      .update({ status: "hidden", resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("hidden");
    reload();
  };

  const dismiss = async (r: Report) => {
    const { error } = await supabase
      .from("reports")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("dismissed");
    reload();
  };

  const filtered = (reports ?? []).filter((r) => r.status === filter);
  const counts = {
    open: (reports ?? []).filter((r) => r.status === "open").length,
    hidden: (reports ?? []).filter((r) => r.status === "hidden").length,
    dismissed: (reports ?? []).filter((r) => r.status === "dismissed").length,
  };

  return (
    <>
      <PageMeta title="report queue · null_collective" />
      <section className="container py-6 sm:py-10 max-w-5xl">
        <header className="mb-6">
          <p className="font-mono-accent text-xs text-muted-foreground">$ ./dashboard/reports</p>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow mt-1 flex items-center gap-2">
            <Flag className="h-6 w-6" /> report queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            reports for events you host + photos in those events.
          </p>
        </header>

        <div className="inline-flex rounded-md border border-border/70 overflow-hidden mb-5">
          {(["open", "hidden", "dismissed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 font-mono-accent text-xs sm:text-sm border-r last:border-r-0 border-border/70 transition-colors ${
                filter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        {reports === null ? (
          <Skeleton className="h-32 w-full rounded-md" />
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
            <pre className="ascii-empty text-muted-foreground text-xs">{`> no ${filter} reports`}</pre>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <li key={r.id} className="border border-border/70 rounded-md bg-card/40 p-4 flex flex-col sm:flex-row gap-4">
                <div className="sm:w-32 flex-shrink-0">
                  {r.target_type === "photo" && r.photo_url ? (
                    <img src={r.photo_url} alt="" className="aspect-square w-full object-cover rounded-md border border-border/60" />
                  ) : (
                    <div className="aspect-square w-full bg-muted/40 rounded-md border border-border/60 grid place-items-center font-mono-accent text-[10px] text-muted-foreground uppercase">
                      {r.target_type}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="inline-flex items-center rounded-sm border border-secondary/40 bg-secondary/10 px-2 py-0.5 font-mono-accent text-[10px] uppercase tracking-wider text-secondary">
                      {r.target_type}
                    </span>
                    <span className="font-mono-accent text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                    {r.reporter_id === null && (
                      <span className="font-mono-accent text-[10px] text-muted-foreground">· anon</span>
                    )}
                  </div>
                  {r.event_title && (
                    <p className="text-sm font-medium truncate">{r.event_title}</p>
                  )}
                  {r.event_id_for_link && (
                    <Link
                      to={`/events/${r.event_id_for_link}`}
                      className="font-mono-accent text-xs text-primary hover:underline"
                    >
                      → view event
                    </Link>
                  )}
                  <p className="text-sm text-foreground/90 mt-2 whitespace-pre-wrap break-words">{r.reason}</p>
                  {r.status === "open" && (
                    <div className="flex flex-col sm:flex-row gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => hide(r)} className="font-mono-accent">
                        <EyeOff className="h-3.5 w-3.5 mr-1" /> hide {r.target_type}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => dismiss(r)} className="font-mono-accent">
                        <X className="h-3.5 w-3.5 mr-1" /> dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
};

export default Reports;
