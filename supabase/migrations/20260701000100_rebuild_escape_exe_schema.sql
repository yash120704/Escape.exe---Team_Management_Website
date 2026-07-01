-- Escape.EXE team-management schema rebuilt from the application code.
-- Paste this whole file into the Supabase SQL editor for a fresh project, or
-- run it with the Supabase CLI.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS public.admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username citext NOT NULL UNIQUE,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email citext NOT NULL UNIQUE,
  username citext UNIQUE,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_vitstudent_email_check
    CHECK (lower(email::text) LIKE '%@vitstudent.ac.in')
);

CREATE TABLE IF NOT EXISTS public.event_registration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL DEFAULT 'escape-exe-ii',
  user_email citext NOT NULL,
  reg_no text NOT NULL,
  event_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_registration_event_key_check CHECK (length(trim(event_key)) > 0),
  CONSTRAINT event_registration_reg_no_check CHECK (length(trim(reg_no)) > 0),
  CONSTRAINT event_registration_vitstudent_email_check
    CHECK (lower(user_email::text) LIKE '%@vitstudent.ac.in'),
  CONSTRAINT event_registration_reg_no_key UNIQUE (reg_no),
  CONSTRAINT event_registration_event_email_key UNIQUE (event_key, user_email),
  CONSTRAINT event_registration_event_reg_no_key UNIQUE (event_key, reg_no)
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  leader_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer NOT NULL DEFAULT 0,
  event text NOT NULL DEFAULT 'escape-exe-ii',
  event_date date NOT NULL,
  slot_time time without time zone,
  slot_end time without time zone GENERATED ALWAYS AS (
    CASE
      WHEN slot_time IS NULL THEN NULL
      ELSE (slot_time + interval '30 minutes')::time
    END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT teams_event_check CHECK (length(trim(event)) > 0),
  CONSTRAINT teams_members_is_array_check CHECK (jsonb_typeof(members) = 'array'),
  CONSTRAINT teams_max_four_members_check CHECK (jsonb_array_length(members) <= 4),
  CONSTRAINT teams_slot_half_hour_check CHECK (
    slot_time IS NULL OR (
      extract(second FROM slot_time) = 0
      AND extract(minute FROM slot_time) IN (0, 30)
    )
  )
);

CREATE TABLE IF NOT EXISTS public.random_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_email citext NOT NULL,
  event text NOT NULL DEFAULT 'escape-exe-ii',
  event_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT random_pool_vitstudent_email_check
    CHECK (lower(user_email::text) LIKE '%@vitstudent.ac.in'),
  CONSTRAINT random_pool_user_event_key UNIQUE (user_id, event)
);

CREATE TABLE IF NOT EXISTS public.join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_email citext NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_requests_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  CONSTRAINT join_requests_vitstudent_email_check
    CHECK (lower(user_email::text) LIKE '%@vitstudent.ac.in')
);

CREATE UNIQUE INDEX IF NOT EXISTS join_requests_one_pending_per_team_user
  ON public.join_requests (team_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_event_registration_event_date
  ON public.event_registration (event_key, event_date);

CREATE INDEX IF NOT EXISTS idx_teams_event_date_slot
  ON public.teams (event, event_date, slot_time);

CREATE INDEX IF NOT EXISTS idx_random_pool_event_date
  ON public.random_pool (event, event_date);

-- Folded in from add_team_constraints.sql, schema-qualified and tightened.
CREATE OR REPLACE FUNCTION public.extract_member_ids(members_jsonb jsonb)
RETURNS text[] AS $$
BEGIN
  IF members_jsonb IS NULL OR jsonb_typeof(members_jsonb) != 'array' THEN
    RETURN ARRAY[]::text[];
  END IF;

  RETURN ARRAY(
    SELECT jsonb_array_elements(members_jsonb)->>'id'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.check_duplicate_members()
RETURNS trigger AS $$
DECLARE
  member_ids text[];
  conflicting_team_id uuid;
  conflicting_team_name text;
BEGIN
  member_ids := public.extract_member_ids(NEW.members);

  IF array_length(member_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.id, t.name
    INTO conflicting_team_id, conflicting_team_name
  FROM public.teams t
  WHERE t.id <> NEW.id
    AND t.members IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(t.members) AS member
      WHERE member->>'id' = ANY(member_ids)
    )
  LIMIT 1;

  IF conflicting_team_id IS NOT NULL THEN
    RAISE EXCEPTION 'Member(s) already exist in team "%" (ID: %). Each member can only be in one team.',
      conflicting_team_name, conflicting_team_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_duplicate_members_trigger ON public.teams;
CREATE TRIGGER check_duplicate_members_trigger
  BEFORE INSERT OR UPDATE OF members ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.check_duplicate_members();

CREATE INDEX IF NOT EXISTS idx_teams_member_ids
  ON public.teams USING gin (public.extract_member_ids(members));

CREATE OR REPLACE FUNCTION public.find_teams_with_member(member_id text)
RETURNS TABLE(team_id uuid, team_name text, member_data jsonb) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS team_id,
    t.name AS team_name,
    member.value AS member_data
  FROM public.teams t,
       jsonb_array_elements(t.members) AS member
  WHERE member->>'id' = member_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.move_member_to_team(
  member_id text,
  from_team_id uuid,
  to_team_id uuid
)
RETURNS boolean AS $$
DECLARE
  member_data jsonb;
  from_team_members jsonb;
  to_team_members jsonb;
  updated_from_members jsonb;
  updated_to_members jsonb;
BEGIN
  SELECT member.value
    INTO member_data
  FROM public.teams t,
       jsonb_array_elements(t.members) AS member
  WHERE t.id = from_team_id
    AND member->>'id' = member_id;

  IF member_data IS NULL THEN
    RAISE EXCEPTION 'Member % not found in team %', member_id, from_team_id;
  END IF;

  SELECT members INTO from_team_members FROM public.teams WHERE id = from_team_id;
  SELECT members INTO to_team_members FROM public.teams WHERE id = to_team_id;

  updated_from_members := COALESCE((
    SELECT jsonb_agg(member)
    FROM jsonb_array_elements(from_team_members) AS member
    WHERE member->>'id' != member_id
  ), '[]'::jsonb);

  updated_to_members := COALESCE(to_team_members, '[]'::jsonb) || jsonb_build_array(member_data);

  UPDATE public.teams SET members = updated_from_members WHERE id = from_team_id;
  UPDATE public.teams SET members = updated_to_members WHERE id = to_team_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW public.team_members_view
WITH (security_invoker = true) AS
SELECT
  t.id AS team_id,
  t.name AS team_name,
  t.event,
  t.event_date,
  t.slot_time,
  t.slot_end,
  member.value->>'id' AS member_id,
  member.value->>'name' AS member_name,
  member.value->>'email' AS member_email
FROM public.teams t,
     jsonb_array_elements(t.members) AS member
WHERE t.members IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_no_duplicate_members_in_team()
RETURNS trigger AS $$
DECLARE
  member_count integer;
  unique_count integer;
BEGIN
  member_count := jsonb_array_length(NEW.members);

  SELECT count(DISTINCT member->>'id')
    INTO unique_count
  FROM jsonb_array_elements(NEW.members) AS member;

  IF member_count != unique_count THEN
    RAISE EXCEPTION 'Team cannot have duplicate members. Found % total members but only % unique IDs.',
      member_count, unique_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_no_duplicate_members_in_team_trigger ON public.teams;
CREATE TRIGGER check_no_duplicate_members_in_team_trigger
  BEFORE INSERT OR UPDATE OF members ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.check_no_duplicate_members_in_team();

CREATE OR REPLACE FUNCTION public.check_team_leader_is_member()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.members) AS member
    WHERE member->>'id' = NEW.leader_id::text
  ) THEN
    RAISE EXCEPTION 'Team leader must be present in members.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_team_leader_is_member_trigger ON public.teams;
