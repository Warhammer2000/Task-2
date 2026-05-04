// Public SSR endpoint that returns per-event Open Graph HTML for crawler bots.
// Humans get a meta-refresh + JS redirect to the SPA route, so the experience
// is essentially "click link → land on /events/:id" with a brief flash only on
// share-link expansion (rare for human visitors who get the share URL pasted).
//
// URL shape: /functions/v1/og-event/<eventId>
//
// No JWT required (public share preview). verify_jwt is disabled below.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= n) return clean;
  return clean.slice(0, n - 1) + "…";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Path looks like /og-event/<id> or /functions/v1/og-event/<id>
  const parts = url.pathname.split("/").filter(Boolean);
  const eventId = parts[parts.length - 1];

  const origin = `${url.protocol}//${url.host}`;
  const fallbackImage = `${origin}/placeholder.svg`;
  const siteName = "Null Collective";

  if (!eventId || !UUID_RE.test(eventId)) {
    return new Response(renderHtml({
      title: siteName,
      description: "Events for the underground.",
      image: fallbackImage,
      canonical: origin,
      redirectTo: origin,
      eventType: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, description, cover_image_url, state, visibility, hosts!inner(name)"
    )
    .eq("id", eventId)
    .maybeSingle();

  const spaUrl = `${origin}/events/${eventId}`;

  if (
    !event ||
    event.state !== "published" ||
    event.visibility !== "public"
  ) {
    // Don't leak unlisted/draft metadata to crawlers — send them to the SPA
    // which will render a generic 404 / not-found state.
    return new Response(renderHtml({
      title: `${siteName} — event not found`,
      description: "This event is unavailable.",
      image: fallbackImage,
      canonical: spaUrl,
      redirectTo: spaUrl,
      eventType: false,
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const hostName =
    (event as any).hosts?.name ?? siteName;
  const title = `${event.title} · ${hostName}`;
  const description = truncate(
    event.description ?? `An event hosted by ${hostName}.`,
    160,
  );
  const image = event.cover_image_url || fallbackImage;

  return new Response(renderHtml({
    title,
    description,
    image,
    canonical: spaUrl,
    redirectTo: spaUrl,
    eventType: true,
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
});

function renderHtml(opts: {
  title: string;
  description: string;
  image: string;
  canonical: string;
  redirectTo: string;
  eventType: boolean;
}): string {
  const t = escapeHtml(opts.title);
  const d = escapeHtml(opts.description);
  const img = escapeHtml(opts.image);
  const canon = escapeHtml(opts.canonical);
  const redir = escapeHtml(opts.redirectTo);
  const ogType = opts.eventType ? "event" : "website";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${canon}" />

<meta property="og:type" content="${ogType}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:image" content="${img}" />
<meta property="og:url" content="${canon}" />
<meta property="og:site_name" content="Null Collective" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />

<meta http-equiv="refresh" content="0; url=${redir}" />
<script>window.location.replace(${JSON.stringify(opts.redirectTo)});</script>
</head>
<body>
<p>Redirecting to <a href="${redir}">${t}</a>…</p>
</body>
</html>`;
}
