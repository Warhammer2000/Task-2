# Task 2 — Null Collective Events · Report

> **Live**: <https://task-2.lovable.app/>
> **Repository**: <https://github.com/Warhammer2000/Task-2>
> **Brief theme**: prototyping with Lovable — event hosting and attendance platform

This document covers the tools and techniques I used, what worked, what did not, and the notable decisions made during development. For end-user usage instructions, see [`README.md`](./README.md).

---

## 1. Approach — discipline first, speed second

The brief mandates Lovable. It also explicitly says *"this is not a speedrun challenge"* and *"a rushed or minimally implemented submission will not qualify"*. With 32 hard requirements spanning four user roles, full-stack auth + DB + RLS + storage + realtime + waitlist atomicity + CSV export + community moderation, the failure mode is not building too slowly — it's shipping a confidently-broken submission whose RLS allows arbitrary feedback insertion or whose waitlist trigger silently no-ops.

So I built this submission around a single discipline: **every Lovable phase must pass an explicit verification gate before the next phase begins**. No Phase 4 work on top of an unverified Phase 1 RLS policy. No Phase 3 RSVP flow on top of an unverified Phase 2 explore page. The bet was that a few extra round-trips between phases would save more time than they cost — by surfacing bugs while their fix was still surgical, before they could compound into mid-Phase-7 fire drills.

The bet paid off. Three foundation-class bugs were caught and fixed mid-build (RLS typo, EXECUTE-revoke regression, dashboard aggregation crash). Each would have been substantially harder to find and fix during a final smoke test on top of three more phases of dependent code.

---

## 2. Tools and techniques

| Tool | Used for |
|------|----------|
| **Lovable Pro** ($25/mo, compensated by Vention) | Primary IDE / agent — full-stack scaffolding, component generation, Edge Functions, migrations |
| **Lovable Cloud** (managed Supabase) | Postgres + auth + RLS + storage + realtime + Edge runtime — zero-config backend |
| **Claude Code (Opus 4.7)** | Pre-flight planning, R-coverage cross-referencing, RLS audit, prompt engineering for Lovable, post-Phase verification |
| **Postgres triggers + functions (SECURITY DEFINER)** | Atomic FIFO waitlist promotion with `FOR UPDATE SKIP LOCKED` (no race conditions on parallel cancellations) |
| **`qrcode` npm + RFC 5545 hand-rolled `.ics`** | Ticket QR rendering + Add-to-Calendar |
| **GitHub two-way sync via Lovable** | Free undo every commit, escape hatch to local IDE if needed |

### Process techniques that mattered

**Plan mode kickoff with R-mapping.** Lovable was instructed to return a structured 7-phase plan with explicit `[R#]` tags on every item before generating any code. The plan came back with a coverage matrix showing all 32 requirements mapped to specific phase items — orphans and duplicate-mapping were visible at a glance. The plan cost ~1 credit; it prevented an estimated 50–100 credits of mis-scoped iteration.

**Audit-first phase gates.** After every phase bookmark, I cross-referenced what Lovable claimed against the plan items, then ran a targeted smoke test (UI + RLS audit + edge function calls). Phases 2, 4, and 5 each surfaced a real bug that the gate caught — see §4.

**Surgical-edit prompts.** Every modification beyond a fresh phase used the explicit anti-rewrite formula ("Modify ONLY <section>. Do not rewrite other components. Evaluate dependencies first.") — this neutralized Lovable's documented tendency to silently rewrite full files on small changes.

**One-shot fixture seeding before every gate.** Phase 2 was verified against four fixture events injected via SQL migration; Phase 7 expanded the same fixture pattern to a realistic 12-attendee demo without re-doing the schema.

---

## 3. What worked

1. **Plan-mode discipline upfront.** Spending 5 credits on a structured plan with explicit R-tags and a coverage matrix saved more time downstream than any other single decision. When Phase 4 dashboard regressed mid-build, the R-coverage matrix made it obvious what was at risk and what was independent.

2. **Postgres trigger + manual safety net for waitlist.** The hybrid pattern (atomic `SECURITY DEFINER` function with `FOR UPDATE SKIP LOCKED` triggered on cancellation/capacity-increase, plus a manual "Re-balance" button on the host dashboard) gives correctness for the 99% case and a recovery hatch for the 1%. The function source was reviewed and approved before any Phase 4 work began.

3. **Lovable Cloud's RLS-by-default scaffolding.** Every table got RLS enabled at creation time with explicit policies — none of the `USING (true)` shortcuts that public security audits report in 89% of Lovable apps. The four `USING (true)` policies that did remain are documented and intentional (public hosts, public feedback display, token-gated invites, authenticated-only profile reads).

