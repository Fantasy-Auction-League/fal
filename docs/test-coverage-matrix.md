# FAL Test Coverage Matrix

## Overview

This document maps every testable PRD requirement to its test coverage status.

**Legend:**
- COVERED = test exists and verifies this requirement
- PARTIAL = tested at unit level but not end-to-end with real data
- NOT COVERED = no test exists
- GAP/BUG = test needed, implementation may also need fixing

---

## 1. Scoring Rules

### 1.1 Batting (PRD Section 6.1)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 1.1.1 | +1 per run | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.2 | +4 per four | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.3 | +6 per six | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.4 | 25-run milestone: +4 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.5 | 50-run milestone: +8 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.6 | 75-run milestone: +12 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.7 | Century (100+): +16 replaces all lower milestones | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.8 | Duck penalty: -2 (0 runs, 1+ balls, dismissed, not bowler) | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.9 | Duck exempt for bowlers | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.10 | SR bonus >170: +6 (min 10 balls, bowlers exempt) | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.11 | SR bonus 150-170: +4 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.12 | SR bonus 130-150: +2 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.13 | SR penalty 60-70: -2 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.14 | SR penalty 50-60: -4 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.15 | SR penalty <50: -6 | COVERED | `tests/unit/scoring-batting.test.ts` |
| 1.1.16 | Batting points verified against real IPL match data | NOT COVERED | *Proposed: layer8* |

### 1.2 Bowling (PRD Section 6.2)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 1.2.1 | +1 per dot ball | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.2 | +30 per wicket | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.3 | +8 LBW/Bowled bonus (stacks with wicket) | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.4 | 3-wicket bonus: +4 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.5 | 4-wicket bonus: +8 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.6 | 5-wicket bonus: +12 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.7 | Wicket bonuses do NOT stack | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.8 | +12 per maiden over | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.9 | Economy <5: +6 (min 2 overs) | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.10 | Economy 5-5.99: +4 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.11 | Economy 6-7: +2 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.12 | Economy 10-11: -2 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.13 | Economy 11-12: -4 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.14 | Economy >12: -6 | COVERED | `tests/unit/scoring-bowling.test.ts` |
| 1.2.15 | Bowling points verified against real IPL match data | NOT COVERED | *Proposed: layer8* |

### 1.3 Fielding (PRD Section 6.3)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 1.3.1 | +8 per catch | COVERED | `tests/unit/scoring-fielding.test.ts` |
| 1.3.2 | +4 one-time bonus for 3+ catches | COVERED | `tests/unit/scoring-fielding.test.ts` |
| 1.3.3 | +12 per stumping | COVERED | `tests/unit/scoring-fielding.test.ts` |
| 1.3.4 | +12 per direct runout | COVERED | `tests/unit/scoring-fielding.test.ts` |
| 1.3.5 | +6 per assisted runout | COVERED | `tests/unit/scoring-fielding.test.ts` |
| 1.3.6 | Fielding points verified against real IPL match data | NOT COVERED | *Proposed: layer8* |

### 1.4 Participation Bonuses (PRD Section 6.4)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 1.4.1 | +4 Starting XI bonus | COVERED | `tests/unit/scoring-multipliers.test.ts` |
| 1.4.2 | +4 Impact Player (substitute) bonus | COVERED | `tests/unit/scoring-multipliers.test.ts` |
| 1.4.3 | Impact player identified correctly from API data | PARTIAL | `tests/integration/scoring-pipeline.test.ts` |

---

## 2. Captain & Vice Captain (PRD Section 6.5)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 2.1 | Captain gets 2x total GW points | COVERED | `tests/unit/scoring-multipliers.test.ts` |
| 2.2 | VC gets 1x when Captain played | COVERED | `tests/unit/scoring-multipliers.test.ts` |
| 2.3 | VC promoted to 2x when Captain absent | COVERED | `tests/unit/scoring-multipliers.test.ts`, `tests/simulation/layer5-edge-cases.test.ts` |
| 2.4 | Both Captain and VC absent: no multipliers | COVERED | `tests/simulation/layer5-edge-cases.test.ts` |
| 2.5 | Captain/VC multipliers applied with real scored data | NOT COVERED | *Proposed: layer6/7* |

---

