import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the user from the JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthenticated" }, 401);
  const user = userData.user;

  let payload: { event_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const eventId = payload.event_id;
  if (!eventId || typeof eventId !== "string" || eventId.length > 64) {
    return json({ error: "invalid_event_id" }, 400);
  }

  // Service client to perform atomic checks bypassing RLS (we re-validate in code).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Load event.
  const { data: event, error: evErr } = await admin
    .from("events")
    .select("id, capacity, end_at, state, visibility")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr || !event) return json({ error: "event_not_found" }, 404);
  if (event.state !== "published") return json({ error: "event_not_published" }, 400);
  if (new Date(event.end_at).getTime() < Date.now()) return json({ error: "event_ended" }, 400);

  // Existing RSVP?
  const { data: existing } = await admin
    .from("rsvps")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing && existing.status !== "cancelled") {
    return json({ error: "already_rsvped", status: existing.status, rsvp_id: existing.id }, 409);
  }

  // Capacity check.
  const { count: confirmedCount, error: cntErr } = await admin
    .from("rsvps")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (cntErr) return json({ error: "count_failed" }, 500);

  const capacity = event.capacity ?? 0;
  let status: "confirmed" | "waitlist";
  let position: number | null = null;

  if (capacity > 0 && (confirmedCount ?? 0) < capacity) {
    status = "confirmed";
  } else {
    status = "waitlist";
    const { data: posData } = await admin.rpc("next_waitlist_position", { _event_id: eventId });
    position = (posData as number | null) ?? 1;
  }

  // If the user has a previous cancelled row, update it; otherwise insert new.
  let rsvpId: string;
  if (existing) {
    const { data: upd, error: updErr } = await admin
      .from("rsvps")
      .update({
        status,
        position,
        confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
        cancelled_at: null,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (updErr || !upd) return json({ error: "rsvp_update_failed", detail: updErr?.message }, 500);
    rsvpId = upd.id;
  } else {
    const { data: ins, error: insErr } = await admin
      .from("rsvps")
      .insert({
        event_id: eventId,
        user_id: user.id,
        status,
        position,
        confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (insErr || !ins) return json({ error: "rsvp_insert_failed", detail: insErr?.message }, 500);
    rsvpId = ins.id;
  }

  // Issue a ticket if confirmed (FIFO promotion path also issues tickets via SQL function).
  if (status === "confirmed") {
    const code = crypto.randomUUID().replace(/-/g, "");
    await admin.from("tickets").upsert(
      { rsvp_id: rsvpId, code },
      { onConflict: "rsvp_id", ignoreDuplicates: true },
    );
  }

  return json({ ok: true, rsvp_id: rsvpId, status, position });
});
