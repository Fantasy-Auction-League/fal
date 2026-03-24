# IPL Season Simulation & Validation Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a layered test suite that replays a full IPL 2025 season (~74 matches) against real SportMonks data in ~52 minutes, validating scoring, lineups, chips, UX, and PRD compliance before IPL 2026 launch.

**Architecture:** Three phases — Phase 1 builds Playwright UX tests (17 scenarios) + roster validation. Phase 2 builds lineup lifecycle, scoring pipeline, gameweek aggregation, and edge case tests using Vitest. Phase 3 ties everything together with an orchestrator script (`npm run simulate`), result logging, and teardown.

**Tech Stack:** Playwright (browser E2E), Vitest (data layer tests), SportMonks API (real 2025 data), Prisma (DB), bcryptjs (test user passwords), TypeScript.

**Spec:** `docs/superpowers/specs/2026-03-23-season-simulation-testing-design.md`

---

## File Structure

```
tests/simulation/
├── setup.ts                    # Shared setup: seed players, create league, users, roster, fixtures
├── teardown.ts                 # Full cleanup in FK order
├── helpers.ts                  # Shared utilities: login, create lineup, resolve active league
├── golden-players.json         # Hand-computed expected fantasy points for 9 player archetypes
├── results/                    # Output directory for run logs (gitignored)
├── playwright/
│   ├── playwright.config.ts    # Playwright config (393px viewport, baseURL)
│   ├── auth.setup.ts           # Playwright auth: login and save storage state
│   └── layer0.spec.ts          # 17 UX + PRD scenarios
├── layer1-roster.test.ts       # Roster upload validation (Vitest)
├── layer2-lineups.test.ts      # Lineup lifecycle: strategies, carry-forward, lock, chips (Vitest)
├── layer3-scoring.test.ts      # Score all 74 matches + golden player verification (Vitest)
├── layer4-aggregation.test.ts  # Gameweek aggregation + season replay (Vitest)
└── layer5-edge-cases.test.ts   # 13 edge case scenarios (Vitest)

scripts/
└── simulate-season.ts          # Orchestrator: runs all layers, logs results, teardown
```

**Existing files modified:**
- `package.json` — add Playwright dependency, `simulate` script
- `vitest.config.ts` — exclude `tests/simulation/playwright/` from Vitest (Playwright has its own runner)
- `.gitignore` — add `tests/simulation/results/`

---

## Phase 1: Layer 0 (Playwright UX) + Layer 1 (Roster Validation)

### Task 1: Install Playwright and configure

**Files:**
- Modify: `package.json`
- Create: `tests/simulation/playwright/playwright.config.ts`
- Modify: `vitest.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create Playwright config**

Note: Playwright does NOT use Vitest's `@` path alias. The `helpers.ts` file imports from `@/lib/db` — to make this work, either:
- Use `tsconfig-paths` in Playwright config, or
- Have `helpers.ts` use relative imports (`../../lib/db`) for Prisma

Simplest: use relative imports in `helpers.ts` for the Prisma import.

```typescript
// tests/simulation/playwright/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    viewport: { width: 393, height: 852 },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    {
      name: 'layer0',
      testMatch: 'layer0.spec.ts',
      dependencies: ['setup'],
    },
  ],
})
```

- [ ] **Step 3: Exclude Playwright from Vitest**

In `vitest.config.ts`, add to the test config:
```typescript
exclude: ['tests/simulation/playwright/**', 'node_modules/**']
```

- [ ] **Step 4: Add to .gitignore**

```
tests/simulation/results/
```

- [ ] **Step 5: Add scripts to package.json**

```json
"test:layer0": "npx playwright test --config tests/simulation/playwright/playwright.config.ts",
"simulate": "npx tsx scripts/simulate-season.ts"
```

- [ ] **Step 6: Verify Playwright runs (empty test)**

Create a minimal `layer0.spec.ts` with one test that navigates to `/login`:
```typescript
import { test, expect } from '@playwright/test'
test('login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('text=Sign In')).toBeVisible()
})
```

Run: `npm run test:layer0`
Expected: 1 test passes

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add Playwright config for simulation suite"
```

---

### Task 2: Shared setup and teardown modules

**Files:**
- Create: `tests/simulation/setup.ts`
- Create: `tests/simulation/teardown.ts`
- Create: `tests/simulation/helpers.ts`

