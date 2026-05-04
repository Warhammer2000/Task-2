// Public SSR endpoint that returns per-host Open Graph HTML for crawler bots.
// Mirrors og-event but for host profile pages.
//
// URL shape: /functions/v1/og-host/<slug>
//
// No JWT required (public share preview). verify_jwt is disabled in config.toml.

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

// Same crawler regex as og-event.
const CRAWLER_UA_RE =
  /bot|crawler|spider|facebookexternalhit|whatsapp|telegrambot|slackbot|skype|pinterest|discordbot|twitterbot|linkedin|googlebot|bingbot|applebot|embedly|quora link preview|outbrain|vkshare|w3c_validator|redditbot/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 1];

  // Same hardcoded fallback as og-event.
  const configuredSite = Deno.env.get("PUBLIC_SITE_URL");
  const origin = (configuredSite && configuredSite.replace(/\/$/, "")) ||
    "https://task-2.lovable.app";
  const fallbackImage = `${origin}/placeholder.svg`;
  const siteName = "Null Collective";

  const userAgent = req.headers.get("user-agent") || "";
  const isCrawler = CRAWLER_UA_RE.test(userAgent);

  const validSlug = !!slug && /^[a-z0-9-]+$/i.test(slug) && slug !== "og-host";
  const spaTarget = validSlug ? `${origin}/hosts/${slug}` : origin;

  // Humans get a 302.
  if (!isCrawler) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: spaTarget,
        "Cache-Control": "no-store",
      },
    });
  }

  if (!validSlug) {
    return new Response(renderHtml({
      title: siteName,
      description: "Events for the underground.",
      image: fallbackImage,
      canonical: origin,
      redirectTo: origin,
      profileType: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: host } = await supabase
    .from("hosts")
    .select("name, slug, bio, logo_url")
    .eq("slug", slug)
    .maybeSingle();

  const spaUrl = `${origin}/hosts/${slug}`;

  if (!host) {
    // Don't leak existence — render a generic host-not-found that points to SPA.
    return new Response(renderHtml({
      title: `${siteName} — host not found`,
      description: "This host is unavailable.",
      image: fallbackImage,
      canonical: spaUrl,
      redirectTo: spaUrl,
      profileType: false,
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const title = `${host.name} · ${siteName}`;
  const description = truncate(
    host.bio ?? `${host.name} — community host on ${siteName}.`,
    160,
  );
  const image = host.logo_url || fallbackImage;

  return new Response(renderHtml({
    title,
    description,
    image,
    canonical: spaUrl,
    redirectTo: spaUrl,
    profileType: true,
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
  profileType: boolean;
}): string {
  const t = escapeHtml(opts.title);
  const d = escapeHtml(opts.description);
  const img = escapeHtml(opts.image);
  const canon = escapeHtml(opts.canonical);
  const redir = escapeHtml(opts.redirectTo);
  const ogType = opts.profileType ? "profile" : "website";

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
