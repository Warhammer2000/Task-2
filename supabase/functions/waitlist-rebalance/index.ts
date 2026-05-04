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

  // Authorization: only host-role members of the event's host can rebalance.
  const { data: ev, error: evErr } = await userClient
    .from("events")
    .select("id, host_id")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr || !ev) return json({ error: "event_not_found" }, 404);

  const { data: isHost, error: roleErr } = await userClient.rpc("has_host_role", {
    _user_id: user.id,
    _host_id: ev.host_id,
    _role: "host",
  });
  if (roleErr) return json({ error: "role_check_failed" }, 500);
  if (!isHost) return json({ error: "forbidden" }, 403);

  const { data, error } = await userClient.rpc("promote_waitlist", { _event_id: eventId });
  if (error) return json({ error: "rebalance_failed", detail: error.message }, 500);

  return json({ ok: true, promoted: data ?? 0 });
});
