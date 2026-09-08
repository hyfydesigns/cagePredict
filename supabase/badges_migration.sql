-- ============================================================
-- CagePredict — Achievements / Badges
-- Run once in the Supabase SQL Editor
-- Safe to re-run (idempotent throughout)
-- ============================================================

-- ── 1. Tables ────────────────────────────────────────────────

create table if not exists public.badge_definitions (
  id          text primary key,
  name        text        not null,
  description text        not null,
  icon        text        not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_badges (
  id               uuid        default uuid_generate_v4() primary key,
  user_id          uuid        references auth.users(id) on delete cascade not null,
  badge_id         text        references public.badge_definitions(id) not null,
  awarded_at       timestamptz not null default now(),
  context_fight_id uuid        references public.fights(id) on delete set null,
  context_event_id uuid        references public.events(id) on delete set null,
  unique(user_id, badge_id)
);

-- ── 2. RLS ───────────────────────────────────────────────────

alter table public.badge_definitions enable row level security;
alter table public.user_badges        enable row level security;

-- drop before recreate to keep idempotent
drop policy if exists "badge_defs_select_all" on public.badge_definitions;
drop policy if exists "user_badges_select_all" on public.user_badges;

create policy "badge_defs_select_all"  on public.badge_definitions for select using (true);
create policy "user_badges_select_all" on public.user_badges        for select using (true);

-- ── 3. Badge definitions ─────────────────────────────────────

insert into public.badge_definitions (id, name, description, icon) values
  ('first_pick',       'First Blood',     'Made your first prediction',                   '🩸'),
  ('sharp_eye',        'Sharp Eye',       '10 correct picks',                             '👁️'),
  ('ten_streak',       'On Fire',         '10-fight correct streak',                      '🔥'),
  ('called_the_upset', 'Giant Killer',    'Picked an underdog winner',                    '🐐'),
  ('confidence_king',  'Confidence King', 'Won 5 Confidence (Lock) picks',                '👑'),
  ('lock_master',      'Lock Master',     'Won a Confidence Pick on the main event',      '🔐'),
  ('perfect_card',     'Perfect Card',    'Correctly called every fight in an event',     '💎')
on conflict (id) do nothing;

-- ── 4. Helper: award badge idempotently ──────────────────────

create or replace function public.award_badge(
  p_user_id        uuid,
  p_badge_id       text,
  p_fight_id       uuid default null,
  p_event_id       uuid default null
) returns void as $$
begin
  insert into public.user_badges (user_id, badge_id, context_fight_id, context_event_id)
  values (p_user_id, p_badge_id, p_fight_id, p_event_id)
  on conflict (user_id, badge_id) do nothing;
end;
$$ language plpgsql security definer;

-- ── 5. Trigger function: first_pick (on prediction INSERT) ───

create or replace function public.on_prediction_inserted()
returns trigger as $$
declare
  v_total integer;
begin
  -- Count total predictions for this user (including the new one)
  select count(*) into v_total
  from public.predictions
  where user_id = new.user_id;

  if v_total = 1 then
    perform public.award_badge(new.user_id, 'first_pick', new.fight_id, null);
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prediction_inserted on public.predictions;
create trigger trg_prediction_inserted
  after insert on public.predictions
  for each row execute function public.on_prediction_inserted();

-- ── 6. Trigger function: scoring badges (on prediction UPDATE) ──

create or replace function public.on_prediction_scored()
returns trigger as $$
declare
  v_profile         record;
  v_fight           record;
  v_conf_wins       integer;
  v_scored_count    integer;
  v_correct_count   integer;
  v_pending_count   integer;
begin
  -- Only fire when is_correct transitions from NULL → a value
  if old.is_correct is not null or new.is_correct is null then
    return new;
  end if;

  -- Load profile stats (already updated by complete_fight before this trigger fires)
  select * into v_profile from public.profiles where id = new.user_id;

  -- Load fight + event id
  select f.*, f.event_id as ev_id
  into v_fight
  from public.fights f
  where f.id = new.fight_id;

  if v_profile is null or v_fight is null then return new; end if;

  -- ── sharp_eye: 10+ correct picks ──────────────────────────
  if v_profile.correct_picks >= 10 then
    perform public.award_badge(new.user_id, 'sharp_eye', new.fight_id, v_fight.event_id);
  end if;

  -- ── ten_streak: current streak hit 10 ─────────────────────
  if v_profile.current_streak >= 10 then
    perform public.award_badge(new.user_id, 'ten_streak', new.fight_id, v_fight.event_id);
  end if;

  -- Remaining badges only apply when the pick was correct
  if new.is_correct = true then

    -- ── called_the_upset: picked positive-odds fighter ───────
    if (new.predicted_winner_id = v_fight.fighter1_id and v_fight.odds_f1 > 0) or
       (new.predicted_winner_id = v_fight.fighter2_id and v_fight.odds_f2 > 0) then
      perform public.award_badge(new.user_id, 'called_the_upset', new.fight_id, v_fight.event_id);
    end if;

    -- ── confidence_king / lock_master (confidence picks) ─────
    if new.is_confidence = true then

      -- confidence_king: 5+ winning confidence picks total
      select count(*) into v_conf_wins
      from public.predictions
      where user_id = new.user_id
        and is_confidence = true
        and is_correct = true;

      if v_conf_wins >= 5 then
        perform public.award_badge(new.user_id, 'confidence_king', new.fight_id, v_fight.event_id);
      end if;

      -- lock_master: winning confidence pick on the main event
      if v_fight.is_main_event = true then
        perform public.award_badge(new.user_id, 'lock_master', new.fight_id, v_fight.event_id);
      end if;

    end if;

    -- ── perfect_card: all non-cancelled fights in event scored,
    --    and this user got every single one correct ───────────
    select
      count(*) filter (where f.status in ('completed','cancelled')),
      count(*) filter (where f.status = 'completed' and p.is_correct = true),
      count(*) filter (where f.status not in ('completed','cancelled'))
    into v_scored_count, v_correct_count, v_pending_count
    from public.fights f
    left join public.predictions p
           on p.fight_id = f.id and p.user_id = new.user_id
    where f.event_id = v_fight.event_id;

    -- All fights done, user predicted every completed fight correctly, none still pending
    if v_pending_count = 0
       and v_scored_count > 0
       and v_correct_count = (
         select count(*) from public.fights
         where event_id = v_fight.event_id and status = 'completed'
       )
    then
      perform public.award_badge(new.user_id, 'perfect_card', new.fight_id, v_fight.event_id);
    end if;

  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prediction_scored on public.predictions;
create trigger trg_prediction_scored
  after update of is_correct on public.predictions
  for each row execute function public.on_prediction_scored();

-- ── 7. Back-fill: award badges to existing users ─────────────
-- Run this block once after creating the triggers so users who
-- already have history get their earned badges.

do $$
declare
  rec record;
begin

  -- first_pick: any user who has at least one prediction
  for rec in
    select distinct user_id from public.predictions
  loop
    perform public.award_badge(rec.user_id, 'first_pick', null, null);
  end loop;

  -- sharp_eye: correct_picks >= 10
  for rec in
    select id from public.profiles where correct_picks >= 10
  loop
    perform public.award_badge(rec.id, 'sharp_eye', null, null);
  end loop;

  -- ten_streak: longest_streak >= 10
  for rec in
    select id from public.profiles where longest_streak >= 10
  loop
    perform public.award_badge(rec.id, 'ten_streak', null, null);
  end loop;

  -- called_the_upset: ever picked a positive-odds winner
  for rec in
    select distinct p.user_id
    from public.predictions p
    join public.fights f on f.id = p.fight_id
    where p.is_correct = true
      and (
        (p.predicted_winner_id = f.fighter1_id and f.odds_f1 > 0) or
        (p.predicted_winner_id = f.fighter2_id and f.odds_f2 > 0)
      )
  loop
    perform public.award_badge(rec.user_id, 'called_the_upset', null, null);
  end loop;

  -- confidence_king: 5+ winning confidence picks
  for rec in
    select user_id
    from public.predictions
    where is_confidence = true and is_correct = true
    group by user_id
    having count(*) >= 5
  loop
    perform public.award_badge(rec.user_id, 'confidence_king', null, null);
  end loop;

  -- lock_master: won a confidence pick on a main event
  for rec in
    select distinct p.user_id
    from public.predictions p
    join public.fights f on f.id = p.fight_id
    where p.is_confidence = true
      and p.is_correct = true
      and f.is_main_event = true
  loop
    perform public.award_badge(rec.user_id, 'lock_master', null, null);
  end loop;

  -- perfect_card: per user per event — all completed fights correct, none pending
  for rec in
    select p.user_id, f.event_id
    from public.predictions p
    join public.fights f on f.id = p.fight_id
    where f.status = 'completed'
    group by p.user_id, f.event_id
    having
      -- No fights still pending for this user in this event
      count(*) filter (where f.status not in ('completed','cancelled')) = 0
      -- Every completed fight was correct
      and count(*) filter (where f.status = 'completed' and p.is_correct = true)
          = (select count(*) from public.fights where event_id = f.event_id and status = 'completed')
  loop
    perform public.award_badge(rec.user_id, 'perfect_card', null, rec.event_id);
  end loop;

end $$;
