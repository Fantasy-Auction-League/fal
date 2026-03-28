# Human Test Plan: Server-Side Lineup Carry-Forward

## Prerequisites

- Local development environment running (`npm run dev` or equivalent)
- Database seeded with at least 15 players (`npx prisma db seed`)
- Unit tests passing: `npx vitest run tests/unit/ensure-lineups.test.ts`
- Integration tests passing: `npx vitest run tests/integration/ensure-lineups.test.ts` (requires seeded DB)
- Access to Vercel staging deployment dashboard
- Access to production database (read-only) for post-deploy verification

## Phase 1: Code Review -- Transaction Boundary (AC3.1)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `lib/scoring/pipeline.ts` and locate the `aggregateGameweek` function | Function exists and is exported |
| 2 | Find the `prisma.$transaction` call (line 398) | Transaction block starts with `await prisma.$transaction(async (tx) => {` |
| 3 | Verify `ensureLineups(tx, teams, gameweekId)` is the first call inside the transaction body (line 400) | `ensureLineups` receives the transaction client `tx`, not the top-level `prisma` |
| 4 | Verify the scoring loop (`for (const team of teams)`) follows after `ensureLineups` completes (line 405) | Scoring loop is inside the same transaction, sequenced after `ensureLineups` |
| 5 | Verify `ensureLineups` function signature accepts a transaction client (line 500-501) | First parameter typed as `Parameters<Parameters<typeof prisma.$transaction>[0]>[0]>` |

## Phase 2: Staging Deployment -- Log Verification

| Step | Action | Expected |
|------|--------|----------|
| 1 | Deploy the branch to Vercel staging environment | Deployment succeeds, no build errors |
| 2 | Navigate to the Vercel dashboard for the staging deployment, open Function Logs | Logs view is accessible |
| 3 | Trigger a gameweek aggregation for a GW where at least one team has no lineup set (via admin API or cron trigger) | Aggregation function executes |
| 4 | Search logs for `ensureLineups:` prefix | Log lines appear showing carry-forward and/or auto-generate counts, e.g. `ensureLineups: 2 carried forward, 1 auto-generated` |
| 5 | If a team was carried forward, verify log contains team name and source GW number, e.g. `ensureLineups: carried forward Naughty Nuts from GW4` | Diagnostic log confirms which team and which GW was the source |
| 6 | If a team was auto-generated, verify log contains team name and captain name, e.g. `ensureLineups: auto-generated SomeTeam (captain: Virat Kohli)` | Diagnostic log confirms auto-generation with captain selection |

## Phase 3: Production Verification -- Vikram's Team (Naughty Nuts)

| Step | Action | Expected |
|------|--------|----------|
| 1 | After deploying to production, wait for the first GW aggregation to complete (triggered by cron or manual) | Aggregation completes without errors in Vercel logs |
| 2 | Query the production database: `SELECT * FROM "Lineup" WHERE "teamId" = (SELECT id FROM "Team" WHERE name = 'Naughty Nuts') ORDER BY "createdAt" DESC LIMIT 2` | A lineup exists for the most recently aggregated GW |
| 3 | Query lineup slots: `SELECT ls.* FROM "LineupSlot" ls JOIN "Lineup" l ON ls."lineupId" = l.id WHERE l."teamId" = (SELECT id FROM "Team" WHERE name = 'Naughty Nuts') AND l."gameweekId" = '<latest-gw-id>'` | 15 slots present: 11 XI + 4 BENCH, with CAPTAIN and VC assigned |
| 4 | Query gameweek score: `SELECT * FROM "GameweekScore" WHERE "teamId" = (SELECT id FROM "Team" WHERE name = 'Naughty Nuts') AND "gameweekId" = '<latest-gw-id>'` | `totalPoints > 0` |
| 5 | Query team total: `SELECT "totalPoints" FROM "Team" WHERE name = 'Naughty Nuts'` | `totalPoints` has increased from its pre-deploy value |

## End-to-End: Carry-Forward Across Multiple Gameweeks

**Purpose:** Validate that a lineup set in GW1 survives through GW2 and GW3 aggregation without user intervention, and that mid-season squad changes (player trades) are correctly reflected.

| Step | Action | Expected |
|------|--------|----------|
| 1 | In staging, create a league with one team. Add 15 players to the squad. Set a lineup for GW1 with a specific captain (not the highest-priced player). | Lineup saved with custom captain |
| 2 | Aggregate GW1. | GW1 scores computed using the set lineup |
| 3 | Do NOT set a lineup for GW2. Aggregate GW2. | GW2 lineup auto-created via carry-forward. Captain matches GW1 captain, not price-ordered. Scores computed. |
| 4 | Trade out the GW1 captain (remove from TeamPlayer). Do NOT set a lineup for GW3. Aggregate GW3. | GW3 lineup carried forward from GW2 but with the traded-out captain's slot excluded. Remaining 14 slots preserved. |
| 5 | Verify GW3 lineup has no CAPTAIN role assigned (the captain was removed). | The carried-forward lineup has 14 slots; no player has role CAPTAIN (the removed player's slot is dropped, not reassigned). |

## Human Verification Required

| Criterion | Why Manual | Steps |
|-----------|------------|-------|
| AC3.1 - ensureLineups runs inside $transaction before scoring loop | Structural code organization cannot be asserted at runtime; requires reading the source to confirm transactional integrity | Phase 1 steps 1-5 above |
| Vercel logs show carry-forward diagnostics | Log output format and presence depend on runtime environment and Vercel infrastructure; cannot be asserted in unit/integration tests | Phase 2 steps 1-6 above |
| Vikram's team (Naughty Nuts) scores points after deploy | Production data verification against real user data; depends on actual GW schedule and live player performances | Phase 3 steps 1-5 above |

## Traceability

| Acceptance Criterion | Automated Test | Manual Step |
|----------------------|----------------|-------------|
| AC1.1 - Carry-forward clones previous lineup | Unit: line 36, Integration: line 308 | E2E scenario steps 2-3 |
| AC1.2 - Most recent previous lineup | Unit: line 108 | E2E scenario step 3 (implicitly, GW2 lineup is source for GW3) |
| AC1.3 - Creates Lineup + LineupSlot records | Unit: line 564 | -- |
| AC1.4 - Skips team with existing lineup | Unit: line 153, Integration: line 554 | -- |
| AC1.5 - Removed player excluded | Unit: line 188 | E2E scenario steps 4-5 |
| AC2.1 - Auto-generate from squad | Unit: line 244, Integration: line 362 | -- |
| AC2.2 - XI/Bench by purchasePrice | Unit: line 306, Integration: line 362 | -- |
| AC2.3 - Captain = highest price | Unit: line 370, Integration: line 362 | -- |
| AC2.4 - Bench priority order | Unit: line 426, Integration: line 362 | -- |
| AC2.5 - Skip team with no squad | Unit: line 483, Integration: line 471 | -- |
| AC2.6 - Carry-forward takes precedence | Unit: line 512, Integration: line 699 | E2E scenario step 3 |
| AC3.1 - Transaction boundary | -- | Phase 1: code review |
| AC3.2 - Pipeline produces scores | Integration: lines 308, 362 | Phase 3: production DB queries |
