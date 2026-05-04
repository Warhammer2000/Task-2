-- ============================================================
-- Phase 7.1: Demo seed
-- ============================================================

-- 1) Second host: 0xCafe Hacklab
INSERT INTO public.hosts (id, owner_id, name, slug, bio, contact_email, logo_url)
VALUES (
  '00000000-0000-0000-0000-00000000c0fe',
  '2aeff2b3-db72-4969-9ed8-c145c9edcb63',
  '0xCafe Hacklab',
  '0xcafe',
  'Tashkent-based hacklab. Hardware hacking, RF, soldering nights, CTF practice. Drop in on Wednesdays.',
  'hi@0xcafe.tash',
  'https://api.dicebear.com/9.x/identicon/svg?seed=0xcafe&backgroundColor=0d1b0d'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.host_members (host_id, user_id, role)
VALUES (
  '00000000-0000-0000-0000-00000000c0fe',
  '2aeff2b3-db72-4969-9ed8-c145c9edcb63',
  'host'
)
ON CONFLICT DO NOTHING;

-- 2) Twelve synthetic demo users (auth.users + profiles via trigger)
DO $$
DECLARE
  v_users text[][] := ARRAY[
    ['11111111-1111-1111-1111-000000000001','anon_42'],
    ['11111111-1111-1111-1111-000000000002','void_walker'],
    ['11111111-1111-1111-1111-000000000003','0x1A3F'],
    ['11111111-1111-1111-1111-000000000004','neuromancer'],
    ['11111111-1111-1111-1111-000000000005','phoebe.tty'],
    ['11111111-1111-1111-1111-000000000006','ghost_in_shell'],
    ['11111111-1111-1111-1111-000000000007','kernel_panic'],
    ['11111111-1111-1111-1111-000000000008','stack_overflow_irl'],
    ['11111111-1111-1111-1111-000000000009','mr_robot'],
    ['11111111-1111-1111-1111-00000000000a','trinity'],
    ['11111111-1111-1111-1111-00000000000b','morpheus_jr'],
    ['11111111-1111-1111-1111-00000000000c','nullbyte']
  ];
  i int;
  v_id uuid;
  v_name text;
BEGIN
  FOR i IN 1 .. array_length(v_users, 1) LOOP
    v_id := v_users[i][1]::uuid;
    v_name := v_users[i][2];

    -- Insert into auth.users (minimal columns; bypasses signup flow — for seed only)
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    )
    VALUES (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_name || '@seed.local',
      crypt('!seed-not-a-real-account!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"seed","providers":["seed"]}'::jsonb,
      jsonb_build_object('display_name', v_name),
      false, false
    )
    ON CONFLICT (id) DO NOTHING;

    -- Profile (trigger handle_new_user usually creates this; ensure idempotent)
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
      v_id,
      v_name,
      'https://api.dicebear.com/9.x/identicon/svg?seed=' || v_name || '&backgroundColor=001a0d'
    )
    ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          avatar_url   = EXCLUDED.avatar_url;
  END LOOP;
END $$;

-- 3) Adjust event capacities (Lockpick stays 2; OPSEC=20; Internal CTF=15; Demoscene=50)
UPDATE public.events SET capacity = 2  WHERE id = '19932cd8-e54f-49d8-a8ef-3acd9b155199'; -- Lockpick
UPDATE public.events SET capacity = 20 WHERE id = '0ab7e051-ae93-4d52-a995-eed23a405536'; -- OPSEC
UPDATE public.events SET capacity = 15 WHERE id = 'a2ff5c74-6d76-46ae-a8ca-77ff76d17efa'; -- Internal CTF
UPDATE public.events SET capacity = 50 WHERE id = 'a7d236ec-c34e-41de-9e64-39a4a81e9940'; -- Demoscene

