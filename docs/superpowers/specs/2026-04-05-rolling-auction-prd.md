# Rolling Auction — Product Requirements Document

**Version:** 1.0
**Date:** 5 April 2026
**Status:** Pending system architect review
**Related:** [Design Specification](2026-04-05-rolling-auction-design.md) | [Interactive Mockups](mockups/rolling-auction-walkthrough.html)

---

## 1. Executive Summary

The Rolling Auction extends FAL from a fixed-roster format into a dynamic mid-season transfer system. It introduces an eBay-style open bidding mechanism that runs weekly alongside the existing gameweek cycle, allowing managers to acquire unowned players and drop underperformers.

**Problem:** Managers who made poor initial auction picks or lost key players to injury/form drops have no mechanism to improve their squad. This causes disengagement — 40-60% of the season remains with managers feeling "stuck" with a bad roster.

**Solution:** A weekly auction window (Saturday to Friday) where all unowned players are available for open bidding. Managers receive $25M in auction funds at season start, plus $2M weekly top-ups. Managers can also drop players from their roster to free up bid slots.

---

## 2. User Stories

### 2.1 Manager — Acquiring Players

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| RA-01 | As a manager, I want to browse all unowned players so I can find players to bid on | Available tab shows all unowned players with current bid status, sorted by active bids then alphabetically |
| RA-02 | As a manager, I want to place a bid on a player so I can try to acquire them | Bid placed, funds locked, bid visible to all managers immediately |
| RA-03 | As a manager, I want to raise my bid when outbid so I can stay competitive | Can increase bid in $1M increments, new amount locked, old amount released |
| RA-04 | As a manager, I want to see all bids on a player so I know who I'm competing with | Bid sheet shows full history: who bid, when, amount, current highest |
| RA-05 | As a manager, I want to search and filter players by role so I can find specific positions | Search bar + role filters (BAT, BOWL, ALL, WK) + Hot Bids + New |
| RA-06 | As a manager, I want to see my current team lineup while bidding so I can strategize | Pitch View and List View tabs within My Bids show GW lineup |

### 2.2 Manager — Dropping Players

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| RA-07 | As a manager, I want to drop a player from my roster so I can free up a bid slot | Drop button in Edit Lineup stats sheet, player removed, slot freed immediately |
| RA-08 | As a manager, I want a confirmation before dropping so I don't drop by accident | Confirmation popup with consequences: cooldown, roster impact, no refund, deadline |
| RA-09 | As a manager, I want to know when a dropped player becomes available for bidding | 24hr cooldown displayed in Available tab, activity feed logs "Bids open" time |

### 2.3 Manager — Fund & Bid Management

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| RA-10 | As a manager, I want to see my fund breakdown at all times so I know what I can afford | Budget bar shows Available / Locked / Roster on every auction screen |
| RA-11 | As a manager, I want to see my active bids and their status so I can track them | My Bids tab shows Active (Winning/Outbid), Won, Lost sections |
| RA-12 | As a manager, I want my funds released immediately when outbid so I can bid on someone else | Escrow released on outbid, Available updated in real time |

### 2.4 Manager — Activity & Awareness

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| RA-13 | As a manager, I want to see all league auction activity so I know what's happening | Activity tab with real-time feed, filterable by All/My Activity/Bids/Drops/Results |
| RA-14 | As a manager, I want to know when I've been outbid so I can respond | Outbid events highlighted in red in activity feed |
| RA-15 | As a manager, I want to see auction settlement results so I know who won what | Results filter in Activity tab shows all settlements |

### 2.5 System — Auction Lifecycle

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| RA-16 | The system must open a new auction automatically each Saturday at GW start | Auction record created, AuctionPlayers populated, $2M top-up applied |
| RA-17 | The system must enforce anti-snipe protection so auctions end fairly | 30-min global extension on last-minute bids, max 3 extensions, hard stop 7:30 PM |
| RA-18 | The system must settle auctions automatically after close | Winners determined, funds transferred, TeamPlayer records created, losers refunded |
| RA-19 | The system must prevent invalid bids at all times | Validation: auction open, player available, increment valid, funds sufficient, slots available |

