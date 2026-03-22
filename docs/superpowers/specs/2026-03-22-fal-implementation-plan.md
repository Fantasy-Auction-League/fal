# FAL — Implementation Plan

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | `brew install node` or [nodejs.org](https://nodejs.org) |
| npm | 10+ | Bundled with Node.js |
| PostgreSQL | 16+ (or use Neon) | `brew install postgresql@16` or use Neon free tier |
| Git | 2.40+ | `brew install git` |
| Vercel CLI | 50+ | `npm install -g vercel` |

## 2. Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/Fantasy-Auction-League/fal.git
cd fal

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
```

### Environment Variables (`.env.local`)

```env
# Database — Neon (pooled connection for runtime queries)
DATABASE_URL="postgresql://user:pass@ep-xxx.region.neon.tech/fal?sslmode=require&pgbouncer=true&connection_limit=1"
# Database — Neon (direct connection for migrations — bypasses pgBouncer)
DIRECT_URL="postgresql://user:pass@ep-xxx.region.neon.tech/fal?sslmode=require"

# Auth.js v5
AUTH_URL="http://localhost:3000"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
# AUTH_GOOGLE_ID="your-google-client-id"       # optional — OAuth
# AUTH_GOOGLE_SECRET="your-google-secret"       # optional — OAuth

# SportMonks Cricket API (€29/mo Major plan)
SPORTMONKS_API_TOKEN="your-api-token"

# IPL 2026 Season (validated)
SPORTMONKS_SEASON_ID="1795"
SPORTMONKS_LEAGUE_ID="1"

# Vercel Cron (auto-set by Vercel in production)
CRON_SECRET="generate-a-random-secret-for-cron-auth"
```

### Prisma Configuration

In `prisma/schema.prisma`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
```

`DATABASE_URL` (pooled, via pgBouncer) → Prisma Client at runtime.
`DIRECT_URL` (direct) → `prisma migrate` and `prisma db push`. **Without this, migrations fail on Neon.**

### Database Init

```bash
# 4. Initialize the database
npx prisma generate
npx prisma db push

# 5. Seed IPL players (from SportMonks)
npm run seed:players

# 6. Start the dev server
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## 3. Environment Setup Notes

### Neon (recommended for dev)
- Create a free project at [neon.tech](https://neon.tech)
- Copy the **pooled** connection string into `DATABASE_URL` (add `?pgbouncer=true&connection_limit=1`)
- Copy the **direct** connection string into `DIRECT_URL` (for migrations)
- Install the serverless driver (WebSocket-based, avoids 40MB Prisma engine, reduces cold starts):
  ```bash
  npm install @neondatabase/serverless @prisma/adapter-neon
  ```
- Auto-suspends after 5 min idle (~1-3s cold start)

### Local PostgreSQL (alternative)
```bash
brew install postgresql@16
brew services start postgresql@16
createdb fal
# DATABASE_URL="postgresql://localhost/fal"
# No DIRECT_URL needed for local PG
```

### Auth.js v5 (NextAuth v5)
- Generate a secret: `openssl rand -base64 32` → set as `AUTH_SECRET`
- Auth.js v5 uses `AUTH_SECRET` and `AUTH_URL` (NOT the old `NEXTAUTH_*` env vars)
- OAuth providers: create apps, set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` etc.
- Credentials-based auth works without OAuth
- v5 pattern for Next.js App Router:
  ```
  lib/auth.ts                            → NextAuth() config, exports { auth, handlers, signIn, signOut }
  app/api/auth/[...nextauth]/route.ts    → export { GET, POST } from "@/lib/auth"
  middleware.ts                           → export { auth as middleware } from "@/lib/auth"
  ```

### SportMonks API
- Sign up at [sportmonks.com](https://www.sportmonks.com) (14-day free trial, then €29/mo)
- API token: Dashboard → Settings → API Tokens
- Rate limit: 3,000 calls/hr (FAL needs ~5 per match day)

### Prisma Client Singleton (`lib/db.ts`)

```typescript
import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

// Required for serverless environments
neonConfig.webSocketConstructor = ws

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma || createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## 4. Project Structure

```
fal/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (serverless functions)
│   │   ├── auth/[...nextauth]/route.ts  # Auth.js v5 handler
│   │   ├── leagues/        # League CRUD + join
│   │   ├── teams/          # Team + lineup management
│   │   ├── scoring/
│   │   │   ├── import/route.ts   # POST — admin trigger
│   │   │   ├── cron/route.ts     # GET — Vercel cron trigger
│   │   │   ├── recalculate/[matchId]/route.ts
│   │   │   ├── cancel/[matchId]/route.ts
│   │   │   ├── force-end-gw/[gameweekId]/route.ts
│   │   │   └── status/route.ts
│   │   ├── admin/          # Season init
│   │   ├── leaderboard/    # Rankings
│   │   ├── players/        # Player search
│   │   └── gameweeks/      # GW info
│   ├── (auth)/             # Route group — login, register
│   ├── (app)/              # Route group — main app pages (shared layout with nav)
│   │   ├── page.tsx        # Dashboard (route: /)
│   │   ├── loading.tsx
│   │   ├── lineup/
│   │   │   ├── page.tsx    # Lineup Builder (route: /lineup)
│   │   │   └── loading.tsx
│   │   ├── leaderboard/
│   │   │   └── page.tsx    # GW leaderboard (route: /leaderboard)
│   │   ├── standings/
│   │   │   └── page.tsx    # Full season standings (route: /standings)
│   │   ├── view-lineup/
│   │   │   └── [teamId]/
│   │   │       └── page.tsx # Read-only lineup view (route: /view-lineup/[teamId])
│   │   ├── players/
│   │   │   ├── page.tsx    # Player browser (route: /players)
│   │   │   └── loading.tsx
│   │   ├── scores/
│   │   │   └── [matchId]/
│   │   │       └── page.tsx # Match score breakdown (route: /scores/[matchId])
│   │   └── admin/
│   │       ├── page.tsx    # League admin (route: /admin)
│   │       └── loading.tsx
│   ├── layout.tsx          # Root layout (nav, providers)
│   ├── error.tsx           # Global error boundary
│   ├── loading.tsx         # Global loading skeleton
│   └── not-found.tsx       # 404 page
├── middleware.ts            # Auth.js v5 edge middleware
├── lib/
│   ├── scoring/            # Fantasy points engine
│   │   ├── batting.ts      # Batting points + SR bonus
│   │   ├── bowling.ts      # Bowling points + ER bonus
│   │   ├── fielding.ts     # Catches, stumpings, runouts
│   │   ├── multipliers.ts  # C/VC/chip effects
│   │   └── pipeline.ts     # Full scoring flow (shared by import + cron)
│   ├── lineup/             # Lineup validation service
│   │   ├── validation.ts   # Squad/XI rules, role constraints
│   │   └── lock.ts         # Lineup lock timing
│   ├── sportmonks/         # SportMonks API client
│   │   ├── client.ts       # HTTP client with auth + timeout
│   │   ├── fixtures.ts     # Fixture + scorecard fetching
│   │   ├── players.ts      # Player/squad fetching
│   │   └── types.ts        # API response types
│   ├── auth.ts             # Auth.js v5 config
│   └── db.ts               # Prisma singleton (Neon serverless adapter)
├── prisma/
│   └── schema.prisma       # Database schema (url + directUrl)
├── vercel.json             # Cron config + deployment settings
├── docs/                   # Design specs + mockups
├── server.js               # Mockup preview server
├── .env.local              # Local environment (git-ignored)
└── package.json
```

## 5. Data Freshness Strategy (Vercel Hobby — no WebSockets)

| Page | Strategy | Rationale |
|---|---|---|
| Dashboard | Server components `revalidate: 300` + SWR `refreshInterval: 60000` for scores | Scores change on admin trigger only |
| Lineup | Fetch on demand, no polling | User's own data |
| Leaderboard | Server component `revalidate: 300` | Updates at GW end only |
| Admin scoring | SWR `refreshInterval: 10000` | Admin sees pipeline progress |
| Player market | Server component `revalidate: 3600` | Stats change after GW end |

Key: scoring runs on admin trigger — no "live" data. `revalidateOnFocus: true` suffices.

## 6. Deployment (Vercel CLI)

### First-Time Setup

```bash
# 1. Login to Vercel
vercel login

# 2. Link project (from repo root)
vercel link
# Select your team/account → create new project → link to Git repo

# 3. Set environment variables
vercel env add DATABASE_URL production
vercel env add DIRECT_URL production
vercel env add AUTH_SECRET production
vercel env add AUTH_URL production        # e.g., https://fal.vercel.app
vercel env add SPORTMONKS_API_TOKEN production
vercel env add SPORTMONKS_SEASON_ID production
vercel env add SPORTMONKS_LEAGUE_ID production
# CRON_SECRET is auto-generated by Vercel for cron auth

# 4. Deploy to preview
vercel

# 5. Deploy to production
vercel --prod
```

### Vercel Configuration (`vercel.json`)

```json
{
  "crons": [{
    "path": "/api/scoring/cron",
    "schedule": "0 0 * * *"
  }]
}
```

### Ongoing Deployments

```bash
# Preview deployment (from any branch)
vercel

# Production deployment
vercel --prod

# Check deployment status
vercel ls

# View logs
vercel logs <deployment-url>

# Pull remote env vars to local .env
vercel env pull .env.local
```

### Git-Based Auto-Deploy

Once linked, Vercel auto-deploys:
- **Push to `main`** → production deployment
- **Push to any other branch** → preview deployment
- **PR created** → preview deployment with unique URL

### Vercel Hobby Limits to Know

| Limit | Value |
|---|---|
| Function duration | 60s max |
| Response body | 4.5MB max |
| Cron jobs | 1 total |
| Bandwidth | 100 GB/mo |
| Deployments | Unlimited |
| Custom domains | 1 per project |

## 7. Design Mockup Server

Preview UI mockups without the full Next.js app:

```bash
node server.js
```

[http://localhost:64472](http://localhost:64472) — Routes: `/`, `/lineup`, `/leaderboard`, `/admin`, `/players`, `/scores`, `/standings`, `/view-lineup`

## 8. Common Dev Commands

```bash
npm run dev              # Next.js dev server (localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
npx prisma studio        # Visual DB browser (localhost:5555)
npx prisma db push       # Push schema to database
npx prisma generate      # Regenerate Prisma client
npx prisma migrate dev   # Create + apply migration
npm run seed:players     # Import IPL 2026 players from SportMonks
npm run seed:fixtures    # Import IPL 2026 fixtures from SportMonks
node server.js           # Mockup preview (localhost:64472)
vercel                   # Preview deployment
vercel --prod            # Production deployment
vercel env pull          # Sync Vercel env vars to local
```

## 9. Database Schema

### Entities

- **User** — `email`, `name`, `image`, `role` (enum: `USER`/`ADMIN`).
- **League** — `adminUserId` (creator), `inviteCode`, `name`, `maxManagers` (Int, default 15), `minSquadSize` (Int, default 12), `maxSquadSize` (Int, default 15), `seasonStarted` (boolean, default false — admin flips after all rosters valid).
- **Team** — `name`, `totalPoints` (incremental — updated at GW end), `bestGwScore` (Int, default 0 — for leaderboard tiebreaker).
- **TeamPlayer** — `leagueId`, `playerId`, `purchasePrice` (from CSV upload).
- **Player** — `apiPlayerId` (SportMonks ID), `fullname`, `iplTeamId`, `role` (BAT/BOWL/ALL/WK), `battingStyle`, `bowlingStyle`, `imageUrl`.
- **Gameweek** — `number` (1-10), `lockTime` (DateTime), `status` (`upcoming`/`active`/`completed`), `aggregationStatus` (`pending`/`aggregating`/`done`).
- **Match** — `apiMatchId`, `gameweekId`, `localTeamId`, `visitorTeamId`, `startingAt`, `apiStatus` (`NS`/`Finished`/`Cancelled`), `scoringStatus` (`scheduled`/`completed`/`scoring`/`scored`/`error`), `note` (result text), `winnerTeamId`, `scoringAttempts` (Int, default 0).
- **Lineup** — `teamId`, `gameweekId`.
- **LineupSlot** — `lineupId`, `playerId`, `slotType` (XI/BENCH), `benchPriority` (1-4, null for XI), `role` (CAPTAIN/VC/null).
- **PlayerPerformance** — Per-player per-match:
  - Batting: `runs`, `balls`, `fours`, `sixes`, `strikeRate`, `wicketId`
  - Bowling: `overs`, `maidens`, `runsConceded`, `wickets`, `economyRate`, `dotBalls`
  - Fielding: `catches`, `stumpings`, `runoutsDirect`, `runoutsAssisted`
  - Computed: `fantasyPoints` (base points, before multipliers)
  - Meta: `inStartingXI` (boolean), `isImpactPlayer` (boolean)
- **PlayerScore** — Per-player per-GW aggregate (after C/VC multipliers + chip effects).
- **ChipUsage** — `teamId`, `chipType` (`POWER_PLAY_BAT`/`BOWLING_BOOST`), `gameweekId`, `status` (`pending`/`used`). Only 2 chips per season — one of each.
- **GameweekScore** — Per-team per-GW total after all adjustments. Stores `teamId`, `gameweekId`, `totalPoints` (Int — final GW score after subs + multipliers + chips), `chipUsed` (enum or null). Used for GW history, leaderboard tiebreaker, and `Team.bestGwScore` updates.

### Relationships
```
User 1→N Team, League 1→N Team, Team 1→N TeamPlayer, Player 1→N TeamPlayer
Team 1→N Lineup, Lineup 1→N LineupSlot
Gameweek 1→N Match, Match 1→N PlayerPerformance, PlayerPerformance N→1 Player
Team 1→N ChipUsage
Team 1→N GameweekScore, GameweekScore N→1 Gameweek
```

### Uniqueness Constraints
- `TeamPlayer`: unique(`leagueId`, `playerId`)
- `Lineup`: unique(`teamId`, `gameweekId`)
- `ChipUsage`: unique(`teamId`, `chipType`)
- `LineupSlot`: unique(`lineupId`, `playerId`)
- `GameweekScore`: unique(`teamId`, `gameweekId`)

### Required Indexes
- `Match(scoringStatus)` — optimistic lock claim
- `Match(gameweekId, scoringStatus)` — GW-end check
- `PlayerPerformance(playerId, matchId)` — upsert key
- `PlayerPerformance(matchId)` — per-match lookups
- `Player(role, iplTeamId)` — player search/filter
- `Team(leagueId)` — leaderboard queries
- `Gameweek(status)` — current GW lookup

## 10. API Routes

All routes require Auth.js session unless noted. **Platform admin** = `User.role === 'ADMIN'`. **League admin** = `league.adminUserId === session.userId`. **Owner** = `team.userId === session.userId`.

**Standard error responses:** `401` (unauthenticated), `403` (forbidden), `404` (not found), `409` (conflict), `422` (validation), `423` (locked).

### Auth
- `GET/POST /api/auth/[...nextauth]` — Auth.js v5 handler (public)

### Leagues
- `POST /api/leagues` — Create league (caller = league admin)
- `GET /api/leagues` — List user's leagues
- `GET /api/leagues/[id]` — League detail **(member)**
- `GET /api/leagues/[id]/teams` — Teams in league **(member)**
- `POST /api/leagues/[id]/join` — Join via invite code. Returns 409 if league has reached `maxManagers`.
- `PUT /api/leagues/[id]/settings` — Update settings **(league admin)**
- `DELETE /api/leagues/[id]/managers/[userId]` — Remove manager **(league admin)**

### Teams
- `GET /api/teams/[teamId]` — Team detail **(owner or member)**
- `GET /api/teams/[teamId]/squad` — Player list **(owner or member)**
- `POST /api/leagues/[id]/roster` — CSV roster upload **(league admin)**

### Lineups
- `GET /api/teams/[teamId]/lineups/[gameweekId]` — Get lineup. If no lineup exists for this GW, auto-copies previous GW lineup (carry-forward). Returns 404 only if no previous lineup exists either. **(owner or league member — league members get read-only access after GW lock, for viewing other managers' lineups)**
- `PUT /api/teams/[teamId]/lineups/[gameweekId]` — Submit/update lineup, 423 if locked **(owner)**
  - **Validation rules** (in `lib/lineup/validation.ts`):
    - Exactly 11 players in XI, remaining on bench
    - Exactly 1 Captain, 1 VC (different players)
    - All players must be on this team's squad (`TeamPlayer`)
    - No duplicate players across XI + bench
- `POST /api/teams/[teamId]/lineups/[gameweekId]/chip` — Activate chip. Returns 409 if already used this season, 423 if GW locked. **(owner)**
- `DELETE /api/teams/[teamId]/lineups/[gameweekId]/chip` — Deactivate chip. Returns 423 if GW locked. **(owner)**

### Scoring
- `GET /api/leagues/[leagueId]/scores/[gameweekId]` — GW scores for league **(member)**
- `GET /api/teams/[teamId]/scores/[gameweekId]` — Per-player breakdown **(owner or member)**
- `POST /api/scoring/import` — Trigger scoring pipeline **(platform admin)**
- `GET /api/scoring/cron` — Vercel cron trigger (protected by `CRON_SECRET`) **(cron only)**
- `POST /api/scoring/recalculate/[matchId]` — Re-score a match **(platform admin)**
- `POST /api/scoring/cancel/[matchId]` — Cancel abandoned match **(platform admin)**
- `POST /api/scoring/force-end-gw/[gameweekId]` — Force GW aggregation **(platform admin)**
- `GET /api/scoring/status` — Match scoring statuses **(platform admin)**

### Season Admin
- `POST /api/admin/season/init` — Import fixtures from SportMonks **(platform admin, one-time)**
- `POST /api/admin/season/start` — Validates: (1) league has ≥2 managers (min), (2) all teams have rosters meeting `minSquadSize`. Sets `League.seasonStarted = true`. Returns 422 if validation fails. **(league admin)**
- `POST /api/admin/scoring/csv-import` — Manual CSV stat upload for a match (fallback when SportMonks API is unavailable). CSV format: playerId, runs, balls, fours, sixes, wickets, overs, maidens, catches, stumpings, etc. **(platform admin)**

### Leaderboard
- `GET /api/leaderboard/[leagueId]` — Standings: `Team.totalPoints` desc, tiebreaker `Team.bestGwScore` desc. During an active GW, also computes live GW scores from `PlayerPerformance.fantasyPoints` for scored matches (before multipliers — approximate mid-week ranking). **(member)**
- `GET /api/leaderboard/[leagueId]/history` — GW-by-GW history **(member)**

### Match Scores
- `GET /api/matches/[matchId]/scores` — Per-player fantasy breakdown for a match (batting/bowling/fielding points, fielder attribution). Used by match scores page. **(member)**

### Players
- `GET /api/players?role=BAT&team=MI&page=1&limit=25` — Search/filter **(authenticated)**
- `GET /api/players/[id]` — Player detail **(authenticated)**

### Gameweeks
- `GET /api/gameweeks/current` — Current GW info **(authenticated)**
- `GET /api/gameweeks` — All GWs with status **(authenticated)**

## 11. Scoring Pipeline

### Triggers
- **Primary:** Admin taps "Import Scores" → `POST /api/scoring/import`
- **Safety net:** Daily cron at midnight → `GET /api/scoring/cron`

```json
// vercel.json
{ "crons": [{ "path": "/api/scoring/cron", "schedule": "0 0 * * *" }] }
```

### Pipeline Flow (`lib/scoring/pipeline.ts`)

#### Phase A: Per-Match Scoring (runs after each match)

```
1. Early exit: if any match has scoringStatus = 'scoring', return 409

2. Claim matches (raw SQL — NOT Prisma update()):
   $queryRaw`UPDATE "Match" SET "scoringStatus" = 'scoring'
     WHERE "scoringStatus" = 'completed'
     ORDER BY "startingAt" ASC LIMIT 4
     RETURNING id`
   → No rows → exit

3. For each claimed match (try/catch):
   try {
     a. GET /fixtures/{id}?include=batting,bowling,lineup[,balls] (10s timeout)
     b. Validate response (batting/bowling arrays exist)
     c. If match has super_over = true, filter batting/bowling/balls
        to scoreboard S1/S2 only (exclude Super Over data)
     d. Parse batting → runs, balls, fours, sixes, SR, wicketId, fielding attribution
     e. Parse bowling → wickets, overs, maidens, ER, wides, noballs
        (+ compute dot balls in-memory from balls include if enabled)
     f. Compute fantasyPoints per player (see "Base Points Calculation" below)
     g. Build lbwBowledCount per bowler: scan batting entries,
        count where wicket_id IN (79, 83) grouped by bowling_player_id.
        Pass this into each bowler's BowlingStats.lbwBowledCount.
     h. Build fielding stats per fielder: scan batting entries for
        catch_stump_player_id and runout_by_id. Any player referenced
        gets fielding stats — including Starting XI players who only fielded.
     i. Determine inStartingXI (lineup.substitution === false)
        and isImpactPlayer (sub who appears in batting or bowling).
        IMPORTANT: create PlayerPerformance rows for ALL Starting XI
        players, even those who didn't bat or bowl. They get +4 Starting XI
        bonus and may have fielding stats (catches, runouts).
     j. Batch upsert PlayerPerformance:
        $executeRaw`INSERT INTO "PlayerPerformance" (...)
          VALUES (...), (...), ...
          ON CONFLICT ("playerId", "matchId") DO UPDATE SET ...`
     k. Set Match.scoringStatus = 'scored'
   } catch {
     l. Reset Match.scoringStatus = 'completed'
     m. Increment scoringAttempts; if >= 3 → set 'error'
   }
```

#### Phase B: Gameweek Aggregation (runs once all GW matches are done)

```
4. GW end check (atomic lock):
   $queryRaw`UPDATE "Gameweek" SET "aggregationStatus" = 'aggregating'
     WHERE id = ? AND "aggregationStatus" = 'pending'
     AND NOT EXISTS (
       SELECT 1 FROM "Match"
       WHERE "gameweekId" = ?
       AND "scoringStatus" NOT IN ('scored', 'error', 'cancelled')
     )
     RETURNING id`
   → No rows → GW not complete, exit

5. If GW claimed, FOR EACH TEAM in each league:
   (order matters — steps a-g must execute in this sequence)

   a. AGGREGATE base points per player across all matches in this GW:
      gwBasePoints[playerId] = SUM(PlayerPerformance.fantasyPoints)
        for all matches in this GW

   b. LINEUP CARRY-FORWARD: if team has no Lineup for this GW,
      copy the previous GW's Lineup + LineupSlots. If no previous
      lineup exists (first GW), team scores 0.

   c. BENCH AUTO-SUBSTITUTION (see detailed algorithm below):
      Determine which XI players "played" and apply ordered bench subs.

   d. CAPTAIN/VC MULTIPLIER (PRD model — VC has NO default multiplier):
      - Captain played → Captain gets 2x. VC gets 1x (no multiplier).
      - Captain did NOT play → VC promoted to 2x. Bench sub who
        replaced Captain does NOT inherit multiplier.
      - Both Captain AND VC did NOT play → no multipliers for anyone.
      - Apply multipliers to gwBasePoints:
        · Captain (if played): gwBasePoints[C] *= 2
        · VC (only if Captain absent): gwBasePoints[VC] *= 2

   e. CHIP EFFECTS (multiplicative with captain multiplier):
      - Power Play Bat: for each player with role === BAT in the scoring XI,
        double their current points (including any C/VC multiplier)
      - Bowling Boost: same but role === BOWL
      - Formula: finalPts = gwBasePoints × captainMultiplier × chipMultiplier
        e.g., Captain (2x) who is BAT with Power Play Bat = basePoints × 2 × 2 = 4x

   f. SUM team GW total, write PlayerScore rows per player,
      UPSERT GameweekScore(teamId, gameweekId, totalPoints=gwTotal, chipUsed=chip),
      update Team.totalPoints += gwTotal,
      update Team.bestGwScore = MAX(Team.bestGwScore, gwTotal)

   g. Set Gameweek.aggregationStatus = 'done'

   IMPORTANT: Wrap all of steps 5a-5g in a single Prisma $transaction.
   If any team fails, the entire GW rolls back cleanly. The aggregationStatus
   claim (step 4) is outside the transaction, so a retry can re-claim.
```

### Base Points Calculation (`lib/scoring/batting.ts`, `bowling.ts`, `fielding.ts`)

Per player per match — returns `fantasyPoints` (Int):

```typescript
// CRITICAL: SportMonks returns overs in cricket notation (4.2 = 4 overs 2 balls = 26 balls)
// NOT decimal. Must convert before any division.
function oversToDecimal(overs: number): number {
  const full = Math.floor(overs);
  const balls = Math.round((overs - full) * 10);
  return full + balls / 6;
}

// Duck-exempt dismissal types
const DUCK_EXEMPT_WICKET_IDS = [84, 138]; // 84 = Not Out, 138 = Retired Out (tactical, not a dismissal)

interface BattingStats {
  runs: number; balls: number; fours: number; sixes: number;
  strikeRate: number; wicketId: number | null;
}
interface BowlingStats {
  wickets: number; overs: number; maidens: number;
  runsConceded: number; economyRate: number; dotBalls: number;
  lbwBowledCount: number; // DERIVED: count of batting entries where wicket_id IN (79,83) AND bowling_player_id = this bowler
}
interface FieldingStats {
  catches: number; stumpings: number;
  runoutsDirect: number; runoutsAssisted: number;
}

function computeBasePoints(
  batting: BattingStats | null,
  bowling: BowlingStats | null,
  fielding: FieldingStats | null,
  role: 'BAT' | 'BOWL' | 'ALL' | 'WK',
  inStartingXI: boolean,
  isImpactPlayer: boolean
): number {
  let pts = 0;

  // Starting XI / Impact Player bonus (concussion subs use same isImpactPlayer logic)
  if (inStartingXI) pts += 4;
  if (isImpactPlayer) pts += 4;

  // --- BATTING ---
  if (batting) {
    pts += batting.runs * 1;                       // +1 per run
    pts += batting.fours * 4;                      // +4 per four
    pts += batting.sixes * 6;                      // +6 per six

    // Milestone bonuses (century REPLACES all lower, below century they STACK)
    // Milestones are PER-MATCH, not per-GW aggregate
    if (batting.runs >= 100) {
      pts += 16;                                   // century only — no 25/50/75
    } else {
      if (batting.runs >= 75) pts += 12;           // stacks with 25 + 50
      if (batting.runs >= 50) pts += 8;            // stacks with 25
      if (batting.runs >= 25) pts += 4;
    }

    // Duck: -2 if scored 0, faced >= 1 ball, dismissed (not Not Out or Retired Out), role != BOWL
    if (batting.runs === 0 && batting.balls >= 1 &&
        batting.wicketId !== null &&
        !DUCK_EXEMPT_WICKET_IDS.includes(batting.wicketId) &&
        role !== 'BOWL') {
      pts -= 2;
    }

    // Strike Rate bonus/penalty (min 10 balls, bowlers exempt)
    if (batting.balls >= 10 && role !== 'BOWL') {
      const sr = (batting.runs / batting.balls) * 100;
      if (sr > 170) pts += 6;
      else if (sr > 150) pts += 4;
      else if (sr >= 130) pts += 2;
      else if (sr >= 60 && sr <= 70) pts -= 2;
      else if (sr >= 50 && sr < 60) pts -= 4;
      else if (sr < 50) pts -= 6;
    }
  }

  // --- BOWLING ---
  if (bowling) {
    pts += bowling.wickets * 30;                   // +30 per wicket (excl. runout, incl. stumpings)
    pts += bowling.maidens * 12;                   // +12 per maiden
    pts += bowling.dotBalls * 1;                   // +1 per dot ball

    // LBW/Bowled bonus: +8 per wicket where dismissal was LBW (83) or Bowled (79)
    // DERIVED during Phase A parsing: count batting entries where
    //   wicket_id IN (79, 83) AND bowling_player_id = this bowler's ID
    // Hit Wicket (87) deliberately excluded from this bonus per PRD
    pts += bowling.lbwBowledCount * 8;

    // Wicket bonuses (do NOT stack — 5w gets +12 only, aligned with Dream11)
    if (bowling.wickets >= 5) pts += 12;
    else if (bowling.wickets >= 4) pts += 8;
    else if (bowling.wickets >= 3) pts += 4;

    // Economy Rate bonus/penalty (min 2 overs — use converted decimal overs)
    const decimalOvers = oversToDecimal(bowling.overs);
    if (decimalOvers >= 2) {
      const er = bowling.runsConceded / decimalOvers;
      if (er < 5) pts += 6;
      else if (er < 6) pts += 4;
      else if (er <= 7) pts += 2;
      else if (er >= 10 && er <= 11) pts -= 2;
      else if (er > 11 && er <= 12) pts -= 4;
      else if (er > 12) pts -= 6;
    }
  }

  // --- FIELDING ---
  // All players can earn fielding points (not just WK)
  if (fielding) {
    pts += fielding.catches * 8;                   // +8 per catch
    if (fielding.catches >= 3) pts += 4;           // one-time 3-catch bonus
    pts += fielding.stumpings * 12;                // +12 per stumping
    pts += fielding.runoutsDirect * 12;            // +12 per direct hit
    pts += fielding.runoutsAssisted * 6;           // +6 per assisted runout
  }

  return pts;
}
```

### Bench Auto-Substitution Algorithm (`lib/scoring/multipliers.ts`)

Runs at GW end for each team:

```typescript
// Build the "played" set from PlayerPerformance rows already persisted in Phase A.
// Uses inStartingXI and isImpactPlayer flags — NO re-fetching from SportMonks.
// Single DB query, no API calls during Phase B aggregation.
async function buildPlayedSet(gwMatchIds: string[]): Promise<Set<number>> {
  const rows = await prisma.playerPerformance.findMany({
    where: {
      matchId: { in: gwMatchIds },
      OR: [{ inStartingXI: true }, { isImpactPlayer: true }],
    },
    select: { playerId: true },
    distinct: ['playerId'],
  });
  return new Set(rows.map(r => r.playerId));
}

function applyBenchSubs(lineup: LineupSlot[], playedPlayerIds: Set<number>) {

  // 2. Find XI players who did NOT play
  const xiSlots = lineup.filter(s => s.slotType === 'XI')
    .sort((a, b) => a.playerId - b.playerId);
  const absentXI = xiSlots.filter(s => !playedPlayerIds.has(s.playerId));

  // 3. Find bench players sorted by priority, who DID play
  const bench = lineup.filter(s => s.slotType === 'BENCH')
    .sort((a, b) => a.benchPriority - b.benchPriority);
  const availableBench = bench.filter(s => playedPlayerIds.has(s.playerId));

  // 4. Assign subs in order (no double-dipping)
  const usedBench = new Set<number>();
  const subs: Array<{out: number, in: number}> = [];
  for (const absent of absentXI) {
    const sub = availableBench.find(b => !usedBench.has(b.playerId));
    if (sub) {
      usedBench.add(sub.playerId);
      subs.push({ out: absent.playerId, in: sub.playerId });
    }
    // else: no available bench player → position scores 0
  }

  return subs;
}
```

### Captain/VC Promotion Logic (`lib/scoring/multipliers.ts`)

```typescript
// playedPlayerIds is built from PlayerPerformance DB records (see buildPlayedSet above)
// — NOT re-fetched from SportMonks. "played" = inStartingXI OR isImpactPlayer in any GW match.

function resolveMultipliers(
  lineup: LineupSlot[],
  playedPlayerIds: Set<number>
): Map<number, number> {
  const captain = lineup.find(s => s.role === 'CAPTAIN');
  const vc = lineup.find(s => s.role === 'VC');

  // Guard: if captain/VC not designated (data corruption or first-GW carry-forward bug)
  if (!captain || !vc) {
    console.warn(`Lineup missing captain/VC: lineupId=${lineup[0]?.lineupId}`);
    // Proceed with no multipliers — admin should investigate
    return new Map();
  }

  const multipliers: Map<number, number> = new Map();

  const captainPlayed = playedPlayerIds.has(captain.playerId);
  const vcPlayed = playedPlayerIds.has(vc.playerId);

  if (captainPlayed) {
    // Captain played ≥1 match this GW → Captain 2x, VC 1x (no bonus)
    // Example: Captain scores 80 → 160. VC scores 60 → 60.
    multipliers.set(captain.playerId, 2);
  } else if (vcPlayed) {
    // Captain absent (not in Starting XI, not as Impact Sub in ANY match this GW)
    // → VC promoted to 2x
    // Example: Captain absent → VC scores 60 → 120.
    multipliers.set(vc.playerId, 2);
    // Bench sub who filled Captain's slot does NOT inherit 2x
  }
  // Both absent → no multipliers

  return multipliers;
}
```

### Chip Effects Computation

```typescript
function applyChipEffects(
  chip: 'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null,
  scoringXI: Set<number>,
  gwPoints: Map<number, number>,      // playerId → points after C/VC multipliers
  playerRoles: Map<number, string>    // playerId → BAT/BOWL/ALL/WK
): number {
  let teamTotal = 0;

  // Sum XI points
  for (const pid of scoringXI) {
    teamTotal += gwPoints.get(pid) ?? 0;
  }

  // Apply chip (only 2 chips in FAL — per PRD)
  switch (chip) {
    case 'POWER_PLAY_BAT':
      // All BAT role players in scoring XI get 2x (on top of any C multiplier)
      for (const pid of scoringXI) {
        if (playerRoles.get(pid) === 'BAT') {
          teamTotal += gwPoints.get(pid) ?? 0; // add another 1x = total 2x
        }
      }
      break;

    case 'BOWLING_BOOST':
      // All BOWL role players in scoring XI get 2x
      for (const pid of scoringXI) {
        if (playerRoles.get(pid) === 'BOWL') {
          teamTotal += gwPoints.get(pid) ?? 0;
        }
      }
      break;
  }

  return teamTotal;
}
```

### Stacking Examples (from PRD)
- Captain (2x) BAT player, Power Play Bat active: base × 2 (captain) × 2 (chip) = **4x total**
- Captain (2x) BOWL player, Bowling Boost active: base × 2 (captain) × 2 (chip) = **4x total**
- VC when Captain plays, Power Play Bat active: base × 1 (no VC bonus) × 2 (chip) = **2x total**
- VC when Captain absent + chip active: VC gets 2x (promoted). Chip applies to role. If VC is BAT + Power Play Bat = 2x × 2x = **4x total**

### State Machine
```
scheduled → completed → scoring → scored
                ↑           |         |
                |    (fail) ↓         |
                ←── (retry) ←─────────┘ (re-score)
                         ↓
                    error (after 3 attempts)
                         ↓
                    cancelled (admin, for abandoned matches)
```

### Error Recovery
- Failed API call → reset to `completed` for retry
- 3 failures → set `error`, admin notified
- Stuck in `scoring` > 5 min → cron resets to `completed`
- Cancelled match → admin sets `cancelled` (excluded from GW-end check)
- Force end GW → admin triggers aggregation regardless of match statuses

### Timing Budget
| Step | Time |
|---|---|
| Vercel + Neon cold start | ~2-4s |
| SportMonks API call | ~1-2s/match |
| Parse + compute | <100ms |
| Batch SQL upsert (~30 rows) | ~100ms |
| GW aggregation (15 teams) | ~2-3s |
| **4 matches + GW end** | **~25-35s** (within 60s) |

### Critical Implementation Notes
- **Use `$queryRaw` / `$executeRaw`** for match claims, GW claims, and batch upserts. Prisma's ORM doesn't support `UPDATE...RETURNING` or efficient batch upserts.
- **Don't store ball-by-ball data.** Compute dot balls in-memory during scoring, store only `dotBalls` integer on PlayerPerformance. If re-scoring needed, re-fetch from SportMonks.
- **Vercel cron sends GET**, not POST. The cron route (`/api/scoring/cron`) must be a GET handler that calls the same `runScoringPipeline()` function.
- **Season init and seed scripts must share code** — fixture import logic lives in `lib/sportmonks/fixtures.ts`, called by both `POST /api/admin/season/init` and `npm run seed:fixtures`.
- **Super Over exclusion** — When `match.super_over === true`, filter batting/bowling/balls data to `scoreboard` values `S1` and `S2` only. Discard any data from Super Over innings.
- **Lineup carry-forward** — When `GET /api/teams/[teamId]/lineups/[gameweekId]` finds no lineup, auto-copy the previous GW's Lineup + LineupSlots. If GW1 has no lineup, return empty (team scores 0).
- **Player IPL transfer mid-season** — `Player.iplTeamId` may change if SportMonks updates a traded player. Fantasy ownership (`TeamPlayer`) is independent and unaffected. The "vs MI · Tue" opponent display uses the current `Player.iplTeamId`, which is correct behavior.
- **Duck rule precision** — Duck penalty (-2) requires ALL of: `runs === 0`, `balls >= 1` (faced at least 1 delivery), player is dismissed (`wicketId !== 84`), and `role !== 'BOWL'`. A player who is not-out on 0*(0) (never faced a ball) does NOT get duck penalty.
- **Live GW scores** — During an active GW, leaderboard shows approximate mid-week scores computed from `SUM(PlayerPerformance.fantasyPoints)` for scored matches. These are pre-multiplier/pre-bench-sub estimates. Final scores are only accurate after GW aggregation (step 5).
- **Abandoned match policy** — If a match is abandoned with no result (rain), admin MUST cancel via `/api/scoring/cancel/[matchId]`. Partial stats from abandoned matches are NOT scored. If SportMonks marks a rain-shortened match as `Finished` (DLS result), it is scored normally — fantasy points are per-player stats, not affected by DLS.
- **Overs format** — SportMonks returns overs in cricket notation (4.2 = 4 overs 2 balls, NOT 4.2 decimal). Always use `oversToDecimal()` before dividing. `4.2 overs / 6 = 4.333 actual overs`. Without conversion, ER calculations are wrong.

### Authoritative Sources
The **PRD** and **Player Guide** are the source of truth, not the design spec. Key differences from Dream11:
- **VC multiplier:** FAL uses 1x normally, 2x only if Captain absent (NOT Dream11's 1.5x always)
- **Chip names:** `POWER_PLAY_BAT` (PRD: "Power Play Bat"), `BOWLING_BOOST` (PRD: "Bowling Boost")
- Design spec may reference older naming/rules — defer to PRD when in conflict

## Related Documents
- [Architecture](2026-03-15-fal-architecture.md) — High-level system design, diagrams, cost summary
- [API Exploration](2026-03-22-sportmonks-api-exploration.md) — SportMonks field validation, gap analysis
- [Design Spec](2026-03-15-fal-design.md) — Scoring rules, chips, lineup mechanics, UI designs
- [PRD](2026-03-22-fal-prd.md) — Product requirements
