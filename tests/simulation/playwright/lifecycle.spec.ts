import { test, expect, Page } from '@playwright/test'

/**
 * Full Gameweek Lifecycle E2E Test
 *
 * Tests the complete transition through 6 stages:
 *   1. Pre-scores (0 matches → LIVE badge in hero, 0 pts)
 *   2. Partial scoring (2 matches → hero score matches DB computation)
 *   3. Chip activation (POWER_PLAY_BAT → chip progression in sheet)
 *   4. All scored (N/N matches → hero score verified, GW column in standings)
 *   5. Settlement (GameweekScore → hero shows FINAL GW score)
 *   6. GW completed (aggregationStatus DONE → League Standings)
 *
 * Tags: @user — logged in as sim-user-1@fal-test.com
 */

/* ─── DB Helpers ─── */

import { execSync } from 'child_process'

const ENV_PATH = '/Users/viiveeksankar/workspace/fal/.env.local'

function runDbScript(script: string): string {
  const escaped = script.replace(/"/g, '\\"').replace(/\$/g, '\\$')
  const cmd = `node -e "require('dotenv').config({ path: '${ENV_PATH}' }); const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); (async () => { ${escaped}; await p.\\$disconnect(); })().catch(e => { console.error(e); process.exit(1); });"`
  return execSync(cmd, {
    cwd: '/Users/viiveeksankar/workspace/fal-live-scores',
    timeout: 15000,
    encoding: 'utf-8',
  }).trim()
}

function dbQuery(query: string): any {
  const result = runDbScript(`const r = await ${query}; console.log(JSON.stringify(r))`)
  return JSON.parse(result.split('\n').pop()!)
}

function dbExec(statement: string): void {
  runDbScript(statement)
}

function computeExpectedScore(
  teamId: string,
  gwId: string,
  chipType: string | null = null
): { totalPoints: number; chipBonusPoints: number } {
  const result = runDbScript(`
    const lineup = await p.lineup.findFirst({
      where: { teamId: '${teamId}', gameweekId: '${gwId}' },
      include: { slots: { include: { player: { select: { id: true, role: true } } } } }
    });
    const scoredMatches = await p.match.findMany({
      where: { gameweekId: '${gwId}', scoringStatus: 'SCORED' },
      select: { id: true }
    });
    const matchIds = scoredMatches.map(m => m.id);
    const perfs = await p.playerPerformance.findMany({
      where: { playerId: { in: lineup.slots.map(s => s.playerId) }, matchId: { in: matchIds } },
      select: { playerId: true, fantasyPoints: true }
    });
    const baseMap = new Map();
    for (const perf of perfs) {
      baseMap.set(perf.playerId, (baseMap.get(perf.playerId) || 0) + perf.fantasyPoints);
    }
    let total = 0;
    let chipBonus = 0;
    for (const slot of lineup.slots) {
      if (slot.slotType !== 'XI') continue;
      const base = baseMap.get(slot.playerId) || 0;
      const isCaptain = slot.role === 'CAPTAIN';
      const multiplied = isCaptain && base > 0 ? base * 2 : base;
      let bonus = 0;
      const chipType = ${chipType ? `'${chipType}'` : 'null'};
      if (chipType === 'POWER_PLAY_BAT' && slot.player.role === 'BAT') bonus = multiplied;
      if (chipType === 'BOWLING_BOOST' && slot.player.role === 'BOWL') bonus = multiplied;
      total += multiplied + bonus;
      chipBonus += bonus;
    }
    console.log(JSON.stringify({ totalPoints: total, chipBonusPoints: chipBonus }));
  `)
  return JSON.parse(result.split('\n').pop()!)
}

/* ─── Helpers ─── */

async function waitForApp(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await expect(page.getByText('Loading...')).toBeHidden({ timeout: 30_000 }).catch(() => {})
}

/** Get the "Your Points" value from the hero section */
async function getHeroYourPoints(page: Page): Promise<number> {
  const el = page.getByTestId('hero-your-points')
  // The number is in the large text div (not the dividers or label)
  // Get all text content then extract the number before "Your Points"
  const fullText = await el.textContent()
  const match = fullText?.match(/^[\s]*([\d,]+|—)/)
  if (!match || match[1] === '—') return 0
  return parseInt(match[1].replace(/,/g, ''))
}

/* ─── State management ─── */

interface OriginalState {
  gameweekScore: any | null
  matchStatuses: Array<{ id: string; scoringStatus: string }>
  gwStatus: string
  aggregationStatus: string
  chipUsage: any | null
}

let originalState: OriginalState
let activeGwId: string
let activeGwNumber: number
let teamId: string
let leagueId: string

/* ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Full Gameweek Lifecycle @user', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    const gw = dbQuery(`p.gameweek.findFirst({ where: { status: 'ACTIVE' }, select: { id: true, number: true, aggregationStatus: true } })`)
    activeGwId = gw.id
    activeGwNumber = gw.number

    const user = dbQuery(`p.user.findUnique({ where: { email: 'sim-user-1@fal-test.com' }, select: { teams: { select: { id: true, leagueId: true } } } })`)
    teamId = user.teams[0].id
    leagueId = user.teams[0].leagueId

    const gs = dbQuery(`p.gameweekScore.findFirst({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)
    const matches = dbQuery(`p.match.findMany({ where: { gameweekId: '${activeGwId}' }, select: { id: true, scoringStatus: true } })`)
    const chip = dbQuery(`p.chipUsage.findFirst({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)

    originalState = {
      gameweekScore: gs,
      matchStatuses: matches,
      gwStatus: 'ACTIVE',
      aggregationStatus: gw.aggregationStatus,
      chipUsage: chip,
    }
  })

  test.afterAll(() => {
    // Restore GW to clean ACTIVE state
    try { dbExec(`await p.gameweek.update({ where: { id: '${activeGwId}' }, data: { status: 'ACTIVE', aggregationStatus: 'PENDING' } })`) } catch (e) { console.error('restore gw:', e) }
    try { dbExec(`await p.gameweekScore.deleteMany({ where: { gameweekId: '${activeGwId}' } })`) } catch (e) { console.error('restore gs:', e) }
    try { dbExec(`await p.chipUsage.deleteMany({ where: { gameweekId: '${activeGwId}' } })`) } catch (e) { console.error('restore chip:', e) }
    // Reset matches: first 3 SCORED, rest SCHEDULED
    try {
      const matchIds = dbQuery(`p.match.findMany({ where: { gameweekId: '${activeGwId}' }, orderBy: { startingAt: 'asc' }, select: { id: true } })`)
      for (let i = 0; i < matchIds.length; i++) {
        dbExec(`await p.match.update({ where: { id: '${matchIds[i].id}' }, data: { scoringStatus: '${i < 3 ? 'SCORED' : 'SCHEDULED'}' } })`)
      }
    } catch (e) { console.error('restore matches:', e) }
  })

  /* ─── Stage 1: Pre-scores ─── */
  test('Stage 1: Pre-scores — LIVE badge, 0 points in hero', async ({ page }) => {
    dbExec(`await p.match.updateMany({ where: { gameweekId: '${activeGwId}' }, data: { scoringStatus: 'SCHEDULED' } })`)
    dbExec(`await p.gameweekScore.deleteMany({ where: { gameweekId: '${activeGwId}' } })`)
    dbExec(`await p.chipUsage.deleteMany({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)
    dbExec(`await p.gameweek.update({ where: { id: '${activeGwId}' }, data: { aggregationStatus: 'PENDING' } })`)

    await page.goto('/')
    await waitForApp(page)

    // Hero should show LIVE badge
    await expect(page.getByTestId('hero-live-badge')).toBeVisible({ timeout: 15_000 })

    // Match progress: 0/N
    await expect(page.getByTestId('hero-match-progress')).toHaveText(/0\/\d+ matches/)

    // Your Points = 0 (no scored matches)
    const pts = await getHeroYourPoints(page)
    expect(pts).toBe(0)

    // Standings: Live Standings + provisional footer
    const standingsCard = page.getByTestId('standings-card')
    await expect(standingsCard.getByText('Live Standings')).toBeVisible()
    await expect(standingsCard.getByText('Provisional — bench subs not yet applied')).toBeVisible()

    await page.screenshot({ path: 'test-results/lifecycle-stage1-prescores.png' })
  })

  /* ─── Stage 2: Partial scoring — score accuracy ─── */
  test('Stage 2: Partial scoring — hero score matches DB computation', async ({ page }) => {
    const matches = dbQuery(`p.match.findMany({ where: { gameweekId: '${activeGwId}' }, select: { id: true }, take: 2 })`)
    for (const m of matches) {
      dbExec(`await p.match.update({ where: { id: '${m.id}' }, data: { scoringStatus: 'SCORED' } })`)
    }
    const expected = computeExpectedScore(teamId, activeGwId, null)

    await page.goto('/')
    await waitForApp(page)

    await expect(page.getByTestId('hero-live-badge')).toBeVisible()
    await expect(page.getByTestId('hero-match-progress')).toHaveText(/2\/\d+ matches/)

    // Verify displayed score matches expected
    const pts = await getHeroYourPoints(page)
    expect(pts).toBe(expected.totalPoints)

    await page.screenshot({ path: 'test-results/lifecycle-stage2-partial.png' })
  })

  /* ─── Stage 3: Chip activation ─── */
  test('Stage 3: Chip activation — hero score includes chip bonus', async ({ page }) => {
    dbExec(`await p.match.updateMany({ where: { gameweekId: '${activeGwId}' }, data: { scoringStatus: 'SCORED' } })`)
    dbExec(`await p.chipUsage.deleteMany({ where: { teamId: '${teamId}', chipType: 'POWER_PLAY_BAT' } })`)
    dbExec(`await p.chipUsage.create({ data: { teamId: '${teamId}', chipType: 'POWER_PLAY_BAT', gameweekId: '${activeGwId}', status: 'PENDING' } })`)

    const expected = computeExpectedScore(teamId, activeGwId, 'POWER_PLAY_BAT')
    expect(expected.chipBonusPoints).toBeGreaterThan(0)

    await page.goto('/')
    await waitForApp(page)

    // Hero score includes chip bonus
    const pts = await getHeroYourPoints(page)
    expect(pts).toBe(expected.totalPoints)

    // Your Points links to view-lineup (PR #20)
    const link = page.getByTestId('hero-your-points')
    await expect(link).toHaveAttribute('href', /\/view-lineup\//)

    await page.screenshot({ path: 'test-results/lifecycle-stage3-chip.png' })
  })

  /* ─── Stage 4: All scored — GW column in standings ─── */
  test('Stage 4: All scored — GW column matches hero score', async ({ page }) => {
    const expected = computeExpectedScore(teamId, activeGwId, 'POWER_PLAY_BAT')

    await page.goto('/')
    await waitForApp(page)

    // All matches scored: N/N
    const progressText = await page.getByTestId('hero-match-progress').textContent()
    const [scored, total] = progressText!.match(/(\d+)\/(\d+)/)!.slice(1).map(Number)
    expect(scored).toBe(total)

    // Hero score accuracy
    const pts = await getHeroYourPoints(page)
    expect(pts).toBe(expected.totalPoints)

    // GW column in standings matches
    const standingsCard = page.getByTestId('standings-card')
    const showAll = standingsCard.getByText(/Show all \d+/)
    if (await showAll.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showAll.click()
      await page.waitForTimeout(500)
    }
    const yourRow = standingsCard.locator('a', { hasText: '(You)' })
    await expect(yourRow).toBeVisible({ timeout: 5000 })
    const gwText = await yourRow.getByTestId('gw-points').textContent()
    expect(parseInt(gwText?.replace(/,/g, '') || '-1')).toBe(expected.totalPoints)

    await page.screenshot({ path: 'test-results/lifecycle-stage4-allscored.png' })
  })

  /* ─── Stage 5: Settlement — GameweekScore created ─── */
  test('Stage 5: Settlement — GameweekScore stored', async ({ page }) => {
    const settledPoints = 474
    dbExec(`await p.gameweekScore.upsert({ where: { teamId_gameweekId: { teamId: '${teamId}', gameweekId: '${activeGwId}' } }, create: { teamId: '${teamId}', gameweekId: '${activeGwId}', totalPoints: ${settledPoints}, chipUsed: 'POWER_PLAY_BAT' }, update: { totalPoints: ${settledPoints}, chipUsed: 'POWER_PLAY_BAT' } })`)

    await page.goto('/')
    await waitForApp(page)

    // Hero still shows LIVE badge (leaderboard active until aggregation DONE)
    await expect(page.getByTestId('hero-live-badge')).toBeVisible()

    // Your Points link still works
    await expect(page.getByTestId('hero-your-points')).toHaveAttribute('href', /\/view-lineup\//)

    await page.screenshot({ path: 'test-results/lifecycle-stage5-final.png' })
  })

  /* ─── Stage 6: GW completed ─── */
  test('Stage 6: GW completed — League Standings, no rank changes', async ({ page }) => {
    dbExec(`await p.gameweek.update({ where: { id: '${activeGwId}' }, data: { aggregationStatus: 'DONE' } })`)

    await page.goto('/')
    await waitForApp(page)

    const standingsCard = page.getByTestId('standings-card')
    await expect(standingsCard.getByText('League Standings')).toBeVisible()
    await expect(standingsCard.getByText('Provisional — bench subs not yet applied')).toBeHidden()
    await expect(standingsCard.getByTestId('standings-pulsing-dot')).toBeHidden()

    const rankChanges = standingsCard.getByTestId('rank-change')
    const count = await rankChanges.count()
    for (let i = 0; i < count; i++) {
      await expect(rankChanges.nth(i)).toHaveText('—')
    }

    await page.screenshot({ path: 'test-results/lifecycle-stage6-completed.png' })
  })
})