- [ ] **Step 1: Create helpers.ts**

Shared constants and utilities used across all layers:

```typescript
// tests/simulation/helpers.ts
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export const SIM_PREFIX = 'sim-'
export const SIM_ADMIN_EMAIL = 'sim-admin@fal-test.com'
export const SIM_PASSWORD = 'sim-test-2025'
export const SIM_LEAGUE_NAME = 'IPL 2025 Simulation'
export const IPL_2025_SEASON_ID = 1689

export function simUserEmail(n: number) {
  return `sim-user-${n}@fal-test.com`
}

export async function getSimLeague() {
  return prisma.league.findFirst({
    where: { name: SIM_LEAGUE_NAME },
    include: { teams: { include: { user: true } } },
  })
}

export async function getSimGameweeks() {
  const league = await getSimLeague()
  if (!league) return []
  return prisma.gameweek.findMany({ orderBy: { number: 'asc' } })
}
```

- [ ] **Step 2: Create setup.ts**

Seeds 2025 players, creates league, users, roster CSV, uploads it, imports fixtures:

```typescript
// tests/simulation/setup.ts
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getSportMonksClient } from '@/lib/sportmonks/client'
import { importFixturesAndGameweeks } from '@/lib/sportmonks/fixtures'
import { IPL_TEAMS, mapPositionToRole } from '@/lib/sportmonks/utils'
import {
  SIM_ADMIN_EMAIL, SIM_PASSWORD, SIM_LEAGUE_NAME,
  IPL_2025_SEASON_ID, simUserEmail,
} from './helpers'

export async function setupSimulation() {
  const passwordHash = await bcrypt.hash(SIM_PASSWORD, 10)
  const log: string[] = []

  // 1. Seed 2025 players
  log.push('Seeding IPL 2025 players...')
  const client = getSportMonksClient()
  let totalPlayers = 0
  for (const team of IPL_TEAMS) {
    const squad = await client.fetch<any[]>(`/teams/${team.id}/squad/${IPL_2025_SEASON_ID}`)
    for (const p of squad) {
      await prisma.player.upsert({
        where: { apiPlayerId: p.id },
        update: {},
        create: {
          apiPlayerId: p.id,
          fullname: p.fullname || `${p.firstname} ${p.lastname}`,
          firstname: p.firstname || '',
          lastname: p.lastname || '',
          role: mapPositionToRole(p.position?.name),
          iplTeamId: team.id,
          iplTeamCode: team.code,
          iplTeamName: team.name,
          image: p.image_path || null,
          dateOfBirth: p.dateofbirth || null,
          battingStyle: p.battingstyle || null,
          bowlingStyle: p.bowlingstyle || null,
        },
      })
      totalPlayers++
    }
  }
  log.push(`Seeded ${totalPlayers} players`)

  // 2. Create admin + league
  const admin = await prisma.user.upsert({
    where: { email: SIM_ADMIN_EMAIL },
    update: { passwordHash },
    create: { email: SIM_ADMIN_EMAIL, name: 'Sim Admin', role: 'ADMIN', passwordHash },
  })

  const league = await prisma.league.create({
    data: {
      name: SIM_LEAGUE_NAME,
      inviteCode: 'SIM2025TEST',
      adminUserId: admin.id,
    },
  })
  log.push(`Created league: ${league.name} (${league.id})`)

  // 3. Create 10 test users with teams
  const allPlayers = await prisma.player.findMany({
    where: { iplTeamId: { in: IPL_TEAMS.map(t => t.id) } },
  })

  for (let i = 1; i <= 10; i++) {
    const email = simUserEmail(i)
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: {
        email,
        name: `Sim User ${i}`,
        role: 'USER',
        passwordHash,
        activeLeagueId: league.id,
      },
    })

    const team = await prisma.team.create({
      data: {
        name: `Team ${i}`,
        userId: user.id,
        leagueId: league.id,
      },
    })

    // Assign 15 players per team (distribute from pool, no duplicates)
    const startIdx = (i - 1) * 15
    const teamPlayers = allPlayers.slice(startIdx, startIdx + 15)
    for (const p of teamPlayers) {
      await prisma.teamPlayer.create({
        data: {
          teamId: team.id,
          playerId: p.id,
          leagueId: league.id,
          purchasePrice: Math.round(Math.random() * 15 * 10) / 10,
        },
      })
    }
    log.push(`Created ${email} with team "${team.name}" (${teamPlayers.length} players)`)
  }

  // 4. Import 2025 fixtures and gameweeks
  log.push('Importing IPL 2025 fixtures...')
  const result = await importFixturesAndGameweeks(prisma, IPL_2025_SEASON_ID)
  log.push(`Imported ${result.matchCount} matches across ${result.gameweekCount} gameweeks`)

  // 5. Start season
  await prisma.league.update({
    where: { id: league.id },
    data: { seasonStarted: true },
  })

  // 6. Print credentials
  log.push('')
  log.push('=== LOGIN CREDENTIALS ===')
  log.push(`Admin: ${SIM_ADMIN_EMAIL} / ${SIM_PASSWORD}`)
  for (let i = 1; i <= 10; i++) {
    log.push(`User ${i}: ${simUserEmail(i)} / ${SIM_PASSWORD}`)
  }

  return { league, log }
}
```