4. **CSV export edge function.** UTF-8 BOM + CRLF + ISO 8601 + service-role email lookup (since `auth.users.email` isn't readable from RLS-gated client queries) — verified to open cleanly in both Excel and Google Sheets on the first try.

5. **Mobile-first as a build constraint, not a polish step.** Every Phase 2–6 component shipped with explicit `sm:` / `md:` / `lg:` breakpoints from creation. This was a direct response to a Task 1 retrospective finding where responsiveness was deferred and never added.

6. **Anti-slop theme commitment.** Phosphor green on near-black, JetBrains Mono on accents, Space Grotesk display, terminal-syntax empty states (`$ events --upcoming returned 0 rows`), V-mask SVG avatars. The default Lovable shadcn aesthetic is recognizable at a glance — overriding it took maybe 20 minutes of token configuration and was worth every credit.

---

## 4. What didn't work — and what I learned

### 4.1 RLS typo in feedback insertion policy

In Phase 1, Lovable generated:

```sql
EXISTS (SELECT 1 FROM rsvps r WHERE r.event_id = r.event_id AND r.user_id = auth.uid() AND r.status = 'confirmed')
```

`r.event_id = r.event_id` evaluates to `TRUE` for any row — meaning any user with any confirmed RSVP for any event could leave feedback for any other event. Caught in static review before Phase 2; fixed surgically by correcting to `r.event_id = feedbacks.event_id` and moving the predicate from `USING` to `WITH CHECK` (correct clause for INSERT policies).

**Lesson:** Static review of every RLS policy expression — even "obviously correct" ones generated by an AI agent.

### 4.2 EXECUTE revoke broke RLS evaluation

To silence a Supabase linter warning about SECURITY DEFINER functions being exposed via PostgREST, Lovable revoked `EXECUTE` from `public` on the helper functions used inside RLS policies. The linter quieted, but every anon and authenticated `SELECT` that touched these tables started returning *"permission denied for function is_host_member"* — caught when the Phase 2 Explore page rendered the error in the UI.

Fix: `GRANT EXECUTE ... TO anon, authenticated`. The functions are pure boolean checks with no side effects and no SQL injection surface, so the linter warning is an acceptable trade-off — documented here.

**Lesson:** Verifying RLS by inspecting policy expressions in the dashboard is not the same as verifying RLS by actually running a query as anon. The former missed this; only the latter caught it.

### 4.3 Phase 4 dashboard regression — PostgREST 1:1 embed shape

After Phase 4 shipped, the host dashboard hung at a skeleton state. Console showed `t.filter is not a function` inside a `reduce`. Root cause: PostgREST returns embedded relations as a single object for 1:1 (rsvp → ticket) and as an array for 1:N. The aggregation code assumed array-shape uniformly. Fix: handle both shapes in the aggregator.

**Lesson:** Document this idiom for any future PostgREST embed work — it's the single most common silent bug class.

### 4.4 Member-invite scope deviation

The brief says "Hosts can invite members" (plural — implying any member with role='host' can issue invites). The implementation made `/dashboard/members` owner-only. For a small hackathon-scale Host this is functionally indistinguishable, but it is a literal-text deviation. Documented here and listed in known limitations.

---

## 5. Notable decisions

### 5.1 Feedback eligibility: confirmed RSVP, not check-in

The brief says *"Attendees can submit post-event feedback after the event ends"*. "Attendees" is ambiguous — it could mean people with confirmed RSVPs, or people who actually showed up (checked in). I locked the eligibility to **confirmed RSVP**, not check-in. Reasoning:

- Brief language matches "attendees" colloquially → confirmed RSVPs are the canonical attendee set.
- Simpler logic, fewer edge cases, no dependency on a Checker remembering to scan everyone.
- The RLS policy in `feedbacks_insert_confirmed_after_end` enforces this strictly.

This deliberately diverges from a stricter "checked-in only" interpretation — flagged here for transparency.

### 5.2 Hybrid waitlist promotion: trigger + manual re-balance button

The brief says promotion is *"automatic"*. A pure client-side promotion call is race-prone if two cancellations land together. A pure trigger implementation handles correctness but offers no recovery if it ever silently no-ops. The hybrid (trigger as primary, manual "Re-balance" button on the dashboard as the recovery path) covers both. The manual button calls the same `promote_waitlist(event_id)` SQL function — so there is exactly one piece of waitlist promotion logic, two trigger paths.

### 5.3 Repository structure

Lovable's GitHub two-way sync creates a new repo per project and does not connect to an existing one — so the working repository is `Warhammer2000/event-hub-collective-84062154` with the project at the root. The brief asks for the project to be placed in a `task-2/` folder, which is satisfied at submission time by mirroring the Lovable repo into `Warhammer2000/Task-2/task-2/...`. This satisfies the literal brief requirement without sacrificing Lovable's two-way sync during the build.

### 5.4 Theming — hacker collective with no political content

The seed data uses hacker-culture handles (`anon_42`, `void_walker`, `0x1A3F`, `kernel_panic`) and event names from real hacker-meetup vocabulary (CTF, lockpick village, OPSEC workshop, demoscene). The aesthetic gestures at 4chan-adjacent vibes (V-mask avatars, greentext-friendly typography) but the content is deliberately scrubbed of any political, /pol/-coded, or offensive references — the goal is recognizable hacker collective, not edgelord. This was an explicit pre-commit decision.

### 5.5 Free/Paid toggle — visible disabled, not hidden

The brief says the Paid option is *"disabled with a 'Coming soon' tooltip"*. I read this as a literal UX requirement: the option must be **visible** (so users see the platform's product roadmap) but **non-clickable**, with a tooltip explaining why. This is implemented as a button group where the Paid button is greyed and the tooltip fires on both hover and click. Easy to miss the difference between "hidden" and "visible-disabled" — but the latter is the brief literal.

---

## 6. What's intentionally out of scope

- **Paid events / Stripe integration** — toggle disabled per brief.
- **Camera-based QR scanning** — manual code entry sufficient per brief; the QR is generated for each ticket but the door device just types the code in.
- **Email notifications** beyond the in-app promotion banner — would require SMTP config + templates; deferred.
- **i18n / multi-language** — single-language only.
- **Mobile native** — web only (responsive at 375 / 768 / 1024).

---

## 7. Stack-level differentiator

Most submissions to this task will be Lovable-only. The combination used here — Lovable Pro for the full-stack scaffold plus Claude Code (Opus 4.7) for pre-flight planning, audit-driven phase gates, and Postgres trigger review — produced an order-of-magnitude tighter feedback loop than chat-only iteration would have. Three foundation bugs were caught before they shipped because the gate caught them; without the gate, they would have surfaced during final smoke testing on a much larger surface area.

This is the technique I'd reuse for any production-leaning Lovable build: **plan with the AI you trust most for reasoning, build with the AI optimized for the platform, audit-gate every phase boundary**.

---

## 8. Honest postscript

This submission is not perfect. Known limitations:

- **OG / Twitter Card tags are static site-level, not dynamic per event/host.** The HTML response from any event or host URL contains correct OG and Twitter Card meta tags, but they reflect the site-level title and description rather than the specific event/host — a known limitation of SPAs that inject dynamic meta tags client-side via `react-helmet-async`. Crawlers that execute JavaScript (Twitterbot since 2022, some others) will see the correct dynamic values; static crawlers (Facebook, LinkedIn link previews) will see the site default. Resolving this would require server-side rendering (Vite SSR or pre-rendering at build time per route) — out of scope for this iteration.
- Member invite scope is owner-only (brief says "Hosts" — minor literal deviation).
- Excel compatibility was verified with English-only seed data; cyrillic / extended UTF-8 round-trip not exhaustively tested (the committed `sample-export.csv` is ASCII so the BOM, while emitted by the edge function for live exports, is not visible in the static sample).
- Multi-user end-to-end FIFO test was performed via static review of the SQL function + 1-user UI test, not via 4 concurrent browser sessions — the white-box review found no defects.
- Mobile responsive was verified at 375 / 768 / 1024 but not on physical devices.
- Lovable two-way GitHub sync was intentionally broken at submission time when the working repo was renamed (`event-hub-collective-84062154` → `Task-2`) and restructured into a `task-2/` subfolder per the brief. Pre-restructure, Lovable's sync worked end-to-end through Phase 7.

The one-shot rule means there is no resubmit. The intention is "genuine effort, well-structured, attempts the full scope" — not "every requirement perfectly". I am confident the foundation is correct and the user-visible flows work; the limitations above are honest, scoped, and called out.

## R9 fix — dynamic Open Graph for share previews

Lovable hosting does not expose UA-aware middleware or build-time prerendering, so patterns 1–3 in the brief are not feasible. I implemented pattern 4: two parallel public Supabase edge functions, `og-event` (`/functions/v1/og-event/<eventId>`) and `og-host` (`/functions/v1/og-host/<slug>`), both with `verify_jwt = false`. Each fetches its target via the anon client (RLS still applies — only published+public events leak metadata; unlisted/draft and unknown hosts fall through to a generic not-found preview), then User-Agent-branches the response: crawler UAs (Twitterbot, Slackbot, facebookexternalhit, TelegramBot, LinkedInBot, Discordbot, …) get `200 OK` with SSR HTML containing `og:title`, `og:description` (truncated to 160 chars), `og:image` (cover/logo URL with `/placeholder.svg` fallback), `og:url`, `og:type` (`event` / `profile`), `og:site_name="Null Collective"`, and the mirrored `twitter:*` tags (`twitter:card=summary_large_image`); non-crawler UAs get a server-level `302` to the SPA route (`/events/:id` or `/hosts/:slug`), bypassing Supabase's text/plain + sandbox CSP that would otherwise prevent inline meta-refresh from rendering. The event detail and host pages each have a "share" button that copies the corresponding share-URL — paste it in Slack/Twitter/Telegram and the unfurl shows the per-target title + image. Verify with `curl -I -A "Mozilla/5.0" .../og-host/<slug>` (`HTTP/2 302`, `Location: /hosts/<slug>`) and `curl -A "Twitterbot/1.0" .../og-host/<slug> | grep og:` (per-host values), plus the equivalent against `og-event`, the Twitter Card Validator, and the Facebook Sharing Debugger.
