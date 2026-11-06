-- Initial Cyber Escape application schema.
-- Kept in Supabase's migration directory so GitHub integration can deploy it.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  codename text NOT NULL DEFAULT 'AGENT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, codename)
  VALUES (NEW.id, upper(left(coalesce(NEW.raw_user_meta_data->>'codename', split_part(NEW.email,'@',1), 'AGENT'), 18)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.cloud_saves (
  user_id uuid PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_saves TO authenticated;
GRANT ALL ON public.cloud_saves TO service_role;
ALTER TABLE public.cloud_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own save all" ON public.cloud_saves FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  codename text NOT NULL,
  score integer NOT NULL,
  time_seconds integer NOT NULL,
  accuracy integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leaderboard_score_idx ON public.leaderboard_entries (score DESC);
GRANT SELECT ON public.leaderboard_entries TO anon, authenticated;
GRANT INSERT ON public.leaderboard_entries TO authenticated;
GRANT ALL ON public.leaderboard_entries TO service_role;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read board" ON public.leaderboard_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "own insert board" ON public.leaderboard_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validate_leaderboard_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.codename := upper(left(trim(NEW.codename), 18));
  IF NEW.codename = '' THEN RAISE EXCEPTION 'codename required'; END IF;
  IF NEW.score < 0 OR NEW.score > 20000 THEN RAISE EXCEPTION 'score out of range'; END IF;
  IF NEW.time_seconds < 60 OR NEW.time_seconds > 86400 THEN RAISE EXCEPTION 'time out of range'; END IF;
  IF NEW.accuracy < 0 OR NEW.accuracy > 100 THEN RAISE EXCEPTION 'accuracy out of range'; END IF;
  IF EXISTS (SELECT 1 FROM public.leaderboard_entries WHERE user_id = NEW.user_id AND created_at > now() - interval '1 minute') THEN
    RAISE EXCEPTION 'too many submissions';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER validate_leaderboard
  BEFORE INSERT ON public.leaderboard_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_leaderboard_entry();