---

## 3. Updated Game Loop

The rolling auction adds a parallel track to the existing gameweek cycle:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        GAMEWEEK CYCLE (×14)                                  │
│                                                                              │
│  Saturday ─────────────────────────────────────────────────────── Friday     │
│                                                                              │
│  ┌─────────────────────────────┐    ┌──────────────────────────────────────┐ │
│  │      MATCH TRACK            │    │        AUCTION TRACK                 │ │
│  │                             │    │                                      │ │
│  │  GW start (Sat)             │    │  Auction opens (Sat)                 │ │
│  │  Lineup lock (1st match)    │    │  Bids accepted all week              │ │
│  │  IPL matches played         │    │  Drops accepted (until Thu 6PM)      │ │
│  │  Live scoring (5 min)       │    │  Auction closes (Fri 6PM)            │ │
│  │  Post-match scoring         │    │  Anti-snipe extensions (max 7:30PM)  │ │
│  │  GW aggregation             │    │  Settlement (Fri 7:30PM)             │ │
│  │  Leaderboard updated        │    │  Won players join roster for next GW │ │
│  │                             │    │                                      │ │
│  └─────────────────────────────┘    └──────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Interaction Points Between Tracks

| Event | Match Track Impact | Auction Track Impact |
|-------|-------------------|---------------------|
| Player won in auction | Available for next GW lineup | Funds deducted, roster slot filled |
| Player dropped | Removed from lineup immediately | Roster slot freed, player enters 24hr cooldown |
| GW starts (Saturday) | New lineup period begins | New auction cycle opens, $2M top-up |
| GW locks (1st match) | Lineup frozen for scoring | No impact — auction continues independently |

---

## 4. Auction Rules

### 4.1 Timing

```
    Sat          Sun          Mon          Tue          Wed          Thu          Fri
     |            |            |            |            |            |            |
     |<────────────────────── Auction Window Open ───────────────────>|            |
     |                                                                |            |
  Open          Bids flow freely                             Drop     Close    Settle
  +$2M                                                    deadline   6:00 PM  by 7:30 PM
  top-up                                                  (6:00 PM)  (+snipe)
```

| Rule | Value |
|------|-------|
| Window | Saturday GW start → Friday 6:00 PM EST (soft close) |
| Hard stop | Friday 7:30 PM EST (after max 3 anti-snipe extensions) |
| Anti-snipe trigger | Any bid placed in last 30 minutes before current deadline |
| Anti-snipe extension | +30 minutes, applied globally to all players |
| Max extensions | 3 |
| Drop deadline | Thursday 6:00 PM EST (for player to be biddable in same cycle) |
| Player cooldown | 24 hours after drop before bids accepted |

### 4.2 Bidding

| Rule | Value |
|------|-------|
| Minimum bid | $1M |
| Minimum increment | $1M above current highest |
| Bid denomination | Whole millions only (no fractions) |
| Bid withdrawal | Not allowed |
| Pricing | Pay what you bid (first-price) |
| Visibility | All bids visible to all managers |
| Max active bids | Equal to open roster slots (15 - current roster) |

### 4.3 Funds

| Parameter | Value |
|-----------|-------|
| Initial allocation | $25M per manager (one-time) |
| Weekly top-up | $2M per manager per GW start |
| Rollover | All unused funds carry over |
| Escrow | Only highest bidder's funds locked; released immediately when outbid |
| Won auction | Pay bid amount (Locked → Spent, permanent) |
| Dropped player | No refund of original purchase price |

### 4.4 Roster