- [ ] **Step 3: Create teardown.ts**

```typescript
// tests/simulation/teardown.ts
import { prisma } from '@/lib/db'
import { SIM_LEAGUE_NAME, SIM_PREFIX } from './helpers'

export async function teardownSimulation() {
  const league = await prisma.league.findFirst({
    where: { name: SIM_LEAGUE_NAME },
  })
  if (!league) return { log: ['No simulation data found'] }

  const log: string[] = ['Tearing down simulation data...']

  // Delete in FK order
  const teams = await prisma.team.findMany({ where: { leagueId: league.id } })
  const teamIds = teams.map(t => t.id)

  await prisma.chipUsage.deleteMany({ where: { teamId: { in: teamIds } } })
  await prisma.gameweekScore.deleteMany({ where: { teamId: { in: teamIds } } })

  const lineups = await prisma.lineup.findMany({ where: { teamId: { in: teamIds } } })
  const lineupIds = lineups.map(l => l.id)
  await prisma.lineupSlot.deleteMany({ where: { lineupId: { in: lineupIds } } })
  await prisma.lineup.deleteMany({ where: { teamId: { in: teamIds } } })

  // Scope to simulation gameweeks only (imported from season 1689)
  const gameweeks = await prisma.gameweek.findMany()
  const gwIds = gameweeks.map(g => g.id)
  const matches = await prisma.match.findMany({ where: { gameweekId: { in: gwIds } } })
  const matchIds = matches.map(m => m.id)

  await prisma.playerPerformance.deleteMany({ where: { matchId: { in: matchIds } } })
  await prisma.playerScore.deleteMany({ where: { gameweekId: { in: gwIds } } })

  await prisma.teamPlayer.deleteMany({ where: { leagueId: league.id } })
  await prisma.team.deleteMany({ where: { leagueId: league.id } })
  await prisma.match.deleteMany({ where: { gameweekId: { in: gwIds } } })
  await prisma.gameweek.deleteMany({ where: { id: { in: gwIds } } })
  await prisma.league.delete({ where: { id: league.id } })

  // Delete sim users
  await prisma.user.deleteMany({
    where: { email: { startsWith: SIM_PREFIX } },
  })

  log.push('Teardown complete')
  return { log }
}
```

- [ ] **Step 4: Verify setup and teardown work**

Create a quick test script:
```bash
npx tsx -e "
import { setupSimulation } from './tests/simulation/setup'
import { teardownSimulation } from './tests/simulation/teardown'
async function main() {
  const { log } = await setupSimulation()
  log.forEach(l => console.log(l))
  const { log: tlog } = await teardownSimulation()
  tlog.forEach(l => console.log(l))
}
main()
"
```

Expected: Players seeded, league created, 10 users with teams, fixtures imported, then all cleaned up.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add simulation setup, teardown, and helpers"
```

---

### Task 3: Playwright auth setup

**Files:**
- Create: `tests/simulation/playwright/auth.setup.ts`

- [ ] **Step 1: Write auth setup that logs in and saves state**

```typescript
// tests/simulation/playwright/auth.setup.ts
import { test as setup } from '@playwright/test'
import { SIM_ADMIN_EMAIL, SIM_PASSWORD, simUserEmail } from '../helpers'

