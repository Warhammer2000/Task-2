
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('host', 'checker');
CREATE TYPE public.event_visibility AS ENUM ('public', 'unlisted');
CREATE TYPE public.event_state AS ENUM ('draft', 'published');
CREATE TYPE public.rsvp_status AS ENUM ('confirmed', 'waitlist', 'cancelled');
CREATE TYPE public.photo_status AS ENUM ('pending', 'approved', 'hidden');
CREATE TYPE public.report_target_type AS ENUM ('event', 'photo');
CREATE TYPE public.report_status AS ENUM ('open', 'hidden', 'dismissed');

-- ============================================================
-- TABLES
-- ============================================================

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- hosts
CREATE TABLE public.hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  bio TEXT,
  contact_email TEXT,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hosts_owner ON public.hosts(owner_id);

-- host_members
CREATE TABLE public.host_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  invited_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(host_id, user_id, role)
);
CREATE INDEX idx_host_members_user ON public.host_members(user_id);
CREATE INDEX idx_host_members_host ON public.host_members(host_id);

-- host_invites
CREATE TABLE public.host_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_host_invites_token ON public.host_invites(token);

-- events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  venue_address TEXT,
  venue_online_link TEXT,
  capacity INT NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  cover_image_url TEXT,
  visibility public.event_visibility NOT NULL DEFAULT 'public',
  state public.event_state NOT NULL DEFAULT 'draft',
  is_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_host ON public.events(host_id);
CREATE INDEX idx_events_state_visibility ON public.events(state, visibility);
CREATE INDEX idx_events_start ON public.events(start_at);

-- rsvps
CREATE TABLE public.rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.rsvp_status NOT NULL,
  position INT,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only one active RSVP per (event, user) at a time
CREATE UNIQUE INDEX idx_rsvps_event_user_active
  ON public.rsvps(event_id, user_id)
  WHERE status <> 'cancelled';
CREATE INDEX idx_rsvps_event_status_position ON public.rsvps(event_id, status, position);
CREATE INDEX idx_rsvps_user ON public.rsvps(user_id);

-- tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID NOT NULL UNIQUE REFERENCES public.rsvps(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_code ON public.tickets(code);

-- gallery_photos
CREATE TABLE public.gallery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status public.photo_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gallery_event_status ON public.gallery_photos(event_id, status);

-- feedbacks
CREATE TABLE public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);
CREATE INDEX idx_feedbacks_event ON public.feedbacks(event_id);

-- reports
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type public.report_target_type NOT NULL,
  target_id UUID NOT NULL,
  reporter_id UUID REFERENCES public.profiles(id),
  reason TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_reports_target ON public.reports(target_type, target_id);
CREATE INDEX idx_reports_status ON public.reports(status);

-- notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_hosts_updated BEFORE UPDATE ON public.hosts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- SECURITY DEFINER role-check helper (avoids RLS recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_host_role(_user_id UUID, _host_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.host_members
    WHERE user_id = _user_id AND host_id = _host_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_host_member(_user_id UUID, _host_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.host_members
    WHERE user_id = _user_id AND host_id = _host_id
  );
$$;

CREATE OR REPLACE FUNCTION public.event_host_id(_event_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT host_id FROM public.events WHERE id = _event_id;
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- hosts (public read for landing/host pages)
CREATE POLICY "hosts_select_all" ON public.hosts
  FOR SELECT USING (true);
CREATE POLICY "hosts_insert_owner" ON public.hosts
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "hosts_update_owner" ON public.hosts
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "hosts_delete_owner" ON public.hosts
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- host_members
CREATE POLICY "host_members_select_org" ON public.host_members
  FOR SELECT TO authenticated USING (
    public.is_host_member(auth.uid(), host_id)
    OR EXISTS (SELECT 1 FROM public.hosts h WHERE h.id = host_id AND h.owner_id = auth.uid())
  );
CREATE POLICY "host_members_insert_owner_or_self_via_invite" ON public.host_members
  FOR INSERT TO authenticated WITH CHECK (
    -- host owner can add members
    EXISTS (SELECT 1 FROM public.hosts h WHERE h.id = host_id AND h.owner_id = auth.uid())
    -- or self-insert (used by invite-accept flow; row must be for current user)
    OR user_id = auth.uid()
  );
CREATE POLICY "host_members_delete_owner" ON public.host_members
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.hosts h WHERE h.id = host_id AND h.owner_id = auth.uid())
    OR user_id = auth.uid()
  );

-- host_invites: anyone can SELECT by token (needed for accept flow), owner manages
CREATE POLICY "host_invites_select_all" ON public.host_invites
  FOR SELECT USING (true);
CREATE POLICY "host_invites_insert_owner" ON public.host_invites
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.hosts h WHERE h.id = host_id AND h.owner_id = auth.uid())
  );
CREATE POLICY "host_invites_update_owner" ON public.host_invites
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.hosts h WHERE h.id = host_id AND h.owner_id = auth.uid())
  );