## 3. Strategy Chips (PRD Section 7)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 3.1 | POWER_PLAY_BAT doubles BAT-role player points | PARTIAL | `tests/unit/scoring-multipliers.test.ts` (synthetic data) |
| 3.2 | BOWLING_BOOST doubles BOWL-role player points | PARTIAL | `tests/unit/scoring-multipliers.test.ts` (synthetic data) |
| 3.3 | Each chip usable only once per season | COVERED | `tests/simulation/layer2-lineups.test.ts` (DB constraint) |
| 3.4 | Only one chip per gameweek | PARTIAL | DB unique constraint exists, no explicit test |
| 3.5 | Chip + Captain stacking (2x * 2x = 4x) | PARTIAL | `tests/unit/scoring-multipliers.test.ts` (synthetic), `tests/simulation/layer5-edge-cases.test.ts` |
| 3.6 | Chip must be activated before GW lock time | NOT COVERED | *Proposed: layer9* |
| 3.7 | Chip status transitions PENDING -> USED after aggregation | COVERED | `tests/simulation/layer4-aggregation.test.ts` |
| 3.8 | Chip effects verified with real IPL scored data | NOT COVERED | *Proposed: layer7* |
| 3.9 | Used chip permanently unavailable | COVERED | DB unique constraint `@@unique([teamId, chipType])` |
| 3.10 | POWER_PLAY_BAT does not affect BOWL/ALL/WK players | NOT COVERED | *Proposed: layer7* |
| 3.11 | BOWLING_BOOST does not affect BAT/ALL/WK players | NOT COVERED | *Proposed: layer7* |

---

## 4. Bench Auto-Substitution (PRD Section 5.3)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 4.1 | XI player absent -> replaced by bench in priority order | COVERED | `tests/unit/scoring-multipliers.test.ts`, `tests/simulation/layer5-edge-cases.test.ts` |
| 4.2 | Bench player must have played to substitute in | COVERED | `tests/simulation/layer5-edge-cases.test.ts` |
| 4.3 | No double-dipping (each bench player used once) | COVERED | `tests/unit/scoring-multipliers.test.ts` |
| 4.4 | All bench absent -> slot scores 0 | COVERED | `tests/simulation/layer5-edge-cases.test.ts` |
| 4.5 | Captain absent + bench sub fills XI + VC promoted to 2x | COVERED | `tests/simulation/layer5-edge-cases.test.ts` |

---