| Parameter | Value |
|-----------|-------|
| Maximum | 15 players |
| Minimum (hard floor) | 11 players |
| Bench adapts | 15 = 4 bench, 14 = 3, 13 = 2, 12 = 1, 11 = 0 bench |
| Captain/VC drop | Must reassign before dropping Captain or VC |
| Lineup impact | Dropped player removed from current lineup; won player available next GW |

---

## 5. Auction Lifecycle — State Machine

```
                                         Any bid in last 30 min?
                                        ┌──── yes ────┐
                                        |             v
  ┌────────┐    Fri 6PM    ┌─────────┐  |  ┌─────────────────┐    Extensions
  │  OPEN  │ ─────────────>│ CLOSING │──┘  │ CLOSING         │    exhausted or
  │        │               │         │     │ (ext N, N<=3)   │    no bid in
  └────────┘               └─────────┘     └────────┬────────┘    last 30 min
       ^                                            │
       |                                            v
       |    Sat GW start              ┌─────────────────────────┐
       └──────────────────────────────│       SETTLED           │
              (new cycle)             │  Winners determined      │
                                      │  Funds transferred       │
                                      │  Players assigned        │
                                      └─────────────────────────┘
```

### Settlement Pipeline

```
SETTLED trigger (currentDeadline reached, no extension needed)
    │
    ├── 1. Set Auction.status = SETTLED
    │
    ├── 2. For each AuctionPlayer with bids:
    │      ├── Find highest Bid (max amount, earliest timestamp for ties)
    │      ├── Set Bid.status = WON
    │      ├── Set all other Bids.status = LOST
    │      ├── Create TeamPlayer (winner team + player)
    │      ├── ManagerFund: Locked -= amount, Spent += amount
    │      └── All losing bidders: ManagerFund: Locked -= their amount, Available += their amount
    │
    ├── 3. Log settlement events to activity feed
    │
    └── 4. Auction complete — new OPEN auction created at next GW start
```

---

## 6. Player Availability — State Machine

```
                     ┌──────────────┐
       Unowned       │  AVAILABLE   │ <──── Cooldown expires (24hr)
       at season     │  (biddable)  │ <──── Not won in previous cycle
       start ───────>│              │
                     └──────┬───────┘
                            │
                     Bid placed on player
                            │
                            v
                     ┌──────────────┐
                     │  AVAILABLE   │     (still available, just has active bids)
                     │  (has bids)  │
                     └──────┬───────┘
                            │
                     Auction settles, highest bidder wins
                            │
                            v
                     ┌──────────────┐
                     │    SOLD      │     Player joins winner's TeamPlayer
                     │              │     Removed from AuctionPlayer pool
                     └──────────────┘

                            --- OR ---

       Player on       Manager drops
       a roster  ────>  player from        ┌──────────────┐
                        Edit Lineup ─────> │   COOLDOWN    │
                                           │  (24hr wait)  │ ───── 24hr elapsed ─────> AVAILABLE
                                           └───────────────┘
```

---

## 7. Fund Flow — Complete Lifecycle

```
Season Start
    │
    v
ManagerFund created: { total: $25M, available: $25M, locked: $0, spent: $0 }
    │
    │  GW2 starts (+$2M top-up)
    v
{ total: $27M, available: $27M, locked: $0, spent: $0 }
    │
    │  Manager bids $5M on Player A
    v
{ total: $27M, available: $22M, locked: $5M, spent: $0 }
    │
    │  Manager bids $3M on Player B (2 open slots)
    v
{ total: $27M, available: $19M, locked: $8M, spent: $0 }
    │
    │  Outbid on Player A (someone bid $7M)
    v
{ total: $27M, available: $24M, locked: $3M, spent: $0 }
    │                                           ^
    │  (only Player B locked now)               │ $5M released immediately
    │
    │  Manager bids $8M on Player A (re-bid)
    v
{ total: $27M, available: $16M, locked: $11M, spent: $0 }
    │                            (Player A: $8M + Player B: $3M)
    │
    │  Settlement: Win Player A ($8M), Win Player B ($3M)
    v
{ total: $27M, available: $16M, locked: $0, spent: $11M }
    │
    │  GW3 starts (+$2M top-up)
    v
{ total: $29M, available: $18M, locked: $0, spent: $11M }
    │
    │  ... and so on through the season
    v
```

