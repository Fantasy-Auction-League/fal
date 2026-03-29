# FAL — Fantasy Auction League

Private IPL fantasy league platform for friends. Season-long squads built via auction, weekly lineup management, automated scoring from live IPL data, and strategy chips.

## Quick Start (Fresh Mac)

### 1. Install Prerequisites

```bash
# Install Homebrew (skip if already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js and PostgreSQL
brew install node
brew install postgresql@16
brew services start postgresql@16

# Add PostgreSQL to PATH (add to ~/.zshrc to persist)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

### 2. Clone and Install

```bash
git clone https://github.com/Fantasy-Auction-League/fal.git
cd fal
npm install
```

### 3. Create Database

```bash
createdb fal
```

> If `createdb` is not found, run: `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"`

### 4. Set Up Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Database — replace YOUR_USERNAME with your macOS username (run: whoami)
DATABASE_URL="postgresql://YOUR_USERNAME@localhost/fal"
DIRECT_URL="postgresql://YOUR_USERNAME@localhost/fal"

# Auth
AUTH_SECRET="dev-secret-change-in-production"
AUTH_URL="http://localhost:3000"

# SportMonks Cricket API (get token from sportmonks.com)
SPORTMONKS_API_TOKEN="your-sportmonks-api-token"
SPORTMONKS_SEASON_ID="1795"
SPORTMONKS_LEAGUE_ID="1"

# Admin
ADMIN_SECRET="fal-admin-2026"
APP_ADMIN_EMAILS=your-email@example.com

# Cron
CRON_SECRET=dev-cron-secret
```

### 5. Initialize Database and Seed Data

```bash
# Push database schema (creates all tables)
npx prisma db push

# Seed 250 IPL 2026 players from SportMonks API
npm run seed:players

# Seed IPL fixtures and gameweeks
npm run seed:fixtures
```

### 6. Start Dev Server

```bash
npm run dev
```

Open **http://localhost:3000**

### 7. First-Time Login and Setup

1. **Login** — Enter your email, a password (min 6 chars), and the admin secret (`fal-admin-2026` or whatever you set in `ADMIN_SECRET`)
2. **Create League** — Go to `/admin`, type a league name, get the invite code
3. **Upload Roster** — Upload a CSV file with team rosters (see format below). A sample 10-team roster is included: `sample-roster-10teams.csv`
4. **View Teams** — Click any team to see their squad
5. **Start Season** — Click "Start Season" when all rosters are ready
6. **Set Lineup** — Go to `/lineup` to pick your Playing XI, Captain, and VC

> **Other users** log in with their email + invite code + a password. No admin secret needed for regular users.

### CSV Roster Format

```csv
managerEmail,teamName,playerName,purchasePrice
viiveek@fal.com,Viiveeks XI,Jasprit Bumrah,18.5
viiveek@fal.com,Viiveeks XI,Rohit Sharma,15.0
rohit@fal.test,Rohits Rockets,Virat Kohli,16.0
```

A sample 10-team roster is included: `sample-roster-10teams.csv`

## Local Development

### Starting the Dev Server

```bash
npm run dev
```

Server runs at **http://localhost:3000** with hot reload (Turbopack).

### Useful Commands

```bash
# View/edit database in browser
npx prisma studio

# Reset database (drop all data, re-push schema)
dropdb fal && createdb fal && npx prisma db push

# Re-seed after reset
npm run seed:players && npm run seed:fixtures

# Run scoring cron locally (scores live/completed matches)
curl -H "Authorization: Bearer dev-cron-secret" http://localhost:3000/api/scoring/cron

# Check TypeScript compiles
npx tsc --noEmit

# Lint
npm run lint
```

### Connecting to Production Database

```bash
# Pull production env vars (requires Vercel CLI + login)
npm i -g vercel
vercel login
vercel env pull .env.vercel.local

