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
│   ├── dashboard/
│   │   ├── page.tsx
│   │   └── loading.tsx     # Skeleton UI
│   ├── lineup/
│   │   ├── page.tsx
│   │   └── loading.tsx
│   ├── players/
│   │   ├── page.tsx
│   │   └── loading.tsx
│   ├── league/
│   │   ├── page.tsx
│   │   └── loading.tsx
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

## Related Documents
- [Architecture](2026-03-15-fal-architecture.md) — System design, entities, API routes, scoring pipeline
- [API Exploration](2026-03-22-sportmonks-api-exploration.md) — SportMonks field validation, gap analysis
- [Design Spec](2026-03-15-fal-design.md) — Scoring rules, chips, lineup mechanics, UI designs