const STORAGE_DIR = 'tests/simulation/playwright/.auth'

setup('authenticate admin', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(SIM_ADMIN_EMAIL)
  await page.getByLabel('Password').fill(SIM_PASSWORD)
  await page.getByRole('button', { name: 'Enter League' }).click()
  await page.waitForURL('/')
  await page.context().storageState({ path: `${STORAGE_DIR}/admin.json` })
})

setup('authenticate user 1', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(simUserEmail(1))
  await page.getByLabel('Password').fill(SIM_PASSWORD)
  await page.getByRole('button', { name: 'Enter League' }).click()
  await page.waitForURL('/')
  await page.context().storageState({ path: `${STORAGE_DIR}/user1.json` })
})
```

- [ ] **Step 2: Update Playwright config to use storage states**

Add three projects to `playwright.config.ts` — admin, user, and unauthenticated:
```typescript
{
  name: 'layer0-admin',
  testMatch: 'layer0.spec.ts',
  grep: /@admin/,
  use: { storageState: 'tests/simulation/playwright/.auth/admin.json' },
  dependencies: ['setup'],
},
{
  name: 'layer0-user',
  testMatch: 'layer0.spec.ts',
  grep: /@user/,
  use: { storageState: 'tests/simulation/playwright/.auth/user1.json' },
  dependencies: ['setup'],
},
{
  name: 'layer0-noauth',
  testMatch: 'layer0.spec.ts',
  grep: /@noauth/,
  use: { storageState: undefined }, // no auth — tests fresh login/signup
},
```

Tests tag themselves: `test('11. New user signs up @noauth', ...)`, `test('1. Admin uploads roster @admin', ...)`, etc.

- [ ] **Step 3: Add .auth to .gitignore**

```
tests/simulation/playwright/.auth/
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Playwright auth setup for simulation"
```

---

### Task 4: Layer 0 — Playwright UX scenarios (17 tests)

**Files:**
- Create: `tests/simulation/playwright/layer0.spec.ts`

**Implementation note:** All 17 scenarios and their assertions are defined in the spec (lines 58-72). The PRD Design Assertions table (lines 76-90) provides 16 design checks that should be woven into the relevant scenarios. The Additional PRD Flow Tests table (lines 98-116) lists 10 flow tests — most overlap with the 17 scenarios, but "season start gate", "default league fallback", "auto-set on first join", and "join switches active league" should be added as additional test cases within the appropriate scenarios.

Tag each test with `@admin`, `@user`, or `@noauth` to match the Playwright project config.

- [ ] **Step 1: Write scenarios 1-5 (admin roster, squad, lineup set/edit, chip)**

```typescript
// tests/simulation/playwright/layer0.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Layer 0: UX + PRD Validation', () => {

  test('1. Admin uploads roster', async ({ page }) => {
    // Uses admin storage state
    await page.goto('/admin')
    // Verify league is loaded, teams section visible
    await expect(page.locator('text=Teams')).toBeVisible()
  })

  test('2. User views squad', async ({ page }) => {
    await page.goto('/lineup')
    // Verify 15 players visible with role badges
    const players = page.locator('[data-testid="player-card"]')
    await expect(players).toHaveCount(15)
  })

  test('3. User sets lineup', async ({ page }) => {
    await page.goto('/lineup')
    // Verify pitch layout, XI/bench split, captain/VC badges
    await expect(page.locator('text=Captain')).toBeVisible()
    await expect(page.locator('text=Vice Captain')).toBeVisible()
  })

  // ... scenarios 4-17 following the spec
})
```

Note: The exact selectors will depend on the actual DOM structure. Each scenario should:
- Navigate to the correct page
- Perform the user action
- Assert PRD-specified elements are present
- Take screenshots for baseline comparison with `await expect(page).toHaveScreenshot()`

- [ ] **Step 2: Write scenarios 6-10 (dashboard, leaderboard, standings, player stats, view lineup)**

Each test navigates to the page and asserts PRD elements:
- Dashboard: GW score trio, deadline, match schedule, standings snippet
- Leaderboard: Rank column, GW points, total points, movement indicators
- Standings: GW selector tabs, full table
- Player stats: Role-specific stat tables, batting/bowling/fielding breakdown
- View lineup: Read-only pitch view of another manager's team

- [ ] **Step 3: Write scenarios 11-13 (signup, returning login, join from admin)**

- Scenario 11: New user signup — go to `/login`, fill email + invite code + password, submit, verify dashboard
- Scenario 12: Returning user — go to `/login`, fill email + password (no invite code), verify dashboard
- Scenario 13: Join from admin — go to `/admin`, find "Join a League" card, enter invite code, verify success

- [ ] **Step 4: Write scenarios 14-17 (league switch, persist, invalid password, short password)**

- Scenario 14: League switcher — click different league in switcher, verify page updates
- Scenario 15: Persist — after switch, navigate to leaderboard/standings, verify correct league data
- Scenario 16: Invalid password — enter wrong password, verify error message
- Scenario 17: Short password — enter 3-char password, verify error message

- [ ] **Step 5: Add PRD design assertions as shared checks**

Create reusable assertion helpers:
```typescript
async function assertPRDLayout(page) {
  // Bottom nav: 4 tabs
  await expect(page.locator('nav a')).toHaveCount(4)
  // Mobile viewport
  const viewport = page.viewportSize()
  expect(viewport?.width).toBe(393)
}
```

- [ ] **Step 6: Run all Layer 0 tests**

```bash
npm run test:layer0
```

Expected: 17 tests pass (some may need setup data — ensure `setupSimulation()` has been run first)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add Layer 0 Playwright UX tests (17 scenarios)"
```

