# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Next.js, port 3000)
npm run build      # Production build
npm run lint       # ESLint via next lint
npm run seed       # Seed demo fighters/events into Supabase (tsx seeds/run-seed.ts)
```

There is no test suite. Validation is done via Zod schemas in `lib/validations.ts`.

## Environment Variables

Copy `.env.example` to `.env.local`. Required for core functionality:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only — never expose to client) |
| `NEXT_PUBLIC_APP_URL` | Base URL (e.g. `http://localhost:3000`) |

Optional (features degrade gracefully if absent):

| Variable | Feature |
|---|---|
| `RAPIDAPI_KEY` + `RAPIDAPI_UFC_HOST` | Import real UFC events + auto-sync live results |
| `CRON_SECRET` | Secures all `/api/cron/*` routes (set in Vercel env vars) |
| `ANTHROPIC_API_KEY` | AI matchup analysis (Claude Haiku) on event import |
| `RESEND_API_KEY` | Transactional emails (card-live, last-chance, weekly recap) |
| `ODDS_API_KEY` | Live betting odds sync from The Odds API |
| `YOUTUBE_API_KEY` | Fighter profile YouTube highlights |

## Architecture

### Stack
- **Next.js 15** App Router, React 19, TypeScript strict mode
- **Supabase** — Postgres database + auth + RLS + realtime
- **Tailwind CSS** + Radix UI primitives (`components/ui/`)
- **Framer Motion** for animations
- **Zod** for all form/action validation
- **Resend** for email, **Anthropic SDK** for AI analysis

### Route Groups
- `app/(auth)/` — Public auth pages (login, signup, onboarding). Middleware redirects authenticated users away.
- `app/(protected)/` — Requires auth session (dashboard, crews, leaderboard, profile/edit). Middleware also enforces `/onboarding` redirect until `profiles.onboarding_complete = true`.
- `app/admin/` — Admin panel. No middleware guard — access control is enforced inside the page by checking `profiles.is_admin`.
- `app/api/` — Route handlers: `auth/callback` (OAuth + email verification), `cron/*` (scheduled jobs), `fighter-image/[id]` (proxy).

### Data Flow

All mutations go through **Next.js Server Actions** in `lib/actions/`:

| File | Responsibility |
|---|---|
| `auth.ts` | Sign up/in/out, onboarding, profile edits, `adminDeleteUser` |
| `predictions.ts` | Upsert picks, toggle confidence/lock pick |
| `crews.ts` | Create/join/leave/delete crews, friend requests, in-app crew invites |
| `admin.ts` | Seed data, import events from RapidAPI, complete fights (triggers scoring RPC) |
| `emails.ts` | Batch send via Resend (card-live, last-chance, weekly recap) |
| `odds.ts` | `syncEventOdds()` — fetch from The Odds API, store current + opening odds + history |

### Cron Jobs (`app/api/cron/`)

All routes are protected by `Authorization: Bearer $CRON_SECRET`. Scheduled via `vercel.json`:

| Route | Schedule | Purpose |
|---|---|---|
| `go-live` | every 15 min | Flips events upcoming→live (30 min before first fight) and live→completed (when all fights done) |
| `sync-results` | every 5 min | Fetches RapidAPI schedule, auto-calls `complete_fight()` RPC for finished fights |
| `sync-odds` | every hour | Pulls live American odds from The Odds API |
| `last-chance` | 14:00 UTC daily | Sends pick-reminder emails before events |
| `weekly-recap` | Mon 09:00 UTC | Sends weekly stats recap emails |

### Live Event Architecture

During a live event, fight cards update via two mechanisms:
1. **Supabase realtime** (instant) — `LiveWrapper` subscribes to `postgres_changes` on the `fights` table. When `sync-results` calls `complete_fight()`, the result appears on all clients immediately.
2. **Polling fallback** (30s when live, 60s otherwise) — catches event status transitions that realtime doesn't cover.

**Required SQL** — run once in Supabase SQL editor to enable realtime on fights:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.fights;
```

### Supabase Client Pattern

Three distinct clients — use the right one:

```ts
// In Server Components and Server Actions:
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()

// For admin operations (bypasses RLS):
import { createServiceClient } from '@/lib/supabase/server'
const service = createServiceClient()

// In Client Components:
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

**Critical:** Never use the service client in client components or expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

### Supabase FK Join Limitation

`crew_members.user_id` and other tables reference `auth.users(id)`, not `public.profiles(id)`. Supabase PostgREST cannot join across `auth.users`. **Always use separate queries + manual JS join** when you need profile data alongside rows that reference `auth.users`:

```ts
// ✅ Correct pattern
const { data: members } = await supabase.from('crew_members').select('user_id, ...')
const ids = members.map(m => m.user_id)
const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids)
// merge manually

// ❌ Will silently fail or return nulls
const { data } = await supabase.from('crew_members').select('profile:profiles(*)')
```

### Scoring System

Implemented entirely in the `complete_fight(fight_id, winner_id)` Postgres RPC (see `supabase/schema.sql`). Calling `completeFight()` in `lib/actions/admin.ts` triggers it. Points:
- Correct pick: **10 pts**
- Correct confidence/lock pick: **20 pts**
- Streak bonuses: 3–4 correct in a row +5, 5–9 +10, 10+ +20

### Prediction Locking

Picks lock **10 minutes before `fight_time`**. `isFightLocked()` in `lib/utils.ts` is the source of truth — used in `upsertPrediction()` on the server and `useCountdown()` on the client.

### Fighter Profile UUIDs

Fighters imported from RapidAPI get deterministic UUIDs: `00000000-0000-0001-0000-XXXXXXXXXXXX` where the last 12 hex digits encode the RapidAPI numeric ID. `uuidToApiId(uuid)` in `app/fighters/[id]/page.tsx` reverses this to fetch external fight history.

### Email Verification + Invite Code Chain

Crew invite codes must survive the full email verification redirect chain. The flow:
1. Signup form → `signUp()` builds `emailRedirectTo` with `?invite=CODE` via `URLSearchParams`
2. `app/api/auth/callback/route.ts` extracts `invite` from the callback URL and appends it to the `/onboarding?welcome=1&invite=CODE` redirect
3. `app/(auth)/onboarding/page.tsx` reads `invite` from `searchParams` and calls `joinCrew(inviteCode)` after `completeOnboarding()` succeeds

### Key Conventions
- **Server Components** fetch data directly via `createClient()`. Page-level `params` are typed as `Promise<{...}>` and must be `await`-ed (Next.js 15 requirement).
- **`revalidatePath()`** is called at the end of mutating server actions instead of returning redirect URLs in most cases.
- `cn()` from `lib/utils.ts` is the standard className merge utility (clsx + tailwind-merge).
- The `FightWithDetails` type in `types/database.ts` is the canonical shape passed to fight card components and carries joined fighter data, enriched pick counts (`_pickCounts`), fighter ranks (`_f1Rank`, `_f2Rank`), and H2H record (`_h2h`) as custom fields.
