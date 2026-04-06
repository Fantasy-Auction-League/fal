# Mini Auction — Design Specification

**Date:** 2026-04-06
**Status:** Design complete, pending partner architect review
**Visual Mockups:** `docs/superpowers/specs/mockups/mini-auction/` (download and open in browser)
- `auction-screen.html` — Live auction screen with normal + alert states
- `bidding-controls.html` — Stepper + increment pills bidding UI
- `lifecycle.html` — 7-phase auction lifecycle diagram
- `managers-purse.html` — Budget bar design options (Option A selected)

---

## Problem

FAL currently requires users to be part of a full-season league with a pre-season auction and 15-player squads. There is no casual entry point for new users or a lightweight format for existing users who want weekend-only competition. This limits growth and engagement.

## Solution

**Mini Auction** — a weekend-scoped fantasy format where 2-5 managers run a live, synchronous auction to draft 10 players from that weekend's IPL matches (Saturday, Sunday, Monday). Managers set daily lineups, compete over the weekend, and a winner is declared when all matches are scored. Mini leagues are disposable — play once, archive, create a new one next weekend.

---

## 1. Target Users

- **New users** who have never used FAL — Mini Auction is the primary casual onboarding path
- **Existing users** in full-season leagues who want additional weekend competition
- A manager can be part of **multiple mini leagues simultaneously** (and alongside full-season leagues)

---

## 2. Mini Auction Parameters

| Parameter | Value |
|-----------|-------|
| Managers per league | 2–5 |
| Squad size | 10 players (7 XI + 3 bench) |
| Match window | Auto: all Sat/Sun/Mon IPL matches for the selected weekend |
| Player pool | All IPL players from that weekend's matches |
| Player ordering | Ranked by average fantasy points this season (descending) |
| Budget per manager | $50M |
| Base price (all players) | $1M |
| Bid increment | $1M minimum (can bid higher via stepper/pills) |
| Bid timer | 15 seconds, resets on each new bid |
| Alert state | Last 3 seconds — red visual glow, audio alert |
| Chips | None (disabled for mini format) |
| Squad composition | No constraints — full freedom |

---

## 3. Available Mini Auctions

At launch (GW4 onwards), the system presents all remaining IPL weekends as available mini auction windows. Each window is derived from the existing `Gameweek` data by filtering matches to Saturday, Sunday, and Monday only.

**Rules:**
- Only show weekends that have at least one Sat/Sun/Mon match (no empty windows)
- All non-playoff weekends are shown at once
- Playoff mini auction is added separately once playoff teams are finalized
- A creator picks which weekend to play when creating a mini auction

**Example (GW4 launch):**
```
Available Mini Auctions:
  GW4  — Sat Mar 29, Sun Mar 30, Mon Mar 31  (5 matches)
  GW5  — Sat Apr 5, Sun Apr 6, Mon Apr 7     (4 matches)
  GW6  — Sat Apr 12, Sun Apr 13, Mon Apr 14   (6 matches)
  ...
  GW10 — Sat May 10, Sun May 11, Mon May 12   (3 matches)

  Playoffs — TBD (unlocked when teams finalize)
```

---

## 4. Registration & Onboarding

### Current Auth Flow
- Admin: email + password + ADMIN_SECRET
- Regular user: email + password + league invite code

### New Auth Flow
- **Open registration:** email + password only — no invite code required to create an account
- **Full-season league join:** still requires a league-specific invite code (unchanged)
- **Mini auction join:** uses a separate invite code/link mechanism (post-registration)

### Home Page Empty State
Users with no league see an onboarding landing page with two CTAs:
- **"Create Mini Auction"** — primary action
- **"Join Mini Auction"** — enter code or paste invite link

Existing users access Mini Auction via the bottom nav tab.

### Invite Link Flow
1. New user clicks invite link (`/mini-auction/[id]/join?code=ABC123`)
2. Lands on login/register page
3. Registers with email + password (or logs in if existing)
4. Auto-redirected into the mini auction lobby

---