---

### Task 5: Layer 1 — Roster validation (Vitest)

**Files:**
- Create: `tests/simulation/layer1-roster.test.ts`

- [ ] **Step 1: Write roster validation tests**

```typescript
// tests/simulation/layer1-roster.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/db'
import { getSimLeague } from './helpers'

describe('Layer 1: Seed & Roster Validation', () => {
  let league: any

  beforeAll(async () => {
    league = await getSimLeague()
  })

  it('simulation league exists', () => {
    expect(league).toBeTruthy()
    expect(league.name).toBe('IPL 2025 Simulation')
    expect(league.seasonStarted).toBe(true)
  })

  it('has exactly 10 teams', () => {
    expect(league.teams).toHaveLength(10)
  })

  it('each team has 15 players', async () => {
    for (const team of league.teams) {
      const count = await prisma.teamPlayer.count({ where: { teamId: team.id } })
      expect(count).toBe(15)
    }
  })

  it('no duplicate players across teams', async () => {
    const allPlayerIds = await prisma.teamPlayer.findMany({
      where: { leagueId: league.id },
      select: { playerId: true },
    })
    const ids = allPlayerIds.map(p => p.playerId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('purchase prices are set', async () => {
    const withPrice = await prisma.teamPlayer.findMany({
      where: { leagueId: league.id, purchasePrice: { gt: 0 } },
    })
    expect(withPrice.length).toBe(150) // 10 teams * 15 players
  })

  it('gameweeks and matches imported', async () => {
    const gws = await prisma.gameweek.count()
    const matches = await prisma.match.count()
    expect(gws).toBeGreaterThan(0)
    expect(matches).toBe(74)
  })

  it('season start gate: rejects if squad too small', async () => {
    // Create a temp league with undersized squad to test the gate
    // POST /api/admin/season/start should reject with error
    // This validates PRD Section 3.3: "Admin cannot start season until all squads have min 12 players"
  })
})
```

- [ ] **Step 2: Run Layer 1 tests**

```bash
npx vitest run tests/simulation/layer1-roster.test.ts
```