---

## 8. Bid Slot Constraint — Walkthrough

The number of active highest bids a manager can hold is limited by their open roster slots.

```
Starting state: Roster 13/15, Open slots = 2

Action: Bid $4M on Bumrah (highest bidder)
  → Active highest bids: 1, Open slots remaining for bids: 1

Action: Bid $5M on Kohli (highest bidder)
  → Active highest bids: 2, Open slots remaining for bids: 0
  → CANNOT place new bids until outbid on one or drop a player

Scenario A — Outbid on Kohli:
  → Active highest bids: 1, Open slots remaining for bids: 1
  → CAN bid again

Scenario B — Drop Jadeja from roster:
  → Roster: 12/15, Open slots: 3
  → Active highest bids: 2, Open slots remaining for bids: 1
  → CAN bid again (plus Jadeja enters 24hr cooldown)

Scenario C — Win both at settlement:
  → Roster: 15/15, Open slots: 0
  → Next week: cannot bid unless drops someone first
```

---

## 9. Screen Inventory

| Screen | Entry Point | Purpose |
|--------|------------|---------|
| Auction Hub — Available | Bottom nav "Auction" | Browse unowned players, see bid activity, search/filter |
| Auction Hub — Activity | Tab within Auction Hub | Real-time feed of all auction events, filterable |
| Player Bid Sheet | Tap player card in Available | View/place bids, see history, Full Profile button |
| My Bids — Bids | Tab within Auction Hub | Track active/won/lost bids |
| My Bids — Pitch View | Sub-tab within My Bids | View current GW lineup on cricket field |
| My Bids — List View | Sub-tab within My Bids | View current GW lineup as list with stats |
| Drop Player | Edit Lineup → tap player → stats sheet | New "Drop from Roster" button below Substitute + Full Profile |
| Drop Confirmation | Tap "Drop from Roster" | Centered popup with consequences and confirm/cancel |

### Navigation Flow

```
Bottom Nav
    │
    ├── Home (existing)
    ├── Lineup (existing)
    │      └── Edit Lineup → Stats Sheet → [Drop from Roster] → Drop Confirmation
    ├── Auction (NEW)
    │      ├── Available tab
    │      │      └── Player card → Bid Sheet → [Full Profile]
    │      ├── My Bids tab
    │      │      ├── Bids (active/won/lost)
    │      │      ├── Pitch View (GW lineup)
    │      │      └── List View (GW lineup)
    │      └── Activity tab
    │             └── Filters: All | My Activity | Bids | Drops | Results
    ├── Players (existing)
    └── League (existing)
```

---

## 10. Acceptance Criteria — End-to-End Scenarios

### Scenario 1: Full Auction Cycle

```
Given:  Manager A has roster 13/15, Available $19M, Locked $4M (highest on Bumrah)
        Manager B has roster 14/15, Available $10M

When:   Manager B bids $5M on Kohli
Then:   Kohli shows "Highest: Manager B · $5M" for all managers
        Manager B: Available $5M, Locked $5M

When:   Manager A bids $7M on Kohli
Then:   Manager B: Locked $0, Available $10M (released)
        Manager A: Available $12M, Locked $11M (Bumrah $4M + Kohli $7M)
        Manager A has 2 active highest bids = 2 open slots, cannot bid more

When:   Friday 6:00 PM arrives, no bids in last 30 min
Then:   Auction status → SETTLED
        Manager A wins Bumrah ($4M) and Kohli ($7M)
        Manager A: Roster 15/15, Available $12M, Locked $0, Spent $11M
        Both players available for Manager A's next GW lineup
```

### Scenario 2: Anti-Snipe Extension

