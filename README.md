# Null Collective Events

> A lightweight event hosting and attendance platform for community-style gatherings — built with Lovable for AI Challenge 2.0 Task 2.

**Live**: <https://task-2.lovable.app/>
**Repository**: <https://github.com/Warhammer2000/Task-2>

This is a **usage guide**. For technical decisions and what shipped, see [`report.md`](./report.md).

---

## What it does

Organizers publish events. Attendees RSVP and receive a digital ticket with a QR code. At the door, a designated Checker scans (or types in) the code to confirm attendance. After the event, attendees can leave feedback and upload photos.

**Four roles, one platform:**

| Role | What they can do |
|------|------------------|
| **Anonymous visitor** | Browse all public events, see Host pages, report misuse |
| **Signed-in user** | RSVP, view own tickets, cancel, upload photos, leave feedback after attending |
| **Host** (per Host org) | Create and manage events, approve gallery uploads, export attendance CSVs, invite team members |
| **Checker** (per Host org) | Access only the check-in page for events under that Host |

---

## Quickstart — 4 main flows

### Flow 1: Publish an event (Host)

1. **Sign up** at `/auth/sign-up` with your email. Verify the link sent to your inbox.
2. Click **`./host`** in the top nav. If you're not a Host yet, you're redirected to `/onboarding/host` — fill in name, logo, bio, contact email. Slug is auto-derived.
3. Hit **`+ new event`** on the Host dashboard. Fill in title, description, start/end with timezone, venue address (or online link), capacity, cover image.
4. **Free/Paid**: Free is selected by default. Paid is intentionally disabled with a "Coming soon" tooltip — paid events will land in a future iteration.
5. **Visibility**: Public (searchable on `/explore`) or Unlisted (link-only).
6. **State**: Draft (edit privately) or Published (live). Use the dashboard row actions to **Publish**, **Unpublish**, or **Duplicate** any event.

### Flow 2: RSVP and get your ticket (Attendee)

1. Browse events at `/` (the Explore page). Filter by text, date range, location, or toggle "Include Past" to see ended events.
2. Click any event to see details. If you're signed out, the **RSVP** button redirects you to sign-in and then back to the event page.
3. **Capacity filling up?** No problem — you'll be added to the waitlist with a visible position. When a confirmed attendee cancels (or the host raises capacity), the FIFO promotion fires automatically and you'll see an in-app banner.
4. On confirmation, your **ticket** appears with a unique QR code and an **Add to Calendar** button (downloads `.ics`, works in Google Calendar / Outlook / Apple Calendar).
5. View all upcoming tickets at `/my/tickets`. Cancel any RSVP from the event page or the tickets page.

### Flow 3: Check people in at the door (Checker)

1. Receive an invitation link from a Host (`/invite/<token>` with role=`checker`). Sign in (or sign up) to accept.
2. Once accepted, navigate to `/dashboard/events/<event-id>/checkin` for the event you're working.
3. Type in the ticket code from the attendee's QR (or scan it with your phone camera, then paste — camera scanning isn't a UI requirement; manual entry is sufficient).
4. The page shows **live counters** (Going / Waitlist / Checked-in) updating in real-time as multiple Checkers work in parallel.
5. **Already-scanned codes** show "Already checked in at {time} by {checker}" — duplicate prevented.
6. **Made a mistake?** Hit **Undo last scan** to clear the most recent check-in.

### Flow 4: After the event (Community)

- **Feedback** (1–5 stars + optional comment) becomes available on the event page once `end_at` has passed and you have a confirmed RSVP.
- **Photo gallery** uploads are accepted from any signed-in user. Photos enter a Pending queue until the Host approves them; only approved photos display publicly.
- **Reports** can be submitted by anyone (including anonymous visitors) against an event or a photo. Reported items land in the Host's review queue and can be hidden.

---

## CSV export

From the Host dashboard, click **CSV** on any event row to download an attendance export.

Schema: `name, email, rsvp_status, checked_in_at` (ISO 8601 datetimes, UTF-8 with BOM, CRLF line endings — opens cleanly in both Microsoft Excel and Google Sheets).

A canonical sample export is committed at [`public/sample-export.csv`](./public/sample-export.csv) (also accessible at `/sample-export.csv` on the deployed app).

---

## Tech stack

React + TypeScript + Tailwind + shadcn/ui frontend, scaffolded by **Lovable** ([Pro plan](https://lovable.dev/pricing), agent powered by Claude Opus 4.6). Backend on **Lovable Cloud** (managed Supabase): email/password auth with verification, Postgres with Row-Level Security on every table, Storage buckets for cover images and gallery photos, Edge Functions for RSVP creation, cancellation, CSV export, and waitlist re-balance, plus a Postgres trigger for atomic FIFO promotion.

For decisions, what worked, what didn't, and the development process — see [`report.md`](./report.md).