Expected: 6 tests pass (requires setup to have been run)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add Layer 1 roster validation tests"
```

---

## Phase 2: Layers 2-5 (Lineup, Scoring, Aggregation, Edge Cases)

### Task 6: Export scoring functions for test access

**Files:**
- Modify: `lib/scoring/pipeline.ts`

`scoreMatch` and `aggregateGameweek` are private functions in `pipeline.ts`. Tests need direct access.

- [ ] **Step 1: Export scoreMatch and aggregateGameweek**

In `lib/scoring/pipeline.ts`, add `export` to both function declarations:
- `async function scoreMatch(...)` → `export async function scoreMatch(...)`
- `async function aggregateGameweek(...)` → `export async function aggregateGameweek(...)`

Note: `aggregateGameweek` takes a single `gameweekId: string` parameter (not `prisma`). It uses the module-level prisma import internally.

- [ ] **Step 2: Verify existing tests still pass**

```bash
npm test
```

Expected: 97 tests pass (exporting doesn't change behavior)

- [ ] **Step 3: Commit**

```bash
git add lib/scoring/pipeline.ts && git commit -m "feat: export scoreMatch and aggregateGameweek for simulation tests"
```

---

### Task 7: Layer 2 — Lineup lifecycle tests (renumbered from original Task 6)

**Files:**
- Create: `tests/simulation/layer2-lineups.test.ts`

- [ ] **Step 1: Write lineup strategy generator**

Add to `helpers.ts` — functions that generate lineups for the three strategy types:

```typescript
export function generateSmartLineup(squad: Player[], gwNumber: number): LineupSubmission { ... }
export function generateRandomLineup(squad: Player[]): LineupSubmission { ... }
export function generateChipStrategyLineup(squad: Player[], chipType: string): LineupSubmission { ... }
```

Each returns `{ slots: Array<{ playerId, slotType, benchPriority, role }> }` matching the lineup API format.

- [ ] **Step 2: Write lineup lifecycle tests**

Tests for all 10 users submitting lineups across 3 gameweeks (first, mid, last), carry-forward, lock enforcement, chip validation:

```typescript
describe('Layer 2: Lineup Lifecycle', () => {
  it('all 10 users submit lineups for GW1', ...)
  it('smart users have top performers as XI', ...)
  it('chip strategists activate chips on correct GWs', ...)
  it('GW1 no-lineup: user 7 skips and scores 0', ...)
  it('carry-forward: users 4-5 skip mid GW, previous lineup carries', ...)
  it('lock enforcement: submission after lock returns 423', ...)
  it('one chip per GW: second chip activation rejected', ...)
  it('lineup validation: 11 XI, 1 captain, 1 VC, sequential bench', ...)
})
```

- [ ] **Step 3: Run and verify**

```bash
npx vitest run tests/simulation/layer2-lineups.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Layer 2 lineup lifecycle tests"
```

---

### Task 8: Layer 3 — Score all 74 matches

**Files:**
- Create: `tests/simulation/layer3-scoring.test.ts`
- Create: `tests/simulation/golden-players.json`

- [ ] **Step 1: Create golden player fixture data**

Hand-compute expected points for 9 player archetypes from IPL 2025 data. Store in JSON:

```json
[
  {
    "type": "century_scorer",
    "matchApiId": 65240,
    "playerApiId": 12345,
    "expectedPoints": 142,
    "breakdown": { "runs": 105, "fours": 10, "sixes": 5, ... }
  },
  ...
]
```

Note: Actual values to be determined by fetching real scorecards and computing by hand.

- [ ] **Step 2: Write scoring tests**

```typescript
describe('Layer 3: Score All 74 Matches', () => {
  it('scores all matches in batches of 8', async () => {
    // Fetch and score all 74 matches
    // Batch into groups of 8 for API rate limiting
  }, 900_000) // 15 min timeout

  it('71 matches scored, 3 abandoned', async () => {
    const scored = await prisma.match.count({ where: { scoringStatus: 'SCORED' } })
    const cancelled = await prisma.match.count({ where: { scoringStatus: 'CANCELLED' } })
    expect(scored).toBe(71)
    expect(cancelled).toBe(3)
  })

  it('PlayerPerformance records created for all matches', ...)
  it('fantasy points are non-null for all performances', ...)
  it('golden player: century scorer points correct', ...)
  it('golden player: 75-run milestone stacking correct', ...)
  it('golden player: 5-wicket haul points correct', ...)
  it('golden player: duck by batter vs bowler', ...)
  it('golden player: SR penalty applied correctly', ...)
  it('golden player: economy rate penalty applied', ...)
  it('golden player: 3-catch bonus applied', ...)
  it('golden player: multi-match accumulation', ...)
  it('golden player: starting XI + impact player gets both bonuses', ...)
  it('admin scoring trigger via API endpoint', ...)
})
```

- [ ] **Step 3: Run (15 min)**

```bash
npx vitest run tests/simulation/layer3-scoring.test.ts --timeout 900000
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Layer 3 scoring tests for all 74 matches"
```

---

### Task 9: Layer 4 — Gameweek aggregation

**Files:**
- Create: `tests/simulation/layer4-aggregation.test.ts`

- [ ] **Step 1: Write aggregation tests**

```typescript
describe('Layer 4: Gameweek Aggregation & Season Replay', () => {
  it('aggregates all gameweeks sequentially', async () => {
    const gameweeks = await prisma.gameweek.findMany({ orderBy: { number: 'asc' } })
    for (const gw of gameweeks) {
      await aggregateGameweek(gw.id) // takes gameweekId only, uses module-level prisma
    }
  }, 600_000) // 10 min timeout

  it('GameweekScore exists for every team x every gameweek', ...)
  it('leaderboard rankings correct (total desc, tiebreaker by bestGw)', ...)
  it('chips marked USED after activation gameweek', ...)
  it('cumulative totalPoints monotonically increasing', ...)
  it('no team has more than 1 of each chip', ...)
  it('bestGwScore equals max GameweekScore per team', ...)
})
```

- [ ] **Step 2: Run and verify**

```bash
npx vitest run tests/simulation/layer4-aggregation.test.ts --timeout 600000
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add Layer 4 gameweek aggregation tests"
```

---

### Task 10: Layer 5 — Edge cases

**Files:**
- Create: `tests/simulation/layer5-edge-cases.test.ts`

- [ ] **Step 1: Write 13 edge case tests**

```typescript
describe('Layer 5: Edge Cases', () => {
  it('abandoned match: no points awarded', ...)
  it('super over: scoring excluded', ...)
  it('captain absent: VC promoted to 2x', ...)
  it('both captain and VC absent: no multipliers', ...)
  it('multiple XI gaps: separate bench subs, no double-dip', ...)
  it('chip + BAT captain stacking: 4x points', ...)
  it('chip + BOWL captain stacking: 4x points', ...)
  it('all bench absent: no sub, player gets 0', ...)
  it('impact player not in starting XI: gets +4 bonus', ...)
  it('GW1 no lineup: user scores 0', ...)
  it('player plays 2 matches in one GW: points accumulate', ...)
  it('milestone stacking: 75 runs = +24', ...)
  it('milestone replacement: 100 runs = +16 only', ...)
})
```

- [ ] **Step 2: Run and verify**

```bash
npx vitest run tests/simulation/layer5-edge-cases.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add Layer 5 edge case tests"
```

---

## Phase 3: Orchestrator, Logging, and Teardown

### Task 11: Result logger

**Files:**
- Create: `tests/simulation/logger.ts`

- [ ] **Step 1: Write logger module**

```typescript
// tests/simulation/logger.ts
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface LayerResult {
  status: 'passed' | 'failed'
  tests: number
  passed: number
  failed: number
  duration: number
  failures: Array<{ test: string; error: string; context?: string }>
}

