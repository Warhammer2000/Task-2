import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";

interface NotificationRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface BannerItem {
  id: string;
  eventId: string;
  eventTitle: string;
}

/**
 * Listens to public.notifications via realtime and surfaces persistent
 * banners for waitlist promotions. User must dismiss (which marks read).
 */
export function NotificationBanner() {
  const { user } = useAuth();
  const [items, setItems] = useState<BannerItem[]>([]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    let cancelled = false;

    const hydrate = async (rows: NotificationRow[]) => {
      const eventIds = Array.from(
        new Set(
          rows
            .filter((r) => r.kind === "waitlist_promoted")
            .map((r) => (r.payload as { event_id?: string }).event_id)
            .filter((x): x is string => !!x),
        ),
      );
      if (eventIds.length === 0) return;
      const { data: events } = await supabase
        .from("events")
        .select("id, title")
        .in("id", eventIds);
      const titleMap = new Map((events ?? []).map((e) => [e.id, e.title]));
      const next: BannerItem[] = rows
        .filter((r) => r.kind === "waitlist_promoted")
        .map((r) => {
          const eventId = (r.payload as { event_id?: string }).event_id ?? "";
          return {
            id: r.id,
            eventId,
            eventTitle: titleMap.get(eventId) ?? "an event",
          };
        });
      if (!cancelled) setItems(next);
    };

    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, payload, created_at")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) await hydrate(data as NotificationRow[]);
    })();

    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const row = payload.new as NotificationRow;
          if (row.kind !== "waitlist_promoted" || !row.payload) return;
          const eventId = (row.payload as { event_id?: string }).event_id ?? "";
          let title = "an event";
          if (eventId) {
            const { data: ev } = await supabase.from("events").select("title").eq("id", eventId).maybeSingle();
            title = ev?.title ?? title;
          }
          setItems((prev) => [{ id: row.id, eventId, eventTitle: title }, ...prev]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const dismiss = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] sm:w-auto sm:min-w-[420px] max-w-xl space-y-2 px-2 sm:px-0">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className="border border-primary/60 rounded-md bg-card/95 backdrop-blur p-3 sm:p-4 shadow-glow flex items-start gap-3 animate-in slide-in-from-bottom-4"
        >
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-mono-accent text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">
              waitlist promoted
            </p>
            <p className="text-sm sm:text-base text-foreground">
              you've been promoted to confirmed for{" "}
              <Link to={`/events/${item.eventId}`} className="text-primary underline">
                {item.eventTitle}
              </Link>
              .
            </p>
            <Link
              to="/my/tickets"
              className="mt-1 inline-block font-mono-accent text-xs text-primary hover:underline"
            >
              → view your ticket
            </Link>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dismiss(item.id)}
            className="shrink-0 h-7 w-7"
            aria-label="dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
