import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface Photo {
  id: string;
  url: string;
  status: "pending" | "approved" | "hidden";
  uploader_id: string;
  created_at: string;
  profiles?: { display_name: string | null } | null;
}

const GalleryReview = () => {
  const { id: eventId } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState<{ id: string; title: string; host_id: string } | null | undefined>(undefined);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "hidden">("pending");

  // Load event + authorize
  useEffect(() => {
    if (!eventId || !user) return;
    (async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("id, title, host_id")
        .eq("id", eventId)
        .maybeSingle();
      setEvent(ev ?? null);
      if (!ev) {
        setAuthorized(false);
        return;
      }
      const { data: hm } = await supabase
        .from("host_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("host_id", ev.host_id)
        .eq("role", "host")
        .maybeSingle();
      setAuthorized(!!hm);
    })();
  }, [eventId, user]);

  const reload = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase
      .from("gallery_photos")
      .select("id, url, status, uploader_id, created_at, profiles:uploader_id ( display_name )")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    const list = (data ?? []).map((row: any) => ({
      ...row,
      profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
    })) as Photo[];
    setPhotos(list);
  }, [eventId]);

  useEffect(() => {
    if (authorized) reload();
  }, [authorized, reload]);

  const setStatus = async (id: string, status: "approved" | "hidden") => {
    const { error } = await supabase.from("gallery_photos").update({
      status,
      approved_by: status === "approved" ? user?.id : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "approved" ? "approved" : "hidden");
    reload();
  };

  if (event === undefined || authorized === null) {
    return (
      <section className="container py-8 max-w-5xl">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  if (!event || !authorized) {
    return (
      <section className="container py-8 sm:py-12 max-w-2xl">
        <PageMeta title="gallery review · null_collective" />
        <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
          <pre className="ascii-empty">{`> not authorized — host role required for this event`}</pre>
          <Button asChild variant="outline" className="mt-4 font-mono-accent">
            <Link to="/dashboard">← back to dashboard</Link>
          </Button>
        </div>
      </section>
    );
  }

  const filtered = (photos ?? []).filter((p) => p.status === filter);
  const counts = {
    pending: (photos ?? []).filter((p) => p.status === "pending").length,
    approved: (photos ?? []).filter((p) => p.status === "approved").length,
    hidden: (photos ?? []).filter((p) => p.status === "hidden").length,
  };

  return (
    <>
      <PageMeta title={`gallery review · ${event.title} · null_collective`} />
      <section className="container py-6 sm:py-10 max-w-6xl">
        <header className="mb-6">
          <Link to="/dashboard" className="font-mono-accent text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> dashboard
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl text-primary text-glow mt-1">gallery review</h1>
          <p className="font-mono-accent text-xs sm:text-sm text-muted-foreground mt-1">{event.title}</p>
        </header>

        {/* Filter tabs */}
        <div className="inline-flex rounded-md border border-border/70 overflow-hidden mb-5">
          {(["pending", "approved", "hidden"] as const).map((f) => (
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

        {photos === null ? (
          <Skeleton className="h-64 w-full rounded-md" />
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border/80 rounded-md p-6 bg-card/40">
            <pre className="ascii-empty text-muted-foreground text-xs">{`> no ${filter} photos`}</pre>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <figure key={p.id} className="border border-border/70 rounded-md bg-card/40 overflow-hidden">
                <div className="aspect-video bg-muted/40">
                  <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
                <figcaption className="p-3 space-y-2">
                  <div className="font-mono-accent text-xs text-muted-foreground">
                    {p.profiles?.display_name ?? "anon"} · {new Date(p.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {p.status !== "approved" && (
                      <Button size="sm" onClick={() => setStatus(p.id, "approved")} className="font-mono-accent shadow-glow flex-1">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> approve
                      </Button>
                    )}
                    {p.status !== "hidden" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(p.id, "hidden")} className="font-mono-accent flex-1">
                        <EyeOff className="h-3.5 w-3.5 mr-1" /> hide
                      </Button>
                    )}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default GalleryReview;