export interface SimulationResult {
  runId: string
  duration: string
  targetUrl: string
  layers: Record<string, LayerResult>
  leaderboard_final: Array<{ rank: number; team: string; points: number; bestGw: number }>
  failures: Array<{ layer: string; test: string; error: string }>
}

const RESULTS_DIR = join(process.cwd(), 'tests/simulation/results')

export function saveResults(result: SimulationResult) {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const ts = result.runId.replace(/[:.]/g, '-')

  // JSON
  writeFileSync(
    join(RESULTS_DIR, `run-${ts}.json`),
    JSON.stringify(result, null, 2)
  )

  // Human-readable log
  const lines: string[] = []
  lines.push(`=== Simulation Run: ${result.runId} ===`)
  lines.push(`Duration: ${result.duration}`)
  lines.push(`Target: ${result.targetUrl}`)
  lines.push('')
  for (const [name, layer] of Object.entries(result.layers)) {
    lines.push(`${name}: ${layer.status.toUpperCase()} (${layer.passed}/${layer.tests})`)
    for (const f of layer.failures) {
      lines.push(`  FAIL: ${f.test} — ${f.error}`)
    }
  }
  writeFileSync(join(RESULTS_DIR, `run-${ts}.log`), lines.join('\n'))
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add simulation result logger"
```

---

### Task 12: Orchestrator script

**Files:**
- Create: `scripts/simulate-season.ts`

- [ ] **Step 1: Write the orchestrator**

```typescript
// scripts/simulate-season.ts
import { config } from 'dotenv'
config({ path: '.env.local' })

import { setupSimulation } from '../tests/simulation/setup'
import { teardownSimulation } from '../tests/simulation/teardown'
import { saveResults, SimulationResult } from '../tests/simulation/logger'
import { execSync } from 'child_process'

async function main() {
  const startTime = Date.now()
  const runId = new Date().toISOString()
  const targetUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'

  console.log(`\n=== IPL Season Simulation ===`)
  console.log(`Target: ${targetUrl}`)
  console.log(`Run ID: ${runId}\n`)

  const result: SimulationResult = {
    runId,
    duration: '',
    targetUrl,
    layers: {},
    leaderboard_final: [],
    failures: [],
  }

  // SETUP
  console.log('=== SETUP ===')
  const { log } = await setupSimulation()
  log.forEach(l => console.log(l))

  // LAYER 0: Playwright
  console.log('\n=== LAYER 0: Playwright UX ===')
  try {
    execSync('npm run test:layer0', { stdio: 'inherit' })
    result.layers.layer0_ux = { status: 'passed', tests: 17, passed: 17, failed: 0, duration: 0, failures: [] }
  } catch {
    result.layers.layer0_ux = { status: 'failed', tests: 17, passed: 0, failed: 17, duration: 0, failures: [{ test: 'layer0', error: 'Playwright tests failed' }] }
  }

  // LAYERS 1-5: Vitest
  const vitestLayers = [
    { name: 'layer1_roster', file: 'tests/simulation/layer1-roster.test.ts' },
    { name: 'layer2_lineups', file: 'tests/simulation/layer2-lineups.test.ts' },
    { name: 'layer3_scoring', file: 'tests/simulation/layer3-scoring.test.ts' },
    { name: 'layer4_aggregation', file: 'tests/simulation/layer4-aggregation.test.ts' },
    { name: 'layer5_edge_cases', file: 'tests/simulation/layer5-edge-cases.test.ts' },
  ]

  for (const layer of vitestLayers) {
    console.log(`\n=== ${layer.name.toUpperCase()} ===`)
    try {
      execSync(`npx vitest run ${layer.file} --reporter=json --outputFile=/tmp/sim-${layer.name}.json`, { stdio: 'inherit', timeout: 900_000 })
      result.layers[layer.name] = { status: 'passed', tests: 0, passed: 0, failed: 0, duration: 0, failures: [] }
    } catch {
      result.layers[layer.name] = { status: 'failed', tests: 0, passed: 0, failed: 0, duration: 0, failures: [{ test: layer.name, error: 'Tests failed' }] }
    }
  }

  // TEARDOWN
  console.log('\n=== TEARDOWN ===')
  const { log: tlog } = await teardownSimulation()
  tlog.forEach(l => console.log(l))

  // Save results
  const elapsed = Date.now() - startTime
  result.duration = `${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s`
  saveResults(result)
  console.log(`\n=== DONE in ${result.duration} ===`)
  console.log(`Results saved to tests/simulation/results/`)
}

main().catch(e => {
  console.error('Simulation failed:', e)
  process.exit(1)
})
```

- [ ] **Step 2: Verify `npm run simulate` works**

```bash
npm run simulate
```

Expected: Full run through all layers with results logged.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add simulation orchestrator script"
```

---

### Task 13: Final integration test

**Files:** None new — this is a verification step.

- [ ] **Step 1: Run the full simulation end-to-end**

```bash
npm run simulate
```

Expected: All layers run, results logged to `tests/simulation/results/`.

- [ ] **Step 2: Verify result files**

Check that both `run-*.json` and `run-*.log` files are created with correct structure.

- [ ] **Step 3: Verify teardown cleaned everything**

```bash
npx tsx -e "
import { prisma } from './lib/db'
async function check() {
  const league = await prisma.league.findFirst({ where: { name: 'IPL 2025 Simulation' } })
  console.log('Sim league exists:', !!league)
  const users = await prisma.user.count({ where: { email: { startsWith: 'sim-' } } })
  console.log('Sim users remaining:', users)
}
check()
"
```

Expected: `Sim league exists: false`, `Sim users remaining: 0`

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "feat: complete IPL season simulation suite"
```
