import { supabase } from "@/integrations/supabase/client";

export type EventRow = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  capacity: number;
  is_paid: boolean;
  state: "draft" | "published";
  visibility: "public" | "unlisted";
  cover_image_url: string | null;
  venue_address: string | null;
  venue_online_link: string | null;
};

export type EventWithHost = EventRow & {
  hosts: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    bio: string | null;
    contact_email: string | null;
  } | null;
};

export interface ExploreFilters {
  search: string;
  location: string;
  includePast: boolean;
}

/** Public Explore query — published + public only (RLS also enforces). */
export async function fetchExploreEvents(f: ExploreFilters): Promise<EventWithHost[]> {
  let q = supabase
    .from("events")
    .select(
      "id, host_id, title, description, start_at, end_at, timezone, capacity, is_paid, state, visibility, cover_image_url, venue_address, venue_online_link, hosts!inner ( id, name, slug, logo_url, bio, contact_email )"
    )
    .eq("state", "published")
    .eq("visibility", "public")
    .order("start_at", { ascending: true });

  if (!f.includePast) {
    q = q.gte("end_at", new Date().toISOString());
  }
  if (f.search.trim()) {
    const s = f.search.trim().replace(/[%,]/g, "");
    q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
  }
  if (f.location.trim()) {
    const s = f.location.trim().replace(/[%,]/g, "");
    q = q.ilike("venue_address", `%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as EventWithHost[];
}

export async function fetchEventById(id: string): Promise<EventWithHost | null> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, host_id, title, description, start_at, end_at, timezone, capacity, is_paid, state, visibility, cover_image_url, venue_address, venue_online_link, hosts!inner ( id, name, slug, logo_url, bio, contact_email )"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as EventWithHost) ?? null;
}

export async function fetchHostBySlug(slug: string) {
  const { data, error } = await supabase
    .from("hosts")
    .select("id, name, slug, logo_url, bio, contact_email")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchHostEvents(hostId: string) {
  const { data, error } = await supabase
    .from("events")
    .select("id, host_id, title, description, start_at, end_at, timezone, capacity, is_paid, state, visibility, cover_image_url, venue_address, venue_online_link")
    .eq("host_id", hostId)
    .eq("state", "published")
    .eq("visibility", "public")
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

/** Format a start/end window for display, respecting the event's stored timezone label. */
export function formatEventWindow(start: string, end: string, tz?: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const sd = s.toLocaleDateString(undefined, dateOpts);
  const st = s.toLocaleTimeString(undefined, timeOpts);
  const et = e.toLocaleTimeString(undefined, timeOpts);
  const ed = e.toLocaleDateString(undefined, dateOpts);
  const tzSuffix = tz ? ` ${tz}` : "";
  if (sameDay) return `${sd} · ${st} → ${et}${tzSuffix}`;
  return `${sd} ${st} → ${ed} ${et}${tzSuffix}`;
}

export function isEnded(end_at: string): boolean {
  return new Date(end_at).getTime() < Date.now();
}
