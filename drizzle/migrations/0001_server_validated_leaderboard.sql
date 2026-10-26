REVOKE INSERT ON public.leaderboard_entries FROM PUBLIC, anon, authenticated;

CREATE TABLE public.leaderboard_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'failed', 'completed', 'submitted', 'abandoned', 'expired')),
  level_id integer NOT NULL DEFAULT 1 CHECK (level_id BETWEEN 1 AND 5),
  challenge_index integer NOT NULL DEFAULT 0 CHECK (challenge_index >= 0),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 20000),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  attempts_count integer NOT NULL DEFAULT 0 CHECK (attempts_count >= correct_count),
  last_attempt_correct boolean,
  streak integer NOT NULL DEFAULT 0 CHECK (streak >= 0),
  health integer NOT NULL DEFAULT 5 CHECK (health BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  started_at timestamptz NOT NULL DEFAULT now(),
  challenge_started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  level_started boolean NOT NULL DEFAULT false,
  leaderboard_entry_id uuid REFERENCES public.leaderboard_entries(id)
);

CREATE INDEX leaderboard_runs_user_status_idx
  ON public.leaderboard_runs (user_id, status);
CREATE UNIQUE INDEX leaderboard_runs_one_active_per_user_idx
  ON public.leaderboard_runs (user_id) WHERE status = 'active';

ALTER TABLE public.leaderboard_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leaderboard_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.leaderboard_runs TO service_role;

CREATE OR REPLACE FUNCTION public.validate_leaderboard_run_start() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leaderboard_runs
    WHERE user_id = NEW.user_id AND created_at > now() - interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'too many leaderboard run starts';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_leaderboard_run_start
  BEFORE INSERT ON public.leaderboard_runs
  FOR EACH ROW EXECUTE FUNCTION public.validate_leaderboard_run_start();

CREATE OR REPLACE FUNCTION public.submit_verified_leaderboard_run(
  p_run_id uuid,
  p_user_id uuid
) RETURNS public.leaderboard_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.leaderboard_runs%ROWTYPE;
  v_entry public.leaderboard_entries%ROWTYPE;
  v_codename text;
  v_elapsed integer;
BEGIN
  SELECT * INTO v_run
  FROM public.leaderboard_runs
  WHERE id = p_run_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'leaderboard run not found';
  END IF;

  IF v_run.status = 'submitted' AND v_run.leaderboard_entry_id IS NOT NULL THEN
    SELECT * INTO v_entry
    FROM public.leaderboard_entries
    WHERE id = v_run.leaderboard_entry_id;
    RETURN v_entry;
  END IF;

  IF v_run.expires_at <= now() THEN
    UPDATE public.leaderboard_runs SET status = 'expired' WHERE id = p_run_id;
    RETURN NULL;
  END IF;

  IF v_run.status <> 'completed' THEN
    RAISE EXCEPTION 'leaderboard run is not complete';
  END IF;

  v_elapsed := floor(extract(epoch FROM (v_run.finished_at - v_run.started_at)))::integer;
  IF v_elapsed < 60 OR v_elapsed > 86400 THEN
    RAISE EXCEPTION 'leaderboard run time out of range';
  END IF;

  SELECT upper(left(trim(codename), 18)) INTO v_codename
  FROM public.profiles
  WHERE id = p_user_id;
  IF coalesce(v_codename, '') = '' THEN
    v_codename := 'AGENT';
  END IF;

  INSERT INTO public.leaderboard_entries (
    user_id, codename, score, time_seconds, accuracy
  ) VALUES (
    p_user_id,
    v_codename,
    v_run.score,
    v_elapsed,
    round((v_run.correct_count::numeric / greatest(v_run.attempts_count, 1)) * 100)::integer
  ) RETURNING * INTO v_entry;

  UPDATE public.leaderboard_runs
  SET status = 'submitted', leaderboard_entry_id = v_entry.id
  WHERE id = p_run_id;

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_verified_leaderboard_run(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verified_leaderboard_run(uuid, uuid) TO service_role;
