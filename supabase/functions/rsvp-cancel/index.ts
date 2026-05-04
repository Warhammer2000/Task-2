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

  let payload: { rsvp_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const rsvpId = payload.rsvp_id;
  if (!rsvpId || typeof rsvpId !== "string" || rsvpId.length > 64) {
    return json({ error: "invalid_rsvp_id" }, 400);
  }

  // Update under the user's own RLS context — they can only cancel their own.
  // The AFTER UPDATE trigger on rsvps will auto-promote a waitlisted user.
  const { data, error } = await userClient
    .from("rsvps")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), position: null })
    .eq("id", rsvpId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return json({ error: "cancel_failed", detail: error.message }, 500);
  if (!data) return json({ error: "rsvp_not_found_or_forbidden" }, 404);

  return json({ ok: true });
});
