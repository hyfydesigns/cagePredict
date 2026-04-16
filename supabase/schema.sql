-- ============================================================
-- CagePredict — Full Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- profiles (extends auth.users via trigger)
create table public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  username        text unique not null,
  display_name    text,
  avatar_url      text,
  avatar_emoji    text not null default '🥊',
  bio             text,
  total_points    integer not null default 0,
  total_picks     integer not null default 0,
  correct_picks   integer not null default 0,
  current_streak  integer not null default 0,
  longest_streak  integer not null default 0,
  favorite_fighter text,
  onboarding_complete boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- fighters
create table public.fighters (
  id                 uuid default uuid_generate_v4() primary key,
  name               text not null,
  nickname           text,
  image_url          text,
  nationality        text,
  flag_emoji         text,
  record             text not null default '0-0-0',
  wins               integer not null default 0,
  losses             integer not null default 0,
  draws              integer not null default 0,
  height_cm          integer,
  reach_cm           integer,
  weight_class       text not null,
  age                integer,
  striking_accuracy  numeric(5,2),   -- e.g. 58.40
  td_avg             numeric(5,2),   -- takedowns per 15 min
  sub_avg            numeric(5,2),   -- submission attempts per 15 min
  sig_str_landed     numeric(5,2),   -- significant strikes landed per min
  analysis           text,           -- General fighter bio / AI analysis
  created_at         timestamptz not null default now()
);

-- events
create table public.events (
  id         uuid default uuid_generate_v4() primary key,
  name       text not null,
  date       timestamptz not null,
  location   text,
  venue      text,
  image_url  text,
  status     text not null default 'upcoming'
               check (status in ('upcoming','live','completed')),
  created_at timestamptz not null default now()
);

-- fights
create table public.fights (
  id               uuid default uuid_generate_v4() primary key,
  event_id         uuid references public.events(id) on delete cascade not null,
  fighter1_id      uuid references public.fighters(id) not null,
  fighter2_id      uuid references public.fighters(id) not null,
  fight_time       timestamptz not null,
  status           text not null default 'upcoming'
                     check (status in ('upcoming','live','completed','cancelled')),
  winner_id        uuid references public.fighters(id),
  method           text,           -- 'KO/TKO' | 'Submission' | 'Decision' | 'Draw'
  round            integer,
  time_of_finish   text,           -- e.g. '4:32'
  odds_f1          integer not null, -- American odds e.g. -150
  odds_f2          integer not null, -- American odds e.g. +130
  analysis_f1      text,
  analysis_f2      text,
  is_main_event    boolean not null default false,
  is_title_fight   boolean not null default false,
  weight_class     text,
  display_order    integer not null default 0,
  created_at       timestamptz not null default now()
);

-- predictions
create table public.predictions (
  id                   uuid default uuid_generate_v4() primary key,
  user_id              uuid references auth.users(id) on delete cascade not null,
  fight_id             uuid references public.fights(id) on delete cascade not null,
  predicted_winner_id  uuid references public.fighters(id) not null,
  is_correct           boolean,
  points_earned        integer not null default 0,
  confidence           integer not null default 50
                         check (confidence >= 0 and confidence <= 100),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique(user_id, fight_id)
);

-- friends
create table public.friends (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  friend_id  uuid references auth.users(id) on delete cascade not null,
  status     text not null default 'pending'
               check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique(user_id, friend_id)
);

-- crews (private leagues)
create table public.crews (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null,
  description text,
  owner_id    uuid references auth.users(id) on delete cascade not null,
  invite_code text unique not null
                default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  max_members integer not null default 50,
  image_url   text,
  created_at  timestamptz not null default now()
);

-- crew_members
create table public.crew_members (
  id        uuid default uuid_generate_v4() primary key,
  crew_id   uuid references public.crews(id) on delete cascade not null,
  user_id   uuid references auth.users(id) on delete cascade not null,
  joined_at timestamptz not null default now(),
  unique(crew_id, user_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_fights_event_id       on public.fights(event_id);
create index idx_fights_status         on public.fights(status);
create index idx_predictions_user_id   on public.predictions(user_id);
create index idx_predictions_fight_id  on public.predictions(fight_id);
create index idx_friends_user_id       on public.friends(user_id);
create index idx_friends_friend_id     on public.friends(friend_id);
create index idx_crew_members_crew_id  on public.crew_members(crew_id);
create index idx_crew_members_user_id  on public.crew_members(user_id);
create index idx_profiles_points       on public.profiles(total_points desc);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url, onboarding_complete)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
    ),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

create trigger update_predictions_updated_at
  before update on public.predictions
  for each row execute procedure public.update_updated_at_column();