## 5. Auction Lifecycle

### Phase 1: Create Mini League
Creator signs in, taps "Create Mini Auction," picks a weekend window, sets team name. System auto-generates player pool ranked by fantasy points. Creator gets invite code + shareable link.

### Phase 2: Lobby & Invite
Managers join via code or link. New users auto-register on join. Lobby shows who's in (2-5 managers). Creator sees "Start Auction" button (enabled when 2+ have joined). No new joins after countdown begins.

### Phase 3: 30-Second Countdown
Creator hits start. 30-second countdown with visual timer. All managers see it.

### Phase 4: Live Auction
Players appear one at a time, ranked by fantasy points (descending). For each player:

1. Player card shown with name, role, IPL team, avg fantasy points, base price ($1M)
2. 15-second timer starts
3. Managers bid (using stepper + increment pills) or pass
4. Timer resets on each new bid. Last 3 seconds = red visual glow + audio alert
5. Timer expires → sold to highest bidder
6. If all managers pass (or no bids in 15 seconds) → player is unsold, moves to unsold list
7. Any manager can nominate an unsold player → queued as next player
8. **Early sale:** If one manager bids and all others pass, player is sold immediately (no need to wait out the timer)
9. A manager who fills 10 players exits bidding — auction continues for remaining managers

### Phase 5: Auction Complete → Set Lineups
Auction ends when all managers have 10 players. If the ranked list is exhausted and managers still need players, unsold players cycle back. Managers set Day 1 lineup (7 XI + 3 bench, captain, VC).

### Phase 6: Match Days (Sat → Sun → Mon)
Each day: lineup locks 1 hour before first match, existing scoring engine runs (live + post-match), daily scores shown. Before each new day, managers can adjust XI/bench/captain/VC from their 10-player squad.

### Phase 7: Results & Archive
Last day's matches scored → total points summed across all days → winner declared. League archived. Managers can view history but league is complete.

---

## 6. Bidding Mechanics

### Ascending Bid with Pass

- **Base price:** $1M for all players
- **Minimum bid:** Current bid + $1M
- **Timer:** 15 seconds, resets on every new bid
- **Pass:** Each manager can pass on a player. If all managers pass, player is unsold.
- **Early sale:** Sold immediately when all other managers have passed and one bid exists.

### Bidding Controls (adapted from Rolling Auction design)

- **+/- stepper:** Tap to adjust by $1M. Centered display shows your bid amount.
- **Quick increment pills:** +$1M (highlighted), +$2M, +$5M, +$10M — for power moves that skip incremental bidding.
- **Live fund info:** "Available" and "After bid" update as you adjust the stepper.
- **BID button:** Shows exact amount, one tap to confirm. No extra confirmation dialog (speed matters).
- **Floor:** Stepper can't go below current bid + $1M.
- **Ceiling:** Max possible bid = budget minus ($1M x remaining empty slots).

### Nomination

Any manager can nominate an unsold player at any time during the auction. The nominated player is queued as the next player after the current one resolves. Nomination button is inline on the unsold players list. If multiple managers nominate different players, nominations are queued in the order received (first-come, first-served). A player can only be nominated once — once nominated, the NOMINATE button is replaced with "QUEUED."

---

## 7. Auction Screen UX

### Layout Order (top to bottom)

1. **Top bar** — league name + LIVE status indicator
2. **Your budget bar** — remaining budget + players bought count
3. **Timer** — large monospace countdown (15s), turns red at 3s with glow + "GOING GOING..." text
4. **Player card** — avatar/initials, name, role badge, IPL team, avg fantasy points
5. **Current bid** — amount (gold, large) + bidder name
6. **Bidding controls** — stepper (+/-), increment pills (+$1M/+$2M/+$5M/+$10M), available/after-bid funds
7. **PASS / BID buttons** — pass (outline), bid (green, shows amount; turns red in last 3s)
8. **Managers purse (budget bars)** — all managers with visual progress bars showing spend vs remaining, player count, color shifts green→red as budget depletes
9. **Bid history** — scrollable list of bids on current player
10. **Previous sale result** — brief banner showing last sold player + buyer + price
11. **Unsold players** — list with inline NOMINATE action

### Alert State (Last 3 Seconds)

Only visual treatment changes — all data stays identical:
- Timer turns red with text-shadow glow
- "LIVE" badge → "GOING..." in red
- Player card border turns red with box-shadow
- BID button turns red with glow
- "Current Bid" label turns red
- Audio alert plays

### Manager Budget Bars

Prominent section showing all managers' financial state — crucial strategic data:
- Horizontal progress bar per manager (color-coded per manager)
- Shows: remaining budget / $50M total
- Shows: X/10 players bought
- Bar color shifts from green → yellow → red as budget depletes
- "Running low" indicator when budget is tight relative to remaining slots

---

## 8. Edge Cases

### Disconnect Mid-Auction
- Disconnected manager auto-passes on every player
- They can rejoin at any time and resume bidding immediately
- No auction pause — other managers continue uninterrupted

### Creator Disconnects
- Auction continues without the creator (they just auto-pass like any disconnected manager)
- Creator role has no special privileges once the auction is live

### Player Pool Sufficiency
- For this season (IPL 2026), match schedule is known — pool will be sufficient for all weekend windows
- Enhancement for next season: cap managers based on pool size (minimum 10 players per manager available)

### Budget Always Sufficient
- $50M budget / $1M base price / 10 players = managers always have enough to fill their squad at base price
- The edge case of "ran out of money with empty slots" cannot occur

---

## 9. Pages & Navigation

| Page | Purpose |
|------|---------|
| `/mini-auction` | Hub — available weekend windows, active/past mini leagues, "Create" button |
| `/mini-auction/create` | Pick weekend window, set team name, get invite code + link |
| `/mini-auction/[id]/lobby` | Waiting room — who's joined, share link, creator's "Start" button, 30s countdown |
| `/mini-auction/[id]/live` | Live auction screen (full bidding UX) |
| `/mini-auction/[id]/lineup` | Daily lineup management (7 XI + 3 bench, captain/VC) |
| `/mini-auction/[id]/standings` | Mini league leaderboard — daily breakdown + total points |
| `/mini-auction/[id]/results` | Final results — winner, all squads, points breakdown, archived view |

### Navigation

- New **"Mini Auction"** tab in bottom nav (AppFrame)
- When inside a mini auction context, bottom nav adapts to show auction-relevant tabs (Auction, Lineup, Standings)

### Invite Link Join Route

`/mini-auction/[id]/join?code=ABC123` — handles auth check, redirects to login if needed, then into lobby.

---

## 10. Data Model Changes

> **NOTE FOR PARTNER ARCHITECT:** The data model below is a proposed starting point and needs review. Please evaluate the approach of extending existing models (League, Team, Gameweek) vs. any concerns about coupling between full-season and mini-auction domains. Key areas for review: mini gameweek scoping, auction state management, and real-time infrastructure choices.

### Existing Model Changes

**League**
- `+ leagueType: LeagueType` — new enum: `FULL_SEASON | MINI_AUCTION` (default `FULL_SEASON`)
- `+ miniAuctionId: FK → MiniAuction` (nullable)
- `maxSquadSize`: set to 10 for mini (already exists)
- `minSquadSize`: set to 10 for mini (already exists)
- `maxManagers`: set to 5 for mini (already exists)

**Gameweek**
- `+ leagueId: FK → League` (nullable — null = main season gameweek)
- For mini auctions, create 1-3 mini gameweeks (one per day: Sat, Sun, Mon) scoped to the league

**User / Auth**
- Registration no longer requires invite code — email + password is sufficient
- Full-season league join still requires league invite code (unchanged)

### New Models

**MiniAuction**
```
- id: String (cuid)
- leagueId: FK → League
- status: MiniAuctionStatus (LOBBY | COUNTDOWN | LIVE | COMPLETED | CANCELLED)
- budget: Int (default 50_000_000)
- basePrice: Int (default 1_000_000)
- bidIncrement: Int (default 1_000_000)
- bidTimerSeconds: Int (default 15)
- weekendStartDate: DateTime (Saturday of the selected weekend)
- currentPlayerId: FK → Player (nullable — who's on the block)
- playerOrder: Json (ranked player IDs for this weekend)
- playerOrderIndex: Int (current position in the order)
- createdAt: DateTime
- startedAt: DateTime (nullable)
- completedAt: DateTime (nullable)
```

**MiniAuctionManager**
```
- id: String (cuid)
- miniAuctionId: FK → MiniAuction
- teamId: FK → Team
- remainingBudget: Int (starts at 50_000_000)
- playersBought: Int (starts at 0)
```

**AuctionBid**
```
- id: String (cuid)
- miniAuctionId: FK → MiniAuction
- playerId: FK → Player
- teamId: FK → Team (the bidder)
- amount: Int
- createdAt: DateTime
```

**AuctionPlayerStatus**
```
- id: String (cuid)
- miniAuctionId: FK → MiniAuction
- playerId: FK → Player
- status: AuctionPlayerState (PENDING | ON_BLOCK | SOLD | UNSOLD | NOMINATED)
- soldToTeamId: FK → Team (nullable)
- soldPrice: Int (nullable)
- nominatedByTeamId: FK → Team (nullable)
```

### New Enums

```
LeagueType: FULL_SEASON | MINI_AUCTION
MiniAuctionStatus: LOBBY | COUNTDOWN | LIVE | COMPLETED | CANCELLED
AuctionPlayerState: PENDING | ON_BLOCK | SOLD | UNSOLD | NOMINATED
```

### Key Integration Point

`TeamPlayer` already tracks players on a team with purchase price. The auction creates `TeamPlayer` rows when a player is sold — same model, different acquisition mechanism.

---

## 11. Scoring & Lineup Integration

### Daily Mini Gameweeks

For each mini league, create 1-3 gameweeks (one per match day). These are scoped to the mini league via `leagueId` on `Gameweek`. The existing scoring pipeline, lineup management, and aggregation logic work unchanged.

### Lineup Flow

1. Auction completes → managers set Day 1 lineup (7 XI + 3 bench, captain/VC)
2. Lock time = 1 hour before first match of that day
3. After Day 1 matches scored → managers adjust lineup for Day 2
4. Repeat for Day 3
5. **No carry-forward** — managers must set lineup each day
6. **No chips** — POWER_PLAY_BAT and BOWLING_BOOST disabled for mini format

### Scoring

- Existing scoring engine unchanged (batting + bowling + fielding points)
- Captain 2x, VC 1.5x (if captain doesn't play that day)
- Bench auto-sub: if XI player doesn't play any match that day, bench sub fills in (priority 1→3)
- Daily scores aggregated per mini gameweek

### Winning

Sum of all daily scores across the weekend. Highest total wins. Standings page shows daily breakdown + cumulative total.

---

## 12. Open Questions

### Real-Time Technology
**Status:** Needs partner architect input before implementation.

The live auction requires all managers to see bids in real-time (sub-second latency for a 15-second timer). The current app has no WebSocket or real-time infrastructure. Options under consideration:

| Option | Pros | Cons |
|--------|------|------|
| **WebSockets (Socket.io)** | Full duplex, lowest latency | Requires persistent connections; Vercel serverless doesn't natively support long-lived WS |
| **Server-Sent Events (SSE)** | Simpler than WS, works on Vercel Edge Runtime | One-directional; clients send bids via API, receive updates via SSE |
| **Polling (1-2s interval)** | Simplest, works on current infra | May feel laggy for fast-paced auction with 15s timer |
| **Third-party service (Pusher, Ably, Supabase Realtime)** | Production-quality real-time, free tiers available | External dependency, adds cost at scale |

**Recommendation:** To be determined by architect. Key constraint: Vercel Hobby plan, serverless functions, 2-5 concurrent users per auction room.
