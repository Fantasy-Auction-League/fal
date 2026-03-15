# FAL — Technical Architecture

## 1. Architecture Overview (Phase 1)

### Monolithic Next.js:
- Single Next.js app on Vercel
- API routes for backend logic
- React frontend (mobile-first)
- PostgreSQL (Vercel Postgres or Neon) + Prisma ORM
- Auth.js for authentication (OAuth + credentials)
- Vercel Cron for match data polling

### Tech Stack:
| Layer | Technology |
|---|---|
| Frontend | Next.js + React + TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js API Routes |
| Database | PostgreSQL (Vercel Postgres or Neon) |
| ORM | Prisma |
| Auth | Auth.js (OAuth + credentials) |
| Deployment | Vercel |
| Cron | Vercel Cron Jobs |

### Platform Constraints:
- **Vercel Cron execution limit:** 60s on Hobby, 300s on Pro. Scoring pipeline must complete within this window or be chunked into separate invocations.
- **Vercel Postgres connections:** Limited compute hours on Hobby. Use connection pooling (Prisma Data Proxy or PgBouncer via Neon).

## 2. Core Services

All services run within the Next.js monolith as modules:

1. **Match Import Service** — Polls cricket API, stores raw match data
2. **Stat Parser** — Extracts player performance stats from raw data
3. **Fantasy Points Engine** — Applies scoring rules, calculates base points
4. **Gameweek Aggregator** — Bench subs, multipliers, chips, team totals
5. **Leaderboard Service** — Rankings, season totals, history
6. **Lineup Validation Service** — Enforces squad size, player uniqueness within league, lineup lock timing

### Service Flow:
```
Cricket Data API → Match Import Service → Raw Match Data (per Match)
    → Stat Parser → Fantasy Points Engine → Gameweek Aggregator
    → Leaderboard Service
```

## 3. Database Entities

- **User** — Platform user (auth)
- **League** — Fantasy competition container. Stores `adminUserId` (creator/admin), `inviteCode`, settings.
- **Team** — Manager's team within a league
- **TeamPlayer** — Join table: which Player belongs to which Team (enforces uniqueness within a league)
- **Player** — Real IPL player (from API). Stores name, IPL team, role (BAT/BOWL/ALL/WK).
- **Gameweek** — Global weekly scoring period (Mon–Sun). Shared across all leagues, not league-specific.
- **Match** — An IPL match within a gameweek. Stores teams, date, status (scheduled/in_progress/completed), API match ID.
- **Lineup** — Weekly lineup submission per team per gameweek
- **LineupSlot** — Individual slot within a lineup. Stores: `playerId`, `slotType` (XI/BENCH), `benchPriority` (1-4, null for XI), `role` (CAPTAIN/VC/null).
- **PlayerPerformance** — Raw match statistics per player per match
- **PlayerScore** — Calculated fantasy points per player per gameweek (aggregated across matches)
- **ChipUsage** — Which chip a team used in which gameweek

### Entity Relationships:
```
User 1──N Team
League 1──N Team
League 1──1 User (adminUserId)
Team 1──N TeamPlayer
Player 1──N TeamPlayer
Team 1──N Lineup
Gameweek 1──N Lineup (one per team per gameweek)
Gameweek 1──N Match
Match 1──N PlayerPerformance
Player 1──N PlayerPerformance
Gameweek 1──N PlayerScore (aggregated)
Player 1──N PlayerScore
Team 1──N ChipUsage
Gameweek 1──N ChipUsage
```

### Uniqueness Constraints:
- `TeamPlayer`: unique(`leagueId`, `playerId`) — a player can only be on one team per league
- `Lineup`: unique(`teamId`, `gameweekId`) — one lineup per team per gameweek
- `ChipUsage`: unique(`teamId`, `chipType`) — each chip used once per season
- `LineupSlot`: unique(`lineupId`, `playerId`) — a player appears once per lineup