-- 4) Wipe existing rsvps + tickets + feedbacks + gallery for these events (re-seed)
DELETE FROM public.tickets WHERE rsvp_id IN (
  SELECT id FROM public.rsvps WHERE event_id IN (
    '19932cd8-e54f-49d8-a8ef-3acd9b155199',
    '0ab7e051-ae93-4d52-a995-eed23a405536',
    'a2ff5c74-6d76-46ae-a8ca-77ff76d17efa',
    'a7d236ec-c34e-41de-9e64-39a4a81e9940'
  )
);
DELETE FROM public.rsvps WHERE event_id IN (
  '19932cd8-e54f-49d8-a8ef-3acd9b155199',
  '0ab7e051-ae93-4d52-a995-eed23a405536',
  'a2ff5c74-6d76-46ae-a8ca-77ff76d17efa',
  'a7d236ec-c34e-41de-9e64-39a4a81e9940'
);
DELETE FROM public.feedbacks WHERE event_id = 'a7d236ec-c34e-41de-9e64-39a4a81e9940';
DELETE FROM public.gallery_photos WHERE event_id = 'a7d236ec-c34e-41de-9e64-39a4a81e9940';

-- 5) Lockpick Village 2026 — capacity 2 → 2 confirmed + 2 waitlisted
WITH ins AS (
  INSERT INTO public.rsvps (event_id, user_id, status, position, confirmed_at, created_at)
  VALUES
    ('19932cd8-e54f-49d8-a8ef-3acd9b155199','11111111-1111-1111-1111-000000000001','confirmed', NULL, now() - interval '6 days', now() - interval '6 days'),
    ('19932cd8-e54f-49d8-a8ef-3acd9b155199','11111111-1111-1111-1111-000000000002','confirmed', NULL, now() - interval '5 days', now() - interval '5 days'),
    ('19932cd8-e54f-49d8-a8ef-3acd9b155199','11111111-1111-1111-1111-000000000003','waitlist',  1,    NULL,                         now() - interval '4 days'),
    ('19932cd8-e54f-49d8-a8ef-3acd9b155199','11111111-1111-1111-1111-000000000004','waitlist',  2,    NULL,                         now() - interval '3 days')
  RETURNING id, status
)
INSERT INTO public.tickets (rsvp_id, code)
SELECT id, encode(gen_random_bytes(16),'hex') FROM ins WHERE status = 'confirmed';

-- 6) OPSEC Workshop — capacity 20 → 8 confirmed
WITH ins AS (
  INSERT INTO public.rsvps (event_id, user_id, status, confirmed_at, created_at)
  SELECT
    '0ab7e051-ae93-4d52-a995-eed23a405536',
    u,
    'confirmed',
    now() - (interval '1 day' * (8 - rn)),
    now() - (interval '1 day' * (8 - rn))
  FROM (
    SELECT user_id::uuid AS u, ROW_NUMBER() OVER () AS rn FROM (VALUES
      ('11111111-1111-1111-1111-000000000001'),
      ('11111111-1111-1111-1111-000000000002'),
      ('11111111-1111-1111-1111-000000000005'),
      ('11111111-1111-1111-1111-000000000006'),
      ('11111111-1111-1111-1111-000000000007'),
      ('11111111-1111-1111-1111-000000000008'),
      ('11111111-1111-1111-1111-00000000000a'),
      ('11111111-1111-1111-1111-00000000000c')
    ) AS t(user_id)
  ) src
  RETURNING id
)
INSERT INTO public.tickets (rsvp_id, code)
SELECT id, encode(gen_random_bytes(16),'hex') FROM ins;

-- 7) Internal CTF — capacity 15 → 3 confirmed
WITH ins AS (
  INSERT INTO public.rsvps (event_id, user_id, status, confirmed_at, created_at)
  SELECT
    'a2ff5c74-6d76-46ae-a8ca-77ff76d17efa',
    u,
    'confirmed',
    now() - interval '2 days',
    now() - interval '2 days'
  FROM (VALUES
    ('11111111-1111-1111-1111-000000000004'::uuid),
    ('11111111-1111-1111-1111-000000000009'::uuid),
    ('11111111-1111-1111-1111-00000000000b'::uuid)
  ) AS t(u)
  RETURNING id
)
INSERT INTO public.tickets (rsvp_id, code)
SELECT id, encode(gen_random_bytes(16),'hex') FROM ins;