## 5. Gameweek Flow (PRD Section 4)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 5.1 | Gameweek status: UPCOMING -> ACTIVE -> COMPLETED | COVERED | `tests/simulation/layer4-aggregation.test.ts` |
| 5.2 | Aggregation status: PENDING -> AGGREGATING -> DONE | COVERED | `tests/simulation/layer4-aggregation.test.ts` |
| 5.3 | Lineup locked at GW lock time | COVERED | `tests/integration/lineup-validation.test.ts` |
| 5.4 | Multi-match accumulation: player points summed before multipliers | NOT COVERED | *Proposed: layer9* |
| 5.5 | Lineup carry-forward: no submission = previous GW lineup | GAP/BUG | *Proposed: layer9 — PRD says carry-forward, code skips (scores 0)* |
| 5.6 | GW-by-GW progression with cumulative totals | NOT COVERED | *Proposed: layer6* |
| 5.7 | bestGwScore updated correctly | NOT COVERED | *Proposed: layer6* |
| 5.8 | Re-aggregation idempotency (running twice doesn't double-count) | GAP/BUG | *Proposed: layer9 — `pipeline.ts:464` uses `{ increment }` which double-counts* |

---

## 6. Leaderboard & Rankings (PRD Section 8)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 6.1 | Primary sort: total season points (descending) | COVERED | `tests/simulation/layer4-aggregation.test.ts` |
| 6.2 | Tiebreaker: highest single GW score (descending) | NOT COVERED | *Proposed: layer9* |
| 6.3 | Leaderboard evolves correctly GW-by-GW | NOT COVERED | *Proposed: layer6* |

---

## 7. Lineup Management (PRD Section 5)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 7.1 | Playing XI: exactly 11 players | COVERED | `tests/simulation/layer2-lineups.test.ts` |
| 7.2 | Bench: 1-4 players with priority order | COVERED | `tests/simulation/layer2-lineups.test.ts` |
| 7.3 | Captain and VC must be different players | COVERED | `tests/simulation/layer2-lineups.test.ts` |
| 7.4 | Captain and VC must be from XI (not bench) | COVERED | `tests/simulation/layer2-lineups.test.ts` |
| 7.5 | Lineup cannot be modified after GW lock time | COVERED | `tests/integration/lineup-validation.test.ts` |

---

## 8. League & Team Management (PRD Section 3)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 8.1 | Player uniqueness within league (one team only) | COVERED | `tests/simulation/layer1-roster.test.ts` |
| 8.2 | Squad size 12-15 players | COVERED | `tests/simulation/layer1-roster.test.ts` |
| 8.3 | 10 teams seeded correctly | COVERED | `tests/simulation/layer1-roster.test.ts` |
| 8.4 | Admin can upload rosters via CSV | COVERED | `tests/integration/roster-upload.test.ts` |

---

## 9. Data Ingestion (PRD Section 9)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 9.1 | SportMonks API scorecard fetch | COVERED | `tests/integration/scoring-pipeline.test.ts` |
| 9.2 | All 74 IPL 2025 matches scored | COVERED | `tests/simulation/layer3-scoring.test.ts` |
| 9.3 | Match scoring status flow (SCHEDULED -> SCORED) | COVERED | `tests/simulation/layer3-scoring.test.ts` |
| 9.4 | Super over innings filtered out | COVERED | `tests/simulation/layer5-edge-cases.test.ts` |
| 9.5 | Abandoned/cancelled match handling | COVERED | `tests/simulation/layer5-edge-cases.test.ts` |
| 9.6 | Scoring error after 3 failed attempts | PARTIAL | Pipeline code handles it, no dedicated test |

---

## 10. Authentication & Account (PRD Section 2)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 10.1 | Email-based login | COVERED | `tests/simulation/playwright/layer0.spec.ts` |
| 10.2 | Password minimum 6 characters | COVERED | `tests/simulation/playwright/layer0.spec.ts` |
| 10.3 | League join via invite code | COVERED | `tests/simulation/playwright/layer0.spec.ts` |
| 10.4 | Returning user login (no invite code needed) | COVERED | `tests/simulation/playwright/layer0.spec.ts` |
| 10.5 | Case-insensitive email handling | NOT COVERED | *Fix in PR #14, no test yet* |
| 10.6 | Multi-league support / league switching | COVERED | `tests/simulation/playwright/layer0.spec.ts` |

---

## 11. UI/UX Smoke Tests (Playwright)

| # | Requirement | Status | Test File |
|---|-------------|--------|-----------|
| 11.1 | Dashboard loads with GW score | COVERED | `layer0.spec.ts` |
| 11.2 | Lineup pitch view | COVERED | `layer0.spec.ts` |
| 11.3 | Lineup list view | COVERED | `layer0.spec.ts` |
| 11.4 | Player browser | COVERED | `layer0.spec.ts` |
| 11.5 | Player detail modal | COVERED | `layer0.spec.ts` |
| 11.6 | Leaderboard page | COVERED | `layer0.spec.ts` |
| 11.7 | Standings page | COVERED | `layer0.spec.ts` |
| 11.8 | Admin page | COVERED | `layer0.spec.ts` |
| 11.9 | Substitution flow (full squad view) | COVERED | `layer0.spec.ts` |
| 11.10 | League switcher | COVERED | `layer0.spec.ts` |

---

## Summary

| Category | Total | Covered | Partial | Not Covered | Gap/Bug |
|----------|-------|---------|---------|-------------|---------|
| Batting scoring | 16 | 15 | 0 | 1 | 0 |
| Bowling scoring | 15 | 14 | 0 | 1 | 0 |
| Fielding scoring | 6 | 5 | 0 | 1 | 0 |
| Participation bonuses | 3 | 2 | 1 | 0 | 0 |
| Captain/VC | 5 | 4 | 0 | 1 | 0 |
| Chips | 11 | 3 | 3 | 5 | 0 |
| Bench auto-sub | 5 | 5 | 0 | 0 | 0 |
| Gameweek flow | 8 | 3 | 0 | 3 | 2 |
| Leaderboard | 3 | 1 | 0 | 2 | 0 |
| Lineup management | 5 | 5 | 0 | 0 | 0 |
| League/team mgmt | 4 | 4 | 0 | 0 | 0 |
| Data ingestion | 6 | 4 | 1 | 0 | 1 |
| Auth/account | 6 | 4 | 0 | 1 | 1 |
| UI/UX smoke | 10 | 10 | 0 | 0 | 0 |
| **TOTAL** | **103** | **79** | **5** | **15** | **4** |

**Current coverage: 77% covered, 5% partial, 15% not covered, 4% gap/bug**

### Path to 100% Coverage (Layers 6-9)

| Layer | Tests | Requirements Covered | Cumulative |
|-------|-------|---------------------|------------|
| Existing L0-L5 | ~141+ | 79 + 5 partial | 84/103 |
| **Layer 8** (point audit) | 4 tests | 1.1.16, 1.2.15, 1.3.6, 1.4.3 | 88/103 |
| **Layer 6** (GW progression) | 10 tests | 2.5, 5.6, 5.7, 6.3, 10.5 | 93/103 |
| **Layer 7** (chip integration) | 9 tests | 3.1, 3.2, 3.4, 3.5, 3.8, 3.10, 3.11 | 100/103 |
| **Layer 9** (PRD gaps) | 6 tests | 3.6, 5.4, 5.5, 5.8, 6.2, 9.6 | **103/103** |

### Bugs That Layer 9 Will Expose (TDD Red Phase)

| Bug | Location | Fix Required |
|-----|----------|-------------|
| Re-aggregation doubles `totalPoints` | `pipeline.ts:464` `{ increment: teamTotal }` | Replace with absolute calculation from `SUM(GameweekScore)` |
| No lineup carry-forward | `pipeline.ts:401` `if (!lineup) continue` | Clone previous GW lineup if none submitted |
| No chip lock-time enforcement | chip API POST handler | Add `lockTime` check before activation |

After implementing layers 6-9 + bug fixes: **103/103 = 100% coverage**

---

## 12. Unhappy Paths & Edge Cases (Not in Original 103)

The following are additional edge cases, error conditions, and unhappy paths discovered from reviewing the PRD, API routes, scoring pipeline, and SportMonks API integration. These go beyond the 103 core requirements.

### 12.1 Authentication & Login Edge Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.1.1 | Invalid password returns 401 | COVERED | `layer0.spec.ts` test 20 |
| 12.1.2 | Password < 6 chars returns 400 | COVERED | `layer0.spec.ts` test 21 |
| 12.1.3 | Missing email returns 400 | NOT COVERED | `login/route.ts:7` handles it, no test |
| 12.1.4 | Invalid invite code returns 400 | NOT COVERED | `login/route.ts:68` handles it, no test |
| 12.1.5 | Invalid admin secret returns 400 | NOT COVERED | `login/route.ts:12` handles it, no test |
| 12.1.6 | Legacy user without password — sets password on first login | NOT COVERED | `login/route.ts:28-33` handles it, no test |
| 12.1.7 | User with no leagues and no admin role rejected without invite code | NOT COVERED | `login/route.ts:148` — this was the Shaheel bug |
| 12.1.8 | Concurrent login attempts (race condition on password hash) | NOT COVERED | Low priority |

### 12.2 League Management Edge Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.2.1 | League full (>= maxManagers) — join rejected 409 | NOT COVERED | `leagues/join/route.ts` handles it |
| 12.2.2 | Already a member — returns 201 with `alreadyMember: true` | NOT COVERED | `leagues/join/route.ts` handles it |
| 12.2.3 | Admin cannot remove self | NOT COVERED | `managers/[userId]/route.ts` handles it |
| 12.2.4 | Invite code collision retry on league create | NOT COVERED | `leagues/route.ts` has while loop |
| 12.2.5 | Season start with < 2 teams returns 422 | NOT COVERED | `admin/season/start/route.ts` |
| 12.2.6 | Season start with incomplete rosters returns 422 | NOT COVERED | `admin/season/start/route.ts` |
| 12.2.7 | Season already started returns 409 | NOT COVERED | `admin/season/start/route.ts` |
| 12.2.8 | Empty league name rejected | NOT COVERED | `leagues/route.ts` validates trim |

### 12.3 Lineup Validation Edge Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.3.1 | Only 10 XI players — rejected | COVERED | `lineup-validation.test.ts` |
| 12.3.2 | Two captains — rejected | COVERED | `lineup-validation.test.ts` |
| 12.3.3 | Captain == VC (same player) — rejected | COVERED | `lineup-validation.test.ts` |
| 12.3.4 | Player not in squad — rejected | COVERED | `lineup-validation.test.ts` |
| 12.3.5 | Duplicate player in lineup — rejected | COVERED | `lineup-validation.test.ts` |
| 12.3.6 | Lineup submission after GW lock returns 423 | COVERED | `lineup-validation.test.ts` |
| 12.3.7 | Lineup PUT by non-owner returns 403 | NOT COVERED | `lineups/[gameweekId]/route.ts` checks ownership |
| 12.3.8 | Bench priority gaps (e.g. 1,3 missing 2) | NOT COVERED | `validation.ts` checks sequential |
| 12.3.9 | Empty lineup (0 slots) submitted | NOT COVERED | Code skips empty lineups at aggregation |

### 12.4 Chip API Edge Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.4.1 | Invalid chip type returns 400 | NOT COVERED | `chip/route.ts` validates against VALID_CHIPS |
| 12.4.2 | Chip already used this season returns 409 | NOT COVERED | `chip/route.ts` catches unique constraint |
| 12.4.3 | Chip deactivation of non-existent chip returns 404 | NOT COVERED | `chip/route.ts` checks PENDING status |
| 12.4.4 | Chip deactivation after GW lock returns 423 | NOT COVERED | `chip/route.ts` checks lock |
| 12.4.5 | Chip activation by non-team-owner returns 403 | NOT COVERED | `chip/route.ts` checks ownership |

### 12.5 Scoring Pipeline Edge Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.5.1 | Player in API but not in DB — skipped | NOT COVERED | `pipeline.ts` skips unknown apiPlayerIds |
| 12.5.2 | Empty batting/bowling arrays from API | NOT COVERED | `fetchScorecard` returns `[]` fallback |
| 12.5.3 | Match with no lineup data from API | NOT COVERED | Would fail to determine Starting XI |
| 12.5.4 | Stuck gameweek in AGGREGATING state (aggregation fails) | NOT COVERED | No recovery mechanism tested |
| 12.5.5 | Concurrent scoring of same match (atomic lock) | NOT COVERED | `UPDATE...WHERE status='COMPLETED'` prevents this |
| 12.5.6 | Match recalculation (admin re-triggers scoring) | NOT COVERED | `scoring/recalculate/[matchId]/route.ts` |
| 12.5.7 | Match cancellation by admin | NOT COVERED | `scoring/cancel/[matchId]/route.ts` |
| 12.5.8 | Captain as Impact Sub counts as "played" | NOT COVERED | Captain appears as sub, not starting XI — VC should NOT be promoted |
| 12.5.9 | Player with negative total points (duck + low SR + high ER) | NOT COVERED | Valid edge case: -2 duck + -6 SR + -6 ER = -14 points |

### 12.6 SportMonks API Edge Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.6.1 | API timeout (10s) — request aborted | NOT COVERED | `client.ts:19` has AbortController |
| 12.6.2 | API returns non-200 status | NOT COVERED | `client.ts:23` throws on !res.ok |
| 12.6.3 | API token missing — throws on construction | NOT COVERED | `client.ts:8` |
| 12.6.4 | Cricket overs notation (4.2 = 4 overs 2 balls) | COVERED | `scoring-bowling.test.ts` tests `oversToDecimal` |
| 12.6.5 | Position name mapping edge cases (unknown position → ALL) | NOT COVERED | `utils.ts:27` defaults to ALL |
| 12.6.6 | Fixture with no matches in a Sat-Fri window — skipped | NOT COVERED | `fixtures.ts:92` only creates GW if matches exist |
| 12.6.7 | Empty season (0 fixtures) — throws error | NOT COVERED | `fixtures.ts:116` throws |
| 12.6.8 | Ball-by-ball data missing (includeBalls=false) | PARTIAL | Default is false; dot ball scoring depends on it |
| 12.6.9 | Scorecard with null batting/bowling/lineup arrays | NOT COVERED | `fetchScorecard` uses `|| []` fallback |
| 12.6.10 | Team API ID not in IPL_TEAMS lookup — returns null | NOT COVERED | `utils.ts:46` returns undefined |

### 12.7 Roster Upload Edge Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.7.1 | Empty CSV body returns 400 | NOT COVERED | `roster/route.ts` validates |
| 12.7.2 | CSV with player not found in DB | NOT COVERED | Collects errors, continues |
| 12.7.3 | Duplicate player across teams in same upload | NOT COVERED | Rejects entire upload |
| 12.7.4 | Squad below minSquadSize | NOT COVERED | Validation error |
| 12.7.5 | Squad above maxSquadSize | NOT COVERED | Validation error |
| 12.7.6 | Non-admin attempts roster upload returns 403 | NOT COVERED | Route checks admin role |
| 12.7.7 | Negative purchase price in CSV | NOT COVERED | parseFloat allows it, no validation |

### 12.8 Scoring Boundary Cases

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.8.1 | Exactly 99 runs (stacks 25+50+75 = +24, no century) | COVERED | `layer5-edge-cases.test.ts` |
| 12.8.2 | Exactly 100 runs (only +16, replaces lower) | COVERED | `layer5-edge-cases.test.ts` |
| 12.8.3 | SR exactly 170 (which bucket?) | NOT COVERED | Boundary: is 170 in >170 or 150-170? |
| 12.8.4 | SR exactly 130 (which bucket?) | NOT COVERED | Boundary: is 130 in 130-150 or 70-130? |
| 12.8.5 | SR exactly 50 (which bucket?) | NOT COVERED | Boundary: is 50 in 50-60 or <50? |
| 12.8.6 | ER exactly 7.00 (which bucket?) | NOT COVERED | Boundary: is 7.00 in 6-7 or 7-10? |
| 12.8.7 | ER exactly 10.00 (which bucket?) | NOT COVERED | Boundary: is 10.00 in 7-10 or 10-11? |
| 12.8.8 | ER exactly 12.00 (which bucket?) | NOT COVERED | Boundary: is 12.00 in 11-12 or >12? |
| 12.8.9 | Player scores 0 with 0 balls faced (did not bat) — no duck | COVERED | `scoring-batting.test.ts` |
| 12.8.10 | Duck with wicketId 84 (Not Out) — no penalty | COVERED | `scoring-batting.test.ts` |
| 12.8.11 | Duck with wicketId 138 (Retired Out) — no penalty | COVERED | `scoring-batting.test.ts` |
| 12.8.12 | Captain scores 0 points (2x of 0 = 0) | NOT COVERED | Valid scenario |

### 12.9 Concurrency & Race Conditions

| # | Edge Case | Status | Notes |
|---|-----------|--------|-------|
| 12.9.1 | Two users join league simultaneously when at capacity | NOT COVERED | Race on fullness check |
| 12.9.2 | Two admins trigger scoring simultaneously | NOT COVERED | Atomic lock via UPDATE...WHERE prevents |
| 12.9.3 | Cron fires during admin import trigger | NOT COVERED | Same atomic lock, but untested |
| 12.9.4 | Two admins upload roster simultaneously | NOT COVERED | Delete-then-insert in transaction |

---

## Updated Summary (Including Edge Cases)

| Category | Total | Covered | Not Covered |
|----------|-------|---------|-------------|
| **Core PRD requirements (Sections 1-11)** | **103** | **79** | **24** |
| Auth/login edge cases (12.1) | 8 | 2 | 6 |
| League management edge cases (12.2) | 8 | 0 | 8 |
| Lineup validation edge cases (12.3) | 9 | 6 | 3 |
| Chip API edge cases (12.4) | 5 | 0 | 5 |
| Scoring pipeline edge cases (12.5) | 9 | 0 | 9 |
| SportMonks API edge cases (12.6) | 10 | 1 | 9 |
| Roster upload edge cases (12.7) | 7 | 0 | 7 |
| Scoring boundary cases (12.8) | 12 | 5 | 7 |
| Concurrency/race conditions (12.9) | 4 | 0 | 4 |
| **Edge cases subtotal** | **72** | **14** | **58** |
| **GRAND TOTAL** | **175** | **93** | **82** |

### Priority Tiers for Edge Case Coverage

**P0 — Must have (data integrity / scoring correctness):**
- 12.5.8: Captain as Impact Sub counts as "played"
- 12.5.9: Player with negative total points
- 12.8.3-12.8.8: SR/ER boundary values (6 tests)
- 12.5.4: Stuck AGGREGATING state recovery
- 12.8.12: Captain scores 0 (2x of 0)

**P1 — Should have (API error handling):**
- 12.1.3-12.1.7: Login error path tests (5 tests)
- 12.4.1-12.4.5: Chip API error paths (5 tests)
- 12.6.1-12.6.3: SportMonks client error handling (3 tests)
- 12.5.1: Unknown player in API skipped
- 12.5.6-12.5.7: Admin recalculate/cancel match

**P2 — Nice to have (defensive):**
- 12.2.1-12.2.8: League management error paths (8 tests)
- 12.7.1-12.7.7: Roster upload validation (7 tests)
- 12.3.7-12.3.9: Lineup edge cases (3 tests)
- 12.6.5-12.6.10: SportMonks data edge cases (6 tests)

**P3 — Future consideration:**
- 12.9.1-12.9.4: Concurrency/race conditions (4 tests) — hard to test reliably