# Use Prisma Studio against prod
DATABASE_URL="<prod-url>" npx prisma studio
```

### Common Issues

| Problem | Fix |
|---------|-----|
| `createdb: command not found` | `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"` |
| `DIRECT_URL not found` during `prisma db push` | Add `DIRECT_URL` to `.env.local` (same value as `DATABASE_URL`) |
| Login shows "Invalid password" | User already exists with a different password. Reset via `psql fal -c "UPDATE \"User\" SET \"passwordHash\" = NULL WHERE email = 'your@email'"` |
| Scoring cron returns 307 redirect | Middleware blocking. Cron endpoints must be in the middleware exclude list |
| `SPORTMONKS_API_TOKEN not set` | Add the token to `.env.local`. Get it from the team or sportmonks.com |

## Running Tests

```bash
npm test                  # All 97 tests
npm run test:unit         # 67 unit tests (scoring engine)
npm run test:integration  # 19 integration tests (DB + API)
npm run test:e2e          # 11 E2E tests (full season flow)
npm run test:watch        # Watch mode
```

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | GW scores, standings, match schedule |
| `/lineup` | Lineup Builder | Pick XI, captain, VC, bench order |
| `/players` | Player Browser | Search/filter all 250 IPL players |
| `/leaderboard` | Leaderboard | Podium, rankings, GW history |
| `/standings` | Full Standings | Season table with GW selector |
| `/admin` | League Admin | Create league, upload roster, manage teams |
| `/view-lineup/[teamId]` | View Lineup | Read-only view of another manager's team |

## API Routes

### Leagues
- `POST /api/leagues` — Create league
- `GET /api/leagues` — List your leagues
- `POST /api/leagues/[id]/join` — Join via invite code
- `POST /api/leagues/[id]/roster` — Upload CSV roster (admin)

### Teams & Lineups
- `GET /api/teams/[id]/squad` — Team player list
- `GET/PUT /api/teams/[id]/lineups/[gwId]` — Get/submit lineup
- `POST/DELETE /api/teams/[id]/lineups/[gwId]/chip` — Activate/deactivate chip

### Scoring
- `POST /api/scoring/import` — Trigger scoring pipeline (admin)
- `GET /api/scoring/status` — Match scoring statuses
- `POST /api/scoring/recalculate/[matchId]` — Re-score a match
- `POST /api/scoring/cancel/[matchId]` — Cancel abandoned match

### Data
- `GET /api/players` — Search/filter players
- `GET /api/players/[id]` — Player detail + stats
- `GET /api/leaderboard/[leagueId]` — Standings
- `GET /api/gameweeks/current` — Current gameweek + matches

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + Plus Jakarta Sans |
| Backend | Next.js API Routes |
| Database | PostgreSQL (local dev) / Neon (production) |
| ORM | Prisma |
| Auth | Auth.js v5 (credentials) |
| Cricket Data | SportMonks Cricket API |
| Testing | Vitest (97 tests) |
| Deployment | Vercel (Hobby) |

## Project Structure

```
fal/
├── app/                    # Next.js App Router (pages + API routes)
├── lib/
│   ├── scoring/            # Fantasy points engine (batting, bowling, fielding, multipliers, pipeline)
│   ├── sportmonks/         # SportMonks API client (fixtures, types, utils)
│   ├── lineup/             # Lineup validation + lock
│   ├── auth.ts             # Auth.js v5 config
│   └── db.ts               # Prisma client (env-aware: local PG / Neon)
├── prisma/schema.prisma    # Database schema (13 tables)
├── scripts/                # Seed scripts + legacy tests
├── tests/                  # Vitest test suite (unit / integration / e2e)
├── docs/                   # Design specs, mockups, architecture docs
└── vercel.json             # Cron config
```

## Design Mockups

Preview the HTML mockups without the full app:

```bash
node server.js
# Open http://localhost:64472
```

## Docs

- [PRD](docs/superpowers/specs/2026-03-22-fal-prd.md) — Product requirements
- [Player Guide](docs/superpowers/specs/2026-03-22-fal-player-guide.md) — How to play
- [Architecture](docs/superpowers/specs/2026-03-15-fal-architecture.md) — System design
- [Implementation Plan](docs/superpowers/specs/2026-03-22-fal-implementation-plan.md) — Build spec
- [API Exploration](docs/superpowers/specs/2026-03-22-sportmonks-api-exploration.md) — SportMonks field validation
