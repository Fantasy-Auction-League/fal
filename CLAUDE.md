# CLAUDE.md

## Project Overview

FAL (Fantasy Auction League) is a private IPL fantasy cricket platform. Season-long squads built via auction, weekly lineup management, automated scoring from live IPL data, and strategy chips.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript
- **Database:** PostgreSQL (local) / Neon (production), Prisma ORM
- **Auth:** Auth.js v5 (credentials-based, email + password)
- **Cricket Data:** SportMonks Cricket API (v2.0)
- **Testing:** Vitest (unit/integration/e2e), Playwright (simulation)
- **Deployment:** Vercel (Hobby plan), GitHub Actions (scoring cron)

## Key Directories

```
app/                    # Next.js App Router (pages + API routes)
lib/scoring/            # Fantasy points engine (batting, bowling, fielding, multipliers, pipeline, live)
lib/sportmonks/         # SportMonks API client (fixtures, match-sync, types, utils)
lib/lineup/             # Lineup validation + lock logic
prisma/schema.prisma    # Database schema (13 tables, 7 enums)
tests/unit/             # Unit tests (scoring engine, utils)
tests/integration/      # Integration tests (DB + API)
tests/e2e/              # E2E tests (full season flow)
tests/simulation/       # Playwright browser tests
```

## Commands

```bash
npm run dev              # Start dev server (Turbopack)
npm run build            # Production build
npm test                 # Run all Vitest tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (needs DB)
npm run test:layer0      # Playwright simulation tests
npx prisma db push       # Push schema to DB
npx prisma studio        # Visual DB browser
npm run seed:players     # Seed IPL players from SportMonks
npm run seed:fixtures    # Seed IPL fixtures and gameweeks
npx tsc --noEmit         # TypeScript type check
```

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` — PostgreSQL connection string
- `DIRECT_URL` — Same as DATABASE_URL for local dev (needed by Prisma)
- `AUTH_SECRET` — Any secret string for Auth.js sessions
- `AUTH_URL` — `http://localhost:3000`
- `SPORTMONKS_API_TOKEN` — SportMonks API key
- `SPORTMONKS_SEASON_ID` — `1795` (IPL 2026)
- `SPORTMONKS_LEAGUE_ID` — `1` (IPL)
- `ADMIN_SECRET` — Bootstrap secret for first admin account
- `APP_ADMIN_EMAILS` — Comma-separated emails for /app-admin access
- `CRON_SECRET` — Bearer token for cron endpoint auth

## Database

- Local: `postgresql://YOUR_USERNAME@localhost/fal`
- Production: Neon (connection strings in Vercel env vars)
- Schema: `prisma/schema.prisma` — 13 models including User, Team, League, Player, Match, Gameweek, Lineup, PlayerPerformance, PlayerScore, GameweekScore
- Key enum: `ScoringStatus` — SCHEDULED, LIVE_SCORING, COMPLETED, SCORING, SCORED, ERROR, CANCELLED

## Scoring Pipeline

The scoring system has three modes:

1. **Live scoring** (`scoreLiveMatches`): During a match, fetches live scorecard from SportMonks every 5 min, upserts PlayerPerformance. Match stays in `LIVE_SCORING` state.

2. **Post-match scoring** (`runScoringPipeline`): After match ends, claims `COMPLETED` matches, runs `scoreMatch()` one final time with complete data, marks `SCORED`.

3. **Gameweek aggregation** (`aggregateGameweek`): When all GW matches are SCORED/ERROR/CANCELLED, computes team totals with captain multiplier, bench subs, chip effects. Writes GameweekScore and PlayerScore.

The cron flow: `syncMatchStatuses() → scoreLiveMatches() → runScoringPipeline()`

## Fantasy Points Computation

- **Batting:** 1/run + 4/four + 6/six + milestone bonuses (25/50/75/100) + SR bonus/penalty
- **Bowling:** Per wicket/maiden + economy bonus/penalty + LBW/bowled bonus
- **Fielding:** Catches, stumpings, runouts (direct/assisted)
- **Multipliers:** Captain 2x, VC 1.5x (if captain didn't play), chip effects
- Scoring code: `lib/scoring/batting.ts`, `bowling.ts`, `fielding.ts`, `multipliers.ts`

## Auth Flow

- Login via `/login` page with email + password
- Admin bootstrap: email + password + `ADMIN_SECRET`
- Regular users: email + password + invite code (from league admin)
- Session via Auth.js v5 credentials provider
- `APP_ADMIN_EMAILS` controls /app-admin access (platform-level)

## Testing Patterns

- Unit tests mock Prisma and SportMonks client via `vi.mock()`
- Integration tests use real local PostgreSQL database
- Playwright tests run against Vercel preview deployments
- Test command for Playwright: `npm run test:layer0`

## Cron Jobs

- **Vercel cron** (`vercel.json`): Daily fallback scoring at 18:30 UTC
- **GitHub Actions** (`.github/workflows/scoring-cron.yml`): Every 5 min during IPL match windows (10:00-18:59 UTC, March-May)
- Both call `GET /api/scoring/cron` with `Authorization: Bearer <CRON_SECRET>`
- Cron endpoints are excluded from session auth middleware

## Framework Conventions

- **Next.js App Router** — all pages in `app/`, API routes in `app/api/`
- **All pages are client components** — `'use client'` at top of every page
- **API routes use `Response.json()`** — not `NextResponse.json()` (except cron routes)
- **API route params are async** — `{ params }: { params: Promise<{ id: string }> }`, must `await params`
- **Auth check pattern** — every API route starts with `const session = await auth()` + 401 check
- **Prisma import** — always `import { prisma } from '@/lib/db'`
- **Path alias** — `@/` maps to project root (e.g., `@/lib/scoring/pipeline`)
- **One shared layout component** — `AppFrame` wraps all pages (bottom nav, max-width container)
- **No separate component files** — components are defined inline in page files (except `AppFrame`)
- **API error pattern** — `try/catch` wrapping entire handler, return `{ error: string }` with status code

## Code Conventions

- **TypeScript strict** — no `any` in new code, explicit types for function params/returns
- **Prisma queries** — use `select` to limit fields, `include` for relations, `upsert` for idempotent writes
- **Atomic operations** — scoring pipeline uses `UPDATE...RETURNING` raw SQL for concurrent safety
- **Error handling in loops** — per-item try/catch so one failure doesn't block others (see `scoreLiveMatches`)
- **No ORMs for complex queries** — use `prisma.$queryRawUnsafe` when Prisma's query builder can't express it

## Style Conventions

- **Inline styles only** — no Tailwind classes, no CSS modules, no styled-components
- **Mobile-first** — max-width 480px, designed for phone screens
- **IPL team colors** — each team has gradient definitions (`teamGradients` object in pages)
- **Font** — Plus Jakarta Sans (loaded via Next.js)
- **Color palette** — primary `#004BA0`, accent `#0EB1A2`, gold `#F9CD05`, dark `#1a1a2e`
- **No emojis** in code or UI unless explicitly requested
- **Currency** — `$` (dollar), not `₹` (rupee)