CREATE TRIGGER check_team_leader_is_member_trigger
  BEFORE INSERT OR UPDATE OF leader_id, members ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.check_team_leader_is_member();

CREATE OR REPLACE FUNCTION public.enforce_max_teams_per_slot()
RETURNS trigger AS $$
BEGIN
  IF NEW.event_date IS NULL OR NEW.slot_time IS NULL THEN
    RETURN NEW;
  END IF;

  IF (
    SELECT count(*)
    FROM public.teams t
    WHERE t.id <> NEW.id
      AND t.event = NEW.event
      AND t.event_date = NEW.event_date
      AND t.slot_time = NEW.slot_time
  ) >= 2 THEN
    RAISE EXCEPTION 'This time slot already has 2 teams. Choose another slot.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_max_teams_per_slot ON public.teams;
CREATE TRIGGER trg_max_teams_per_slot
  BEFORE INSERT OR UPDATE OF event, event_date, slot_time ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_teams_per_slot();

CREATE OR REPLACE FUNCTION public.enforce_vitstudent_auth_email()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS NOT NULL AND lower(NEW.email) NOT LIKE '%@vitstudent.ac.in' THEN
    RAISE EXCEPTION 'Only @vitstudent.ac.in accounts are allowed to sign in.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_vitstudent_auth_email ON auth.users;
CREATE TRIGGER trg_enforce_vitstudent_auth_email
  BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vitstudent_auth_email();

ALTER TABLE public.admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.random_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read admin metadata" ON public.admin;
DROP POLICY IF EXISTS "authenticated can read users" ON public.users;
DROP POLICY IF EXISTS "authenticated can read registrations" ON public.event_registration;
DROP POLICY IF EXISTS "authenticated can read teams" ON public.teams;
DROP POLICY IF EXISTS "authenticated can read random pool" ON public.random_pool;
DROP POLICY IF EXISTS "authenticated can read join requests" ON public.join_requests;

CREATE POLICY "authenticated can read admin metadata"
  ON public.admin FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read users"
  ON public.users FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read registrations"
  ON public.event_registration FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read teams"
  ON public.teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read random pool"
  ON public.random_pool FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read join requests"
  ON public.join_requests FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE public.admin FROM anon, authenticated;
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.event_registration FROM anon, authenticated;
REVOKE ALL ON TABLE public.teams FROM anon, authenticated;
REVOKE ALL ON TABLE public.random_pool FROM anon, authenticated;
REVOKE ALL ON TABLE public.join_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.team_members_view FROM anon, authenticated;

GRANT SELECT (id, username, created_at) ON public.admin TO authenticated;
GRANT SELECT (id, name, email, username, created_at) ON public.users TO authenticated;
GRANT SELECT ON public.event_registration TO authenticated;
GRANT SELECT ON public.teams TO authenticated;
GRANT SELECT ON public.random_pool TO authenticated;
GRANT SELECT ON public.join_requests TO authenticated;
GRANT SELECT ON public.team_members_view TO authenticated;

GRANT ALL ON TABLE public.admin TO service_role;
GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.event_registration TO service_role;
GRANT ALL ON TABLE public.teams TO service_role;
GRANT ALL ON TABLE public.random_pool TO service_role;
GRANT ALL ON TABLE public.join_requests TO service_role;
GRANT SELECT ON public.team_members_view TO service_role;

COMMIT;