CREATE POLICY "host_invites_delete_owner" ON public.host_invites
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.hosts h WHERE h.id = host_id AND h.owner_id = auth.uid())
  );

-- events
CREATE POLICY "events_select_published_public_or_member" ON public.events
  FOR SELECT USING (
    (state = 'published' AND visibility = 'public')
    OR (state = 'published' AND visibility = 'unlisted')  -- accessible by direct link; not in Explore (filtered in queries)
    OR (auth.uid() IS NOT NULL AND public.is_host_member(auth.uid(), host_id))
  );
CREATE POLICY "events_insert_host_role" ON public.events
  FOR INSERT TO authenticated WITH CHECK (
    public.has_host_role(auth.uid(), host_id, 'host')
  );
CREATE POLICY "events_update_host_role" ON public.events
  FOR UPDATE TO authenticated USING (
    public.has_host_role(auth.uid(), host_id, 'host')
  ) WITH CHECK (
    public.has_host_role(auth.uid(), host_id, 'host')
  );
CREATE POLICY "events_delete_host_role" ON public.events
  FOR DELETE TO authenticated USING (
    public.has_host_role(auth.uid(), host_id, 'host')
  );

-- rsvps
CREATE POLICY "rsvps_select_own_or_host_member" ON public.rsvps
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.is_host_member(auth.uid(), public.event_host_id(event_id))
  );
CREATE POLICY "rsvps_insert_self" ON public.rsvps
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "rsvps_update_self_or_promotion_target" ON public.rsvps
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "rsvps_delete_self" ON public.rsvps
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- tickets
CREATE POLICY "tickets_select_owner_or_host_member" ON public.tickets
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rsvps r
      WHERE r.id = rsvp_id
        AND (
          r.user_id = auth.uid()
          OR public.is_host_member(auth.uid(), public.event_host_id(r.event_id))
        )
    )
  );
CREATE POLICY "tickets_insert_self" ON public.tickets
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.rsvps r WHERE r.id = rsvp_id AND r.user_id = auth.uid())
  );
CREATE POLICY "tickets_update_host_or_checker" ON public.tickets
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rsvps r
      WHERE r.id = rsvp_id
        AND public.is_host_member(auth.uid(), public.event_host_id(r.event_id))
    )
  );

-- gallery_photos
CREATE POLICY "gallery_select_approved_or_own_or_host" ON public.gallery_photos
  FOR SELECT USING (
    status = 'approved'
    OR (auth.uid() IS NOT NULL AND uploader_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND public.is_host_member(auth.uid(), public.event_host_id(event_id)))
  );
CREATE POLICY "gallery_insert_authenticated" ON public.gallery_photos
  FOR INSERT TO authenticated WITH CHECK (uploader_id = auth.uid());
CREATE POLICY "gallery_update_host_role" ON public.gallery_photos
  FOR UPDATE TO authenticated USING (
    public.has_host_role(auth.uid(), public.event_host_id(event_id), 'host')
  );
CREATE POLICY "gallery_delete_host_role_or_uploader" ON public.gallery_photos
  FOR DELETE TO authenticated USING (
    uploader_id = auth.uid()
    OR public.has_host_role(auth.uid(), public.event_host_id(event_id), 'host')
  );

-- feedbacks (confirmed-RSVP only after event end; UNIQUE enforced at column level)
CREATE POLICY "feedbacks_select_all" ON public.feedbacks
  FOR SELECT USING (true);
CREATE POLICY "feedbacks_insert_confirmed_after_end" ON public.feedbacks
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.end_at < now()
    )
    AND EXISTS (
      SELECT 1 FROM public.rsvps r
      WHERE r.event_id = event_id AND r.user_id = auth.uid() AND r.status = 'confirmed'
    )
  );

-- reports (anon allowed)
CREATE POLICY "reports_insert_anyone" ON public.reports
  FOR INSERT WITH CHECK (
    -- if reporter_id provided, must equal auth.uid; else must be null (anon)
    (reporter_id IS NULL AND auth.uid() IS NULL)
    OR (reporter_id = auth.uid())
  );
CREATE POLICY "reports_select_host_members" ON public.reports
  FOR SELECT TO authenticated USING (
    (target_type = 'event' AND public.is_host_member(auth.uid(), public.event_host_id(target_id)))
    OR (target_type = 'photo' AND EXISTS (
      SELECT 1 FROM public.gallery_photos g
      WHERE g.id = target_id
        AND public.is_host_member(auth.uid(), public.event_host_id(g.event_id))
    ))
  );
CREATE POLICY "reports_update_host_members" ON public.reports
  FOR UPDATE TO authenticated USING (
    (target_type = 'event' AND public.is_host_member(auth.uid(), public.event_host_id(target_id)))
    OR (target_type = 'photo' AND EXISTS (
      SELECT 1 FROM public.gallery_photos g
      WHERE g.id = target_id
        AND public.is_host_member(auth.uid(), public.event_host_id(g.event_id))
    ))
  );

-- notifications
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Realtime publication for notifications (R15)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