```
Given:  Auction deadline is Friday 6:00 PM, 0 extensions used

When:   Manager C bids $3M on Head at 5:45 PM
Then:   Deadline extends to 6:30 PM (extension 1)
        ALL players' auctions extended, not just Head

When:   Manager D bids $4M on Head at 6:25 PM
Then:   Deadline extends to 7:00 PM (extension 2)

When:   Manager C bids $5M on Head at 6:55 PM
Then:   Deadline extends to 7:30 PM (extension 3, FINAL)

When:   7:30 PM arrives
Then:   Hard stop — no more bids, proceed to settlement regardless
```

### Scenario 3: Drop and Re-acquire

```
Given:  Manager A has Jadeja on roster, roster 13/15
        Current time: Wednesday 10:00 AM

When:   Manager A drops Jadeja from Edit Lineup
Then:   Jadeja removed from Manager A's TeamPlayer (isActive=false)
        Jadeja enters COOLDOWN, cooldownUntil = Thursday 10:00 AM
        Manager A: Roster 12/15, gains 1 open bid slot
        Activity feed: "Team A dropped Ravindra Jadeja"

When:   Thursday 10:00 AM arrives (24hr cooldown expired)
Then:   Jadeja status → AVAILABLE
        Activity feed: "Ravindra Jadeja now available for bidding"
        Any manager (including Manager A) can bid on Jadeja

Note:   If Manager A had dropped Jadeja on Friday at 7:00 PM,
        cooldown would expire Saturday 7:00 PM — too late for
        current cycle, available in next week's auction
```

---

## 11. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Bid placement response time | < 500ms |
| Concurrent bid handling | Atomic transactions, no double-spend |
| Fund consistency | Available + Locked + Spent = Total at all times |
| Activity feed latency | < 5 seconds for bid events to appear |
| Data refresh on Auction Hub | Polling every 30 seconds (or SSE) |
| Settlement completion | < 60 seconds for full pipeline |
| Mobile viewport | 390px width, touch targets >= 44px |
| Offline resilience | Graceful error on bid if offline, retry on reconnect |

---

## 12. Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Race condition on bid placement | Two managers bid simultaneously, both succeed | Atomic DB transactions with row-level locking |
| Settlement runs during scoring cron | Data inconsistency | Settlement finishes by 7:30 PM; scoring starts Saturday |
| Manager drops player mid-GW who is in current lineup | Lineup becomes invalid | Dropped player removed from lineup immediately; bench auto-adjusts |
| Free-tier DB connection limits | Settlement pipeline timeout | Batch operations, connection pooling |
| Anti-snipe cron misses a window | Extension not applied | 1-min polling frequency; fallback: manual admin trigger |

---

## 13. Future Considerations (Not in Scope)

These are documented for context but explicitly excluded from this release:

| Feature | Reason for Deferral |
|---------|-------------------|
| Push notifications (outbid, won, settlement) | Requires service worker setup, deferred to Phase 3 |
| Trade/swap between managers | Adds significant complexity, evaluate after rolling auction adoption |
| Variable bid increments (% of current) | A/B test candidate — start with fixed $1M |
| Accumulating fund model ($5M/week, no lump sum) | A/B test candidate — start with $25M + $2M/week |
| Auction for specific player categories only | All unowned players available; curation adds admin burden |
| Salary cap / wage structure | Overly complex for current league size |

---

## 14. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Auction participation rate | > 80% of managers place at least 1 bid per cycle | Bid records per manager per auction |
| Roster staleness reduction | Average roster changes per manager > 1 per 3 GWs | TeamPlayer creation/deactivation rate |
| Engagement retention | < 10% of managers inactive for 2+ consecutive GWs | Lineup submission + bid activity tracking |
| Auction competitiveness | Average bids per won player > 2 | Bid count per settled AuctionPlayer |
| Fund utilization | > 50% of total funds spent or locked by mid-season | ManagerFund.spent + locked / total |