## 4. Data Ingestion

> Scoring rules and pipeline details are defined in the [Design Spec](2026-03-15-fal-design.md) Sections 6, 9, and 11. This section covers implementation-specific concerns only.

### API Strategy:
- **Primary:** CricketData.org (free tier: 100 req/day) or SportMonks (€29/mo with 14-day trial)
- **Evaluation needed** as part of implementation — both provide the required stats
- **Fallback:** Admin can manually input match stats if API is unavailable
- **Rate budget:** ~40-60 requests on a double-header IPL day (match status polling + scorecard fetches + retries). 100 req/day free tier is workable but tight — no margin for debugging or re-imports. Consider SportMonks for reliability.

### Required Stats from API:
- Runs scored, Fours hit, Sixes hit, Balls faced
- Wickets taken, Dot balls bowled, Maiden overs
- Catches taken, Runouts effected, Stumpings
- Did player bat? (for duck rule)
- Did player play? (for bench substitution)

### Ingestion Trigger:
Phase 1: Vercel Cron job polls the API periodically during match days (e.g., every 30 min). Detects completed matches and triggers the scoring pipeline. Admin can also manually trigger a re-import via API route.

**Cron execution strategy:** If the full pipeline exceeds the Vercel Cron time limit, split into two cron invocations: (1) import + parse, (2) score + aggregate. Use a `Match.scoringStatus` field (pending/scoring/completed) to coordinate.

## 5. API Routes (Phase 1)

### Auth:
- `POST /api/auth/[...nextauth]` — Auth.js handler

### Leagues:
- `POST /api/leagues` — Create league (creator becomes admin)
- `GET /api/leagues` — List user's leagues
- `GET /api/leagues/[id]` — League detail (settings, invite code, manager list)
- `POST /api/leagues/[id]/join` — Join via invite code
- `PUT /api/leagues/[id]/settings` — Update league settings (admin only)
- `DELETE /api/leagues/[id]/managers/[userId]` — Remove manager (admin only)

### Rosters:
- `POST /api/leagues/[id]/roster` — Upload roster CSV (admin)
- `GET /api/teams/[teamId]/squad` — View team squad

### Lineups:
- `GET /api/teams/[teamId]/lineups/[gameweekId]` — Get lineup for a specific team and gameweek
- `PUT /api/teams/[teamId]/lineups/[gameweekId]` — Submit/update lineup (playing XI, captain, VC, bench order)
- `POST /api/teams/[teamId]/lineups/[gameweekId]/chip` — Activate chip

### Scoring:
- `GET /api/scores/[gameweekId]?leagueId=X` — Get gameweek scores for a league
- `POST /api/scoring/import` — Trigger match import (admin)
- `POST /api/scoring/recalculate/[matchId]` — Re-import and recalculate a specific match (admin)

### Leaderboard:
- `GET /api/leaderboard/[leagueId]` — Get league standings
- `GET /api/leaderboard/[leagueId]/history` — Gameweek-by-gameweek history

### Players:
- `GET /api/players` — List/search players (with role/team filters)
- `GET /api/players/[id]` — Player detail + season stats

### Gameweeks:
- `GET /api/gameweeks/current` — Current gameweek info (lock time, matches)
- `GET /api/gameweeks` — List all gameweeks with status

## 6. Future Architecture (Phase 2+)

### Auction Engine:
- Real-time bidding with WebSockets
- $100M manager budget, $1M starting price, $0.5M bid increment
- 10-second timer (reset on each bid)
- Bid validation: remaining budget must allow filling remaining roster at $1M each
- Anti-sniping, auto-bid, reconnect handling

### Mid-Season Auction:
- After 30 IPL matches
- Managers can sell players back (90% market value) and bid for replacements

### Market System:
- Dynamic player pricing based on performance
- Price history graphs

### Engagement Features:
- Power rankings, player analytics
- Trade analyzer, AI lineup suggestions