-- 8) Demoscene Spring (past) — 12 confirmed, 7 checked in (≈58%)
WITH ins AS (
  INSERT INTO public.rsvps (event_id, user_id, status, confirmed_at, created_at)
  SELECT
    'a7d236ec-c34e-41de-9e64-39a4a81e9940',
    u,
    'confirmed',
    now() - interval '40 days',
    now() - interval '40 days'
  FROM (VALUES
    ('11111111-1111-1111-1111-000000000001'::uuid),
    ('11111111-1111-1111-1111-000000000002'::uuid),
    ('11111111-1111-1111-1111-000000000003'::uuid),
    ('11111111-1111-1111-1111-000000000004'::uuid),
    ('11111111-1111-1111-1111-000000000005'::uuid),
    ('11111111-1111-1111-1111-000000000006'::uuid),
    ('11111111-1111-1111-1111-000000000007'::uuid),
    ('11111111-1111-1111-1111-000000000008'::uuid),
    ('11111111-1111-1111-1111-000000000009'::uuid),
    ('11111111-1111-1111-1111-00000000000a'::uuid),
    ('11111111-1111-1111-1111-00000000000b'::uuid),
    ('11111111-1111-1111-1111-00000000000c'::uuid)
  ) AS t(u)
  RETURNING id, user_id
),
tix AS (
  INSERT INTO public.tickets (rsvp_id, code, checked_in_at, checked_in_by)
  SELECT
    ins.id,
    encode(gen_random_bytes(16),'hex'),
    CASE WHEN rn <= 7 THEN (timestamp '2026-04-04 10:45:00+00') + (rn * interval '4 minutes') ELSE NULL END,
    CASE WHEN rn <= 7 THEN '2aeff2b3-db72-4969-9ed8-c145c9edcb63'::uuid ELSE NULL END
  FROM (
    SELECT id, user_id, ROW_NUMBER() OVER (ORDER BY user_id) AS rn FROM ins
  ) ins
  RETURNING 1
)
SELECT 1;

-- 9) Feedback for Demoscene (3 entries)
INSERT INTO public.feedbacks (event_id, user_id, rating, comment, created_at)
VALUES
  ('a7d236ec-c34e-41de-9e64-39a4a81e9940','11111111-1111-1111-1111-000000000004', 5, 'sick demos. shaders made my GPU cry. bring back the C64 corner next time.', now() - interval '38 days'),
  ('a7d236ec-c34e-41de-9e64-39a4a81e9940','11111111-1111-1111-1111-000000000007', 4, 'great vibes, slightly cramped near the projector. solid lineup overall.', now() - interval '37 days'),
  ('a7d236ec-c34e-41de-9e64-39a4a81e9940','11111111-1111-1111-1111-00000000000a', 5, '64k intros are still magic in 2026. 10/10 would scene again.', now() - interval '36 days')
ON CONFLICT (event_id, user_id) DO NOTHING;

-- 10) Gallery photos for Demoscene (3 approved)
INSERT INTO public.gallery_photos (event_id, uploader_id, url, status, approved_by, approved_at, created_at)
VALUES
  ('a7d236ec-c34e-41de-9e64-39a4a81e9940','11111111-1111-1111-1111-000000000004','https://picsum.photos/seed/demoscene1/1200/800','approved','2aeff2b3-db72-4969-9ed8-c145c9edcb63', now() - interval '37 days', now() - interval '38 days'),
  ('a7d236ec-c34e-41de-9e64-39a4a81e9940','11111111-1111-1111-1111-000000000007','https://picsum.photos/seed/demoscene2/1200/800','approved','2aeff2b3-db72-4969-9ed8-c145c9edcb63', now() - interval '37 days', now() - interval '38 days'),
  ('a7d236ec-c34e-41de-9e64-39a4a81e9940','11111111-1111-1111-1111-00000000000a','https://picsum.photos/seed/demoscene3/1200/800','approved','2aeff2b3-db72-4969-9ed8-c145c9edcb63', now() - interval '36 days', now() - interval '37 days');