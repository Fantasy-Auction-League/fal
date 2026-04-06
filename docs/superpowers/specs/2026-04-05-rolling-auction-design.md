# Rolling Auction — Design Specification

**Date:** 2026-04-05
**Status:** Design complete, pending system architect review
**Visual Mockups:** `docs/superpowers/specs/mockups/rolling-auction-walkthrough.html` (8 screens, interactive — download and open in browser)

---

## Problem

Team rosters become stale mid-season. Managers who made poor initial auction picks or lost key players to injury have no mechanism to refresh their squads. This reduces engagement and competitive balance.

## Solution

An eBay-style **Rolling Auction** system that runs weekly alongside the existing gameweek cycle. All unowned players are available for open bidding. Managers can also drop players from their roster to free slots for new acquisitions.

---

## 1. Auction Cycle

```
Saturday (GW start)          Friday 6:00 PM EST         Friday 7:30 PM EST      Saturday (next GW)
       |                            |                          |                        |
       |<── Auction Window Open ──>|<── Anti-Snipe Zone ──>|<── Settlement ──>|
       |    Bids accepted           |    30-min extensions     |    Winners pay,       |
       |    Drops allowed           |    Max 3 extensions      |    players transfer,  |
       |                            |    (hard stop 7:30)      |    funds settle       |
```

### Timing Rules

| Event | Time |
|-------|------|
| Auction opens | Saturday, same time as GW start |
| Auction closes (soft) | Friday 6:00 PM EST |
| Anti-snipe extension | 30 min per extension if any bid placed in last 30 min |
| Max extensions | 3 (hard stop at 7:30 PM EST) |
| Settlement window | Friday 7:30 PM to Saturday GW start |
| Drop deadline for same-cycle | Thursday 6:00 PM EST |
| Player cooldown after drop | 24 hours before bids can be placed |

### Anti-Snipe Mechanism

```
                    5:30 PM        6:00 PM        6:30 PM        7:00 PM        7:30 PM
                       |              |              |              |              |
Normal close:          |              X (no last-min bids)
                       |              |
Extension 1:           |         bid! |──── +30 min ──── X (no bids in window)
                       |              |              |
Extension 2:           |         bid! |──── +30 min ──── bid! ──── +30 min ──── X
                       |              |              |              |              |
Extension 3 (max):     |         bid! |──── +30 min ──── bid! ──── +30 min ──── bid! X (hard stop)
```

- Extensions are **global** — all players' auctions extend, not just the one that received the bid
- Released funds from outbid players are immediately usable during extensions
- After hard stop at 7:30 PM, no more bids accepted regardless

---

## 2. Fund Management

### Initial Allocation

| Item | Amount |
|------|--------|
| One-time starting fund | $25M per manager |
| Weekly top-up | $2M per manager per GW start |
| Rollover | All unspent funds carry over indefinitely |

### Fund States

```
Total Fund ($25M + accumulated top-ups)
    |
    |── Available (free to bid with)
    |── Locked (escrow — you are the highest bidder on a player)
    |── Spent (won auctions — permanently deducted)
```

### Escrow Rules

- **Only the highest bidder's funds are locked.** All other bidders' funds are immediately released when outbid.
- When you place a bid: `Available -= bid amount`, `Locked += bid amount`
- When you are outbid: `Locked -= your bid amount`, `Available += your bid amount`
- When you win: `Locked -= bid amount`, `Spent += bid amount`
- Funds released from being outbid are **immediately available** for other bids, including during anti-snipe extensions.

### Fund Flow Diagram

```
Manager places $5M bid on Player A
    |
    v
[Available: $20M] ──> [Available: $15M, Locked: $5M]
    |
    v
Another manager bids $7M on Player A (outbids you)
    |
    v
[Available: $15M, Locked: $5M] ──> [Available: $20M, Locked: $0]
                                     (your $5M released immediately)
    |
    v
You bid $8M on Player A
    |
    v
[Available: $20M] ──> [Available: $12M, Locked: $8M]
    |
    v
Auction closes — you win Player A
    |
    v
[Available: $12M, Locked: $8M] ──> [Available: $12M, Spent: $8M]
```

---

## 3. Bidding Rules

| Rule | Detail |
|------|--------|
| Minimum increment | $1M (whole amounts only, no fractions) |
| Bid withdrawal | Not allowed — all bids are final |
| Bid visibility | All bids visible to all managers in real time |
| Opening bid minimum | $1M |
| Pricing model | Pay what you bid (not second-price) |
| Maximum active bids | Equal to number of open roster slots |

### Bid Validation

Before accepting a bid, the system must verify:

```
1. Auction window is OPEN
2. Player is available (unowned, not in cooldown)
3. Bid amount >= current highest bid + $1M
4. Bid amount <= manager's Available funds
5. Manager has open roster slots > current active highest bids
6. Bid amount is a whole number (multiple of $1M)
```

---

## 4. Roster Management

### Size Rules

| Parameter | Value |
|-----------|-------|
| Maximum roster size | 15 |
| Minimum roster size (hard floor) | 11 |
| Starting roster size | 15 (from initial auction) |
| Bench adapts to roster | 12 players = 1 bench spot, 11 = 0 bench |

### Open Slots = Max Active Bids

```
Roster: 13/15 players
Open slots: 2
Max active highest bids: 2

If manager is highest bidder on 2 players:
  -> Cannot place new bids until outbid or a slot frees up

If manager drops a player:
  -> Roster: 12/15
  -> Open slots: 3
  -> Can now be highest bidder on up to 3 players
```

### Drop Player Flow

```
Manager taps player in Edit Lineup
    |
    v
Stats bottom sheet opens (existing UI)
    |
    v
Taps "Drop from Roster" button (new, below Substitute + Full Profile)
    |
    v
Confirmation popup:
  - 24hr cooldown warning
  - Roster impact (13/15 -> 12/15)
  - No fund refund
  - Thursday 6:00 PM deadline for same-cycle
    |
    v
[Cancel]  or  [Drop Player]
    |               |
    v               v
  Close         Player removed from TeamPlayer
                Player enters 24hr cooldown
                Roster slot freed immediately
                Manager can place new bid immediately
```

### Drop Rules

| Rule | Detail |
|------|--------|
| When | Anytime during auction window |
| Cooldown | Dropped player has 24hr cooldown before bids open |
| Fund refund | None — original auction price is not returned |
| Same-cycle deadline | Drop before Thursday 6:00 PM EST for player to be biddable in same cycle |
| Captain/VC | Cannot drop current Captain or Vice Captain (must reassign first) |
| Hard floor | Cannot drop if roster would go below 11 |

---

## 5. Settlement Process

Settlement runs after the auction window closes (Friday 7:30 PM at latest).

```
Settlement Pipeline
    |
    v
1. Lock all auctions (no more bids)
    |
    v
2. For each player with bids:
    |── Determine highest bidder (winner)
    |── Deduct bid amount from winner's funds (Locked -> Spent)
    |── Create TeamPlayer record (winner's team + player)
    |── Release all other bidders' locked funds
    |
    v
3. Log all results to activity feed
    |
    v
4. Mark auction cycle as SETTLED
    |
    v
5. New auction cycle opens with next GW start (Saturday)
```

### Settlement Edge Cases

| Scenario | Handling |
|----------|----------|
| Player with no bids | Remains available for next cycle |
| Manager wins multiple players | Each processed independently |
| Manager's roster reaches 15 | No more bids accepted (enforced at bid time, not settlement) |
| Tied bids | Not possible — each bid must be $1M above current highest |

---

## 6. Data Model

### New Enums

```prisma
enum AuctionStatus {
  OPEN        // Accepting bids
  CLOSING     // In anti-snipe extension period
  SETTLED     // Winners determined, funds transferred
}

enum BidStatus {
  ACTIVE      // Currently the highest bid
  OUTBID      // Was outbid by another manager
  WON         // Won the auction
  LOST        // Auction settled, was not highest
}

enum AuctionPlayerStatus {
  AVAILABLE   // Open for bidding
  COOLDOWN    // Dropped player, 24hr waiting period
  SOLD        // Won by a manager this cycle
}
```

### New Models

```prisma
model Auction {
  id              String        @id @default(cuid())
  leagueId        String
  league          League        @relation(fields: [leagueId], references: [id])
  gameweekId      String
  gameweek        Gameweek      @relation(fields: [gameweekId], references: [id])
  status          AuctionStatus @default(OPEN)
  opensAt         DateTime      // Saturday GW start
  closesAt        DateTime      // Friday 6:00 PM EST
  hardStopAt      DateTime      // Friday 7:30 PM EST
  extensionCount  Int           @default(0)
  currentDeadline DateTime      // Moves forward with each extension
  settledAt       DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  bids            Bid[]
  auctionPlayers  AuctionPlayer[]

  @@unique([leagueId, gameweekId])
}

model AuctionPlayer {
  id            String              @id @default(cuid())
  auctionId     String
  auction       Auction             @relation(fields: [auctionId], references: [id])
  playerId      String
  player        Player              @relation(fields: [playerId], references: [id])
  status        AuctionPlayerStatus @default(AVAILABLE)
  cooldownUntil DateTime?           // Set when player is dropped
  droppedByTeamId String?           // Team that dropped the player
  highestBidId  String?             // Current highest bid (denormalized for speed)
  winnerTeamId  String?             // Set at settlement
  finalPrice    Int?                // Set at settlement (in millions)
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  bids          Bid[]

  @@unique([auctionId, playerId])
  @@index([status])
}

model Bid {
  id              String    @id @default(cuid())
  auctionId       String
  auction         Auction   @relation(fields: [auctionId], references: [id])
  auctionPlayerId String
  auctionPlayer   AuctionPlayer @relation(fields: [auctionPlayerId], references: [id])
  teamId          String
  team            Team      @relation(fields: [teamId], references: [id])
  amount          Int       // In millions (whole numbers only)
  status          BidStatus @default(ACTIVE)
  createdAt       DateTime  @default(now())

  @@index([auctionPlayerId, amount])
  @@index([teamId, status])
}

model ManagerFund {
  id          String   @id @default(cuid())
  teamId      String
  team        Team     @relation(fields: [teamId], references: [id])
  leagueId    String
  league      League   @relation(fields: [leagueId], references: [id])
  totalFund   Int      // Total accumulated (initial + top-ups)
  available   Int      // Free to bid
  locked      Int      // Escrowed as highest bidder
  spent       Int      // Won auctions (permanent)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([teamId, leagueId])
}
```

### Modifications to Existing Models

```prisma
enum AcquisitionType {
  AUCTION_INITIAL   // Original league auction
  ROLLING_AUCTION   // Won via rolling auction
}

// Add to TeamPlayer model:
model TeamPlayer {
  // ... existing fields ...
  acquiredVia   AcquisitionType? // null for legacy records
  droppedAt     DateTime?        // Set when player is dropped
  isActive      Boolean   @default(true) // false when dropped
}
// NOTE: The existing @@unique([leagueId, playerId]) constraint must change
// to @@unique([leagueId, playerId, isActive]) or be replaced with a partial
// unique index, since a dropped player (isActive=false) may later be acquired
// by a different team in the same league.

// Add relations to existing models:
model Team {
  // ... existing relations ...
  bids         Bid[]
  managerFund  ManagerFund?
}

model Player {
  // ... existing relations ...
  auctionPlayers AuctionPlayer[]
}

model League {
  // ... existing relations ...
  auctions     Auction[]
  managerFunds ManagerFund[]
}

model Gameweek {
  // ... existing relations ...
  auction      Auction?
}
```

### Entity Relationship Diagram

```
League ─────────── Auction (1 per GW per league)
  |                   |
  |                   |── AuctionPlayer (all unowned players)
  |                   |      |
  |                   |      |── Bid (multiple per player)
  |                   |             |
  |                   |             └── Team (bidder)
  |                   |
  |                   └── Gameweek
  |
  |── ManagerFund (1 per team per league)
  |      |
  |      └── Team
  |
  |── TeamPlayer (roster membership)
         |
         |── Team
         └── Player
```

---

## 7. API Endpoints

### Auction Hub

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auction/[leagueId]` | Current auction state, available players, active bids |
| GET | `/api/auction/[leagueId]/activity` | Activity feed (bids, drops, settlements) |

### Bidding

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auction/[leagueId]/bid` | Place a bid `{ playerId, amount }` |
| GET | `/api/auction/[leagueId]/player/[playerId]` | Player bid sheet (history, current highest) |
| GET | `/api/auction/[leagueId]/my-bids` | Manager's active/won/lost bids + fund state |

### Roster

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auction/[leagueId]/drop` | Drop a player `{ playerId }` |
| GET | `/api/auction/[leagueId]/funds` | Manager's fund breakdown |

### Settlement (Internal / Cron)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auction/settle` | Run settlement pipeline (cron-triggered) |
| POST | `/api/auction/extend` | Check and apply anti-snipe extensions |
| POST | `/api/auction/open` | Open new auction cycle (cron-triggered at GW start) |

### Auth Pattern

All endpoints follow the existing pattern:
```typescript
const session = await auth()
if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
```

Settlement/cron endpoints use `Authorization: Bearer <CRON_SECRET>`.

---

## 8. UI Screens

Interactive walkthrough with all 8 screens:
**File:** `docs/superpowers/specs/mockups/rolling-auction-walkthrough.html`
**Usage:** Download the HTML file and open in any browser to navigate between screens.

### Screen Map

```
                    ┌─────────────────────────────────┐
                    │         Auction Hub              │
                    │  ┌───────┬──────────┬─────────┐  │
                    │  │Available│ My Bids │Activity │  │
                    │  └───┬───┴────┬─────┴────┬────┘  │
                    │      |        |          |        │
                    └──────|────────|──────────|────────┘
                           |        |          |
              ┌────────────┘   ┌────┘          └──────────────┐
              v                v                              v
     ┌────────────────┐  ┌──────────────────┐     ┌──────────────────┐
     │ Player Bid     │  │  My Bids Tab     │     │  Activity Feed   │
     │ Sheet          │  │  ┌─────┬────┬───┐│     │  (filters: All,  │
     │ (Full Profile  │  │  │Bids │Pitch│List││    │   My Activity,   │
     │  button top-R) │  │  └──┬──┴──┬─┴─┬─┘│     │   Bids, Drops,  │
     └────────────────┘  │     |     |   |   │     │   Results)       │
                         └─────|─────|───|───┘     └──────────────────┘
                               |     |   |
                   ┌───────────┘     |   └───────────┐
                   v                 v               v
            ┌────────────┐  ┌─────────────┐  ┌────────────┐
            │ Bids View  │  │ Pitch View  │  │ List View  │
            │ Active,    │  │ Cricket     │  │ XI + Bench │
            │ Won, Lost  │  │ field       │  │ with stats │
            └────────────┘  │ 4-3-4 + Bench│ └────────────┘
                            └─────────────┘

                    ┌─────────────────────────────────┐
                    │    Edit Lineup (existing)        │
                    │    Stats Bottom Sheet            │
                    │    ┌─────────────────────────┐   │
                    │    │ [Substitute] [Full Prof] │   │
                    │    │ [Drop from Roster]  NEW  │   │
                    │    └───────────┬─────────────┘   │
                    └───────────────|───────────────────┘
                                    |
                                    v
                          ┌──────────────────┐
                          │ Drop Confirmation │
                          │ - 24hr cooldown   │
                          │ - Roster impact   │
                          │ - No fund refund  │
                          │ - Thu deadline     │
                          │ [Cancel] [Drop]   │
                          └──────────────────┘
```

### Screen Details

| # | Screen | Description |
|---|--------|-------------|
| 1 | **Auction Hub — Available** | Hero with budget bar (Available/Locked/Roster), timer, search + role filters, player cards with bid status |
| 2 | **Auction Hub — Activity** | Same hero, activity feed with filters (All, My Activity, Bids, Drops, Results). Settlement results appear under "Results" filter |
| 3 | **Player Bid Sheet** | Full Profile button (top-right), player stats, current highest bid, place-bid UI with $1M increments, bid history |
| 4a | **My Bids — Bids** | Active bids (Winning/Outbid), Won history, Lost history with refund info |
| 4b | **My Bids — Pitch View** | GW lineup on cricket field, 4-3-4 formation, team-colored jerseys, bench |
| 4c | **My Bids — List View** | GW lineup as list, summary bar (XI/Bench/Capt/VC), role badges, points, open-slots indicator |
| 5 | **Drop Player** | Edit Lineup stats sheet with new "Drop from Roster" button below Substitute + Full Profile |
| 6 | **Drop Confirmation** | Centered modal: warning icon, consequences (cooldown, roster impact, no refund), Thursday deadline, Cancel/Drop buttons |

---

## 9. Cron Jobs & Automation

### New Cron Jobs

| Job | Schedule | Action |
|-----|----------|--------|
| `auction/open` | Saturday at GW start | Create new Auction record, populate AuctionPlayers, apply $2M top-up to all ManagerFunds |
| `auction/extend` | Every 1 min during Friday 5:30-7:30 PM | Check if bids placed in last 30 min, extend `currentDeadline` if needed (max 3) |
| `auction/settle` | Friday at `currentDeadline` (after extensions resolve) | Run settlement pipeline, create TeamPlayer records, update funds |
| `auction/cooldown` | Every hour during auction window | Check if cooldown periods have elapsed, update AuctionPlayer status to AVAILABLE |

### Integration with Existing Cron

The scoring cron (`/api/scoring/cron`) runs independently. Settlement must complete before the next GW's scoring begins, but since settlement happens Friday evening and scoring starts Saturday, there is no conflict.

```
Friday 6:00-7:30 PM    Friday 7:30 PM    Saturday AM         Saturday PM (matches start)
      |                      |                |                       |
  Anti-snipe           Settlement         GW start              Scoring cron
  extensions           pipeline           New auction opens     begins
```

---

## 10. Notifications & Activity Feed

### Activity Feed Events

| Event | Display | Highlight |
|-------|---------|-----------|
| New bid placed | "{Team} bid {amount} on {Player}" | Yes, if involves you |
| You are outbid | "{Team} outbid you on {Player} — {amount}" | Warning (red) |
| Player dropped | "{Team} dropped {Player}" | Standard |
| Auction settled | "GW{n} Auction Settled — {count} players transferred" | Standard |
| You won a player | "You won {Player} for {amount}" | Success (green) |
| You lost a player | "You lost {Player} — won by {Team} for {amount}" | Standard |
| Weekly top-up | "Weekly budget top-up: +$2M added to all managers" | Standard |
| Cooldown expired | "{Player} now available for bidding" | Standard |

---

## 11. Edge Cases & Safeguards

### Concurrency

- **Bid placement** must use atomic operations (`UPDATE ... RETURNING` or Prisma transactions) to prevent race conditions where two managers bid simultaneously
- **Fund locking** must be transactional — check Available >= bid amount AND lock funds in a single atomic operation
- **Settlement** uses a state machine (OPEN -> CLOSING -> SETTLED) with optimistic locking to prevent double-settlement

### Safeguards

| Risk | Mitigation |
|------|-----------|
| Infinite extensions | Hard cap at 3 extensions (7:30 PM absolute stop) |
| Strategic blocking | Self-punishing — bids cannot be withdrawn, funds stay locked |
| Roster overflow | Enforced at bid time: open slots must > active highest bids |
| Below minimum roster | Hard floor at 11 — drop rejected if roster would go below |
| Cascading fund release | Allowed and intentional — released funds usable immediately |
| Stale bid data | Real-time updates via polling or SSE on auction hub |
| Settlement failure | Retry with idempotent operations, match-level error isolation |

---

## 12. Future A/B Testing Backlog

These are design decisions that were debated and may be revisited:

| # | Parameter | Option A (Current) | Option B (Test) |
|---|-----------|-------------------|-----------------|
| 1 | Funding model | $25M one-time + $2M/week | $5M/week accumulating (no initial lump sum) |
| 2 | Bid increment | Fixed $1M minimum | Variable (e.g., 10% of current highest) |

---

## 13. Out of Scope

- Live auction (synchronous, real-time bidding room) — rejected during design
- Admin-curated player pool — all unowned players are available
- Bid withdrawal / cancellation
- Second-price auctions
- Trade between managers (player swaps)
- Mobile push notifications (may be added later)

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Rolling Auction** | The weekly open-bid cycle for acquiring unowned players |
| **Auction Window** | Saturday to Friday period when bids are accepted |
| **Anti-Snipe** | 30-min extension triggered by last-minute bids |
| **Escrow / Locked** | Funds reserved because you are the highest bidder |
| **Cooldown** | 24-hour period after a player is dropped before bids open |
| **Settlement** | Friday process that determines winners and transfers players |
| **Hard Floor** | Minimum roster size of 11 that cannot be violated |
| **Open Slots** | `15 - current roster size` = max number of active highest bids |
