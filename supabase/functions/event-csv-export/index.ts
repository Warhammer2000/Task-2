import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function csvEscape(v: string | null | undefined): string {
  const s = v ?? "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthenticated" }, 401);
  const user = userData.user;

  // event_id can come from query (?event_id=) or POST body
  let eventId: string | null = null;
  if (req.method === "GET") {
    eventId = new URL(req.url).searchParams.get("event_id");
  } else if (req.method === "POST") {
    try {
      const body = await req.json();
      eventId = typeof body?.event_id === "string" ? body.event_id : null;
    } catch { /* ignore */ }
  } else {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!eventId || eventId.length > 64) return json({ error: "invalid_event_id" }, 400);

  // AuthZ: must be a host-role member.
  const { data: ev, error: evErr } = await userClient
    .from("events")
    .select("id, host_id, title")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr || !ev) return json({ error: "event_not_found" }, 404);

  const { data: isHost, error: roleErr } = await userClient.rpc("has_host_role", {
    _user_id: user.id, _host_id: ev.host_id, _role: "host",
  });
  if (roleErr) return json({ error: "role_check_failed" }, 500);
  if (!isHost) return json({ error: "forbidden" }, 403);

  // Fetch RSVPs + tickets + profile display_name (RLS allows host members to see all).
  const { data: rsvps, error: rsvpErr } = await userClient
    .from("rsvps")
    .select("id, user_id, status, created_at, profiles:user_id ( display_name ), tickets ( checked_in_at )")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (rsvpErr) return json({ error: "rsvps_fetch_failed", detail: rsvpErr.message }, 500);

  // Need to look up emails via service-role (auth.users not selectable via anon).
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const userIds = Array.from(new Set((rsvps ?? []).map((r) => r.user_id))).filter(Boolean);
  const emailByUser = new Map<string, string>();
  // Resolve emails one-by-one (admin.getUserById). Small audiences expected.
  for (const uid of userIds) {
    const { data, error } = await admin.auth.admin.getUserById(uid as string);
    if (!error && data?.user?.email) emailByUser.set(uid as string, data.user.email);
  }

  const rows: string[] = [];
  rows.push(["name", "email", "rsvp_status", "checked_in_at"].join(","));
  for (const r of (rsvps ?? [])) {
    const profile = (r as unknown as { profiles?: { display_name?: string | null } | null }).profiles;
    const tickets = (r as unknown as { tickets?: Array<{ checked_in_at: string | null }> | null }).tickets ?? [];
    const checkedIn = tickets.find((t) => t.checked_in_at)?.checked_in_at ?? "";
    rows.push([
      csvEscape(profile?.display_name ?? ""),
      csvEscape(emailByUser.get(r.user_id) ?? ""),
      csvEscape(r.status as string),
      csvEscape(checkedIn ? new Date(checkedIn).toISOString() : ""),
    ].join(","));
  }

  // UTF-8 BOM + CRLF line endings for Excel friendliness.
  const csv = "\uFEFF" + rows.join("\r\n") + "\r\n";

  const safeTitle = (ev.title || "event").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event";
  const filename = `${safeTitle}_rsvps_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