-- Mark fight completed and score all predictions
-- Points:
--   Base correct pick  = 10 pts
--   Confidence (lock)  = 20 pts  (double base)
--   Streak bonus (added on top of base/confidence):
--     3–4 streak  →  +5 pts
--     5–9 streak  → +10 pts
--     10+ streak  → +20 pts
create or replace function public.complete_fight(
  p_fight_id   uuid,
  p_winner_id  uuid,
  p_method     text default null,
  p_round      integer default null,
  p_time       text default null
)
returns void as $$
declare
  v_pred         record;
  v_user_streak  integer;
  v_new_streak   integer;
  v_base_pts     integer;
  v_streak_bonus integer;
  v_total_pts    integer;
begin
  -- Update fight record
  update public.fights
  set
    status         = 'completed',
    winner_id      = p_winner_id,
    method         = p_method,
    round          = p_round,
    time_of_finish = p_time
  where id = p_fight_id;

  -- Score each prediction
  for v_pred in
    select p.*, pr.current_streak as user_streak
    from   public.predictions p
    join   public.profiles    pr on pr.id = p.user_id
    where  p.fight_id = p_fight_id
  loop
    if v_pred.predicted_winner_id = p_winner_id then
      -- Base: 10 pts; double for confidence/lock picks
      v_base_pts    := case when v_pred.is_confidence then 20 else 10 end;
      v_new_streak  := v_pred.user_streak + 1;

      -- Streak bonus tier
      v_streak_bonus := case
        when v_new_streak >= 10 then 20
        when v_new_streak >=  5 then 10
        when v_new_streak >=  3 then  5
        else 0
      end;

      v_total_pts := v_base_pts + v_streak_bonus;

      update public.predictions
        set is_correct    = true,
            points_earned = v_total_pts
        where id = v_pred.id;

      update public.profiles
        set
          total_points   = total_points   + v_total_pts,
          correct_picks  = correct_picks  + 1,
          total_picks    = total_picks    + 1,
          current_streak = v_new_streak,
          longest_streak = greatest(longest_streak, v_new_streak)
        where id = v_pred.user_id;
    else
      update public.predictions
        set is_correct    = false,
            points_earned = 0
        where id = v_pred.id;

      update public.profiles
        set
          total_picks    = total_picks + 1,
          current_streak = 0
        where id = v_pred.user_id;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles     enable row level security;
alter table public.fighters     enable row level security;
alter table public.events       enable row level security;
alter table public.fights       enable row level security;
alter table public.predictions  enable row level security;
alter table public.friends      enable row level security;
alter table public.crews        enable row level security;
alter table public.crew_members enable row level security;

-- PROFILES
create policy "profiles_select_all"    on public.profiles for select using (true);
create policy "profiles_insert_own"    on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"    on public.profiles for update using (auth.uid() = id);

-- FIGHTERS (public read, admin write — set role in user metadata)
create policy "fighters_select_all"    on public.fighters for select using (true);
create policy "fighters_admin_write"   on public.fighters for all
  using (auth.jwt() ->> 'role' = 'admin' or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- EVENTS (public read, admin write)
create policy "events_select_all"      on public.events for select using (true);
create policy "events_admin_write"     on public.events for all
  using (auth.jwt() ->> 'role' = 'admin' or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- FIGHTS (public read, admin write)
create policy "fights_select_all"      on public.fights for select using (true);
create policy "fights_admin_write"     on public.fights for all
  using (auth.jwt() ->> 'role' = 'admin' or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- PREDICTIONS
create policy "predictions_select_all" on public.predictions for select using (true);
create policy "predictions_insert_own" on public.predictions for insert with check (auth.uid() = user_id);
create policy "predictions_update_own" on public.predictions for update using (auth.uid() = user_id);
create policy "predictions_delete_own" on public.predictions for delete using (auth.uid() = user_id);

-- FRIENDS
create policy "friends_select_own"     on public.friends for select
  using (auth.uid() = user_id or auth.uid() = friend_id);
create policy "friends_insert_own"     on public.friends for insert with check (auth.uid() = user_id);
create policy "friends_update_party"   on public.friends for update
  using (auth.uid() = user_id or auth.uid() = friend_id);
create policy "friends_delete_own"     on public.friends for delete using (auth.uid() = user_id);

-- CREWS
create policy "crews_select_all"       on public.crews for select using (true);
create policy "crews_insert_auth"      on public.crews for insert with check (auth.uid() = owner_id);
create policy "crews_update_owner"     on public.crews for update using (auth.uid() = owner_id);
create policy "crews_delete_owner"     on public.crews for delete using (auth.uid() = owner_id);

-- CREW MEMBERS
create policy "crew_members_select_all"  on public.crew_members for select using (true);
create policy "crew_members_insert_own"  on public.crew_members for insert with check (auth.uid() = user_id);
create policy "crew_members_delete_own"  on public.crew_members for delete
  using (
    auth.uid() = user_id
    or auth.uid() = (select owner_id from public.crews where id = crew_id)
  );

-- Enable Realtime for live leaderboard updates
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.predictions;
