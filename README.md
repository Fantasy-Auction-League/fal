# FAL — Fantasy Auction League

Private IPL fantasy league platform for friends, featuring custom scoring, strategy chips, and a future auction engine.

## Design Server

Preview all UI mockups locally:

```bash
node .superpowers/brainstorm/17822-1773600508/server.js
```

Then open [http://localhost:64472](http://localhost:64472)

### Routes

| Route | Page | File |
|-------|------|------|
| `/` | Dashboard | `01-dashboard.html` |
| `/lineup` | Lineup Builder | `02-lineup.html` |
| `/leaderboard` | Leaderboard | `03-leaderboard.html` |
| `/admin` | League Admin | `04-league-admin.html` |
| `/players` | Player Browser | `05-players.html` |
| `/scores` | Match Scores | `06-match-scores.html` |
| `/standings` | Full Standings | `07-full-standings.html` |
| `/view-lineup` | View Lineup | `08-view-lineup.html` |

Mockup HTML files live in `docs/superpowers/specs/mockups/`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + React + TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js API Routes |
| Database | Neon PostgreSQL |
| ORM | Prisma |
| Auth | Auth.js (OAuth + credentials) |
| Cricket Data | SportMonks API (€29/mo) |
| Deployment | Vercel (Hobby — free) |

## Docs

- [Design Spec](docs/superpowers/specs/2026-03-15-fal-design.md) — Scoring rules, chips, lineup mechanics
- [Technical Architecture](docs/superpowers/specs/2026-03-15-fal-technical-architecture.md) — Database, API routes, data pipeline

## Data

- `ipl-2026-squads.csv` — Full 250-player squad list from SportMonks API
- `ipl-2026-active-squads.csv` — Active players with injury/availability status (updated March 21, 2026)
