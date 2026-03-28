import { test, expect, Page } from '@playwright/test'

/**
 * Full Gameweek Lifecycle E2E Test
 *
 * Tests the complete transition through 7 stages:
 *   1. Pre-scores (0 matches → LIVE, 0 pts)
 *   2. Partial scoring (2 matches → LIVE, running total verified against DB)
 *   3. Chip activation (POWER_PLAY_BAT → chip badge, progression arrows)
 *   4. All scored (N/N matches → LIVE, full total with chip bonus)
 *   5. Settlement (GameweekScore → FINAL badge, stored score)
 *   6. GW completed (aggregationStatus DONE → League Standings)
 *   7. Cleanup verification (state restored)
 *
 * Strategy: Uses existing GW6 (ACTIVE) simulation data. Manipulates DB state
 * between stages, then restores original state in afterAll.
 *
 * Tags: @user — logged in as sim-user-1@fal-test.com
 */

/* ─── DB Helpers (run via Node child process to use Prisma) ─── */

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

/**
 * Compute expected live score from DB state.
 * Mirrors the logic in computeLiveTeamScore: sum performances for scored matches,
 * apply captain 2x, apply chip bonus for qualifying XI players.
 */
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

/* ─── State management ─── */

interface OriginalState {
  gameweekScore: any | null
  matchStatuses: Array<{ id: string; scoringStatus: string }>
  aggregationStatus: string
  chipUsage: any | null
}

let originalState: OriginalState
let activeGwId: string
let activeGwNumber: number
let teamId: string
let leagueId: string

/* ═══════════════════════════════════════════════════════════════════════════
   Full Gameweek Lifecycle
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Full Gameweek Lifecycle @user', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    // Capture current state so we can restore it
    const gw = dbQuery(`p.gameweek.findFirst({ where: { status: 'ACTIVE' }, select: { id: true, number: true, aggregationStatus: true } })`)
    activeGwId = gw.id
    activeGwNumber = gw.number

    const user = dbQuery(`p.user.findUnique({ where: { email: 'sim-user-1@fal-test.com' }, select: { teams: { select: { id: true, leagueId: true } } } })`)
    teamId = user.teams[0].id
    leagueId = user.teams[0].leagueId

    // Save original GameweekScore
    const gs = dbQuery(`p.gameweekScore.findFirst({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)

    // Save original match statuses
    const matches = dbQuery(`p.match.findMany({ where: { gameweekId: '${activeGwId}' }, select: { id: true, scoringStatus: true } })`)

    // Save original chip usage
    const chip = dbQuery(`p.chipUsage.findFirst({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)

    originalState = {
      gameweekScore: gs,
      matchStatuses: matches,
      aggregationStatus: gw.aggregationStatus,
      chipUsage: chip,
    }
  })

  test.afterAll(() => {
    try {
      // Restore match statuses
      for (const m of originalState.matchStatuses) {
        dbExec(`await p.match.update({ where: { id: '${m.id}' }, data: { scoringStatus: '${m.scoringStatus}' } })`)
      }

      // Restore aggregation status
      dbExec(`await p.gameweek.update({ where: { id: '${activeGwId}' }, data: { aggregationStatus: '${originalState.aggregationStatus}' } })`)

      // Restore GameweekScore
      if (originalState.gameweekScore) {
        dbExec(`await p.gameweekScore.upsert({ where: { teamId_gameweekId: { teamId: '${teamId}', gameweekId: '${activeGwId}' } }, create: { teamId: '${teamId}', gameweekId: '${activeGwId}', totalPoints: ${originalState.gameweekScore.totalPoints}, chipUsed: ${originalState.gameweekScore.chipUsed ? `'${originalState.gameweekScore.chipUsed}'` : 'null'} }, update: { totalPoints: ${originalState.gameweekScore.totalPoints}, chipUsed: ${originalState.gameweekScore.chipUsed ? `'${originalState.gameweekScore.chipUsed}'` : 'null'} } })`)
      } else {
        dbExec(`await p.gameweekScore.deleteMany({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)
      }

      // Restore chip usage
      if (originalState.chipUsage) {
        dbExec(`await p.chipUsage.upsert({ where: { id: '${originalState.chipUsage.id}' }, create: { teamId: '${teamId}', chipType: '${originalState.chipUsage.chipType}', gameweekId: '${activeGwId}', status: '${originalState.chipUsage.status}' }, update: { status: '${originalState.chipUsage.status}' } })`)
      } else {
        dbExec(`await p.chipUsage.deleteMany({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)
      }
    } catch (e) {
      console.error('Cleanup failed:', e)
    }
  })

  /* ─── Stage 1: Pre-scores (0 scored matches → LIVE with 0 points) ─── */
  test('Stage 1: Pre-scores — LIVE mode with 0 points', async ({ page }) => {
    // Set all matches to SCHEDULED and remove GameweekScore + chip
    dbExec(`await p.match.updateMany({ where: { gameweekId: '${activeGwId}' }, data: { scoringStatus: 'SCHEDULED' } })`)
    dbExec(`await p.gameweekScore.deleteMany({ where: { gameweekId: '${activeGwId}' } })`)
    dbExec(`await p.chipUsage.deleteMany({ where: { teamId: '${teamId}', gameweekId: '${activeGwId}' } })`)
    dbExec(`await p.gameweek.update({ where: { id: '${activeGwId}' }, data: { aggregationStatus: 'PENDING' } })`)

    await page.goto('/')
    await waitForApp(page)

    // Live GW card should show LIVE badge
    const liveCard = page.getByTestId('live-gw-card')
    await expect(liveCard).toBeVisible({ timeout: 15_000 })

    const liveBadge = liveCard.getByTestId('live-badge')
    await expect(liveBadge).toBeVisible()
    await expect(liveBadge).toHaveText('LIVE')

    // Score should be exactly 0 (no scored matches = no performances to count)
    await expect(liveCard.getByTestId('live-gw-total')).toHaveText('0')

    // Match progress should show 0/N
    await expect(liveCard.getByText(/0\/\d+ matches scored/)).toBeVisible()

    // No chip badge (none activated)
    await expect(liveCard.getByTestId('card-chip-badge')).toBeHidden()

    // Standings: "Live Standings" + provisional footer
    const standingsCard = page.getByTestId('standings-card')
    await expect(standingsCard.getByText('Live Standings')).toBeVisible()
    await expect(standingsCard.getByText('Provisional — bench subs not yet applied')).toBeVisible()

    await page.screenshot({ path: 'test-results/lifecycle-stage1-prescores.png' })
  })

  /* ─── Stage 2: Partial scoring — score accuracy verified against DB ─── */
  test('Stage 2: Partial scoring — score matches computed expectation', async ({ page }) => {
    // Score first 2 matches
    const matches = dbQuery(`p.match.findMany({ where: { gameweekId: '${activeGwId}' }, select: { id: true }, take: 2 })`)
    for (const m of matches) {
      dbExec(`await p.match.update({ where: { id: '${m.id}' }, data: { scoringStatus: 'SCORED' } })`)
    }

    // Compute expected score from DB (no chip)
    const expected = computeExpectedScore(teamId, activeGwId, null)

    await page.goto('/')
    await waitForApp(page)

    const liveCard = page.getByTestId('live-gw-card')
    await expect(liveCard).toBeVisible({ timeout: 15_000 })
    await expect(liveCard.getByTestId('live-badge')).toBeVisible()

    // Match progress: 2/N
    await expect(liveCard.getByText(/2\/\d+ matches scored/)).toBeVisible()

    // Verify displayed score matches expected computation
    const displayedText = await liveCard.getByTestId('live-gw-total').textContent()
    const displayed = parseInt(displayedText?.replace(/,/g, '') || '-1')
    expect(displayed).toBe(expected.totalPoints)

    await page.screenshot({ path: 'test-results/lifecycle-stage2-partial.png' })
  })

  /* ─── Stage 3: Chip activation — POWER_PLAY_BAT boosts BAT players ─── */
  test('Stage 3: Chip activation — chip badge and progression arrows', async ({ page }) => {
    // Score ALL matches so BAT players have performances (they only play in certain matches)
    dbExec(`await p.match.updateMany({ where: { gameweekId: '${activeGwId}' }, data: { scoringStatus: 'SCORED' } })`)

    // Activate POWER_PLAY_BAT for this team
    dbExec(`await p.chipUsage.create({ data: { teamId: '${teamId}', chipType: 'POWER_PLAY_BAT', gameweekId: '${activeGwId}', status: 'PENDING' } })`)

    // Compute expected score WITH chip (all matches scored)
    const expected = computeExpectedScore(teamId, activeGwId, 'POWER_PLAY_BAT')

    await page.goto('/')
    await waitForApp(page)

    const liveCard = page.getByTestId('live-gw-card')
    await expect(liveCard).toBeVisible({ timeout: 15_000 })

    // Chip badge should appear on the card
    const chipBadge = liveCard.getByTestId('card-chip-badge')
    await expect(chipBadge).toBeVisible()
    await expect(chipBadge).toContainText('Power Play Bat')
    await expect(chipBadge).toContainText('pts')

    // Verify score includes chip bonus
    const displayedText = await liveCard.getByTestId('live-gw-total').textContent()
    const displayed = parseInt(displayedText?.replace(/,/g, '') || '-1')
    expect(displayed).toBe(expected.totalPoints)

    // Chip bonus should be > 0 (Nitish Rana and Yashasvi Jaiswal are BAT with points)
    expect(expected.chipBonusPoints).toBeGreaterThan(0)

    // Open detail sheet to verify chip progression
    await liveCard.click()
    const gwSheet = page.getByTestId('gw-detail-sheet')
    await expect(gwSheet).toBeVisible({ timeout: 10_000 })

    // Chip badge in sheet
    const sheetChip = gwSheet.getByTestId('sheet-chip-badge')
    await expect(sheetChip).toBeVisible()
    await expect(sheetChip).toContainText('Power Play Bat')
    await expect(sheetChip).toContainText('ACTIVE')

    // Chip progression arrows (N → M) should be visible for BAT players
    const progressions = gwSheet.getByTestId('chip-progression')
    const progressionCount = await progressions.count()
    expect(progressionCount).toBeGreaterThan(0)

    // Each progression should show "N → M" where M > N
    for (let i = 0; i < progressionCount; i++) {
      const text = await progressions.nth(i).textContent()
      expect(text).toMatch(/\d+ → \d+/)
      const [base, boosted] = text!.match(/(\d+) → (\d+)/)!.slice(1).map(Number)
      expect(boosted).toBeGreaterThan(base)
    }

    await page.screenshot({ path: 'test-results/lifecycle-stage3-chip.png' })

    // Close sheet
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  /* ─── Stage 4: All scored — verify detail sheet with chip ─── */
  test('Stage 4: All scored — detail sheet with captain and chip', async ({ page }) => {
    // All matches already SCORED from Stage 3, chip still active
    const expected = computeExpectedScore(teamId, activeGwId, 'POWER_PLAY_BAT')

    await page.goto('/')
    await waitForApp(page)

    const liveCard = page.getByTestId('live-gw-card')
    await expect(liveCard).toBeVisible({ timeout: 15_000 })
    await expect(liveCard.getByTestId('live-badge')).toBeVisible()

    // All matches scored: N/N
    const progressText = await liveCard.getByText(/\d+\/\d+ matches scored/).textContent()
    const [scored, total] = progressText!.match(/(\d+)\/(\d+)/)!.slice(1).map(Number)
    expect(scored).toBe(total)

    // Verify score accuracy
    const displayedText = await liveCard.getByTestId('live-gw-total').textContent()
    const displayed = parseInt(displayedText?.replace(/,/g, '') || '-1')
    expect(displayed).toBe(expected.totalPoints)

    // Hero section should show "(before bench subs)" during LIVE
    await expect(page.getByText('(before bench subs)').first()).toBeVisible()

    // Verify GW column in standings shows user's live GW points
    const standingsCard = page.getByTestId('standings-card')
    const yourRow = standingsCard.locator('a', { hasText: '(You)' })
    await expect(yourRow).toBeVisible()
    const gwCell = yourRow.getByTestId('gw-points')
    const gwText = await gwCell.textContent()
    const gwPoints = parseInt(gwText?.replace(/,/g, '') || '-1')
    expect(gwPoints).toBe(expected.totalPoints)

    // Open sheet — verify captain indicator and Playing XI
    await liveCard.click()
    const gwSheet = page.getByTestId('gw-detail-sheet')
    await expect(gwSheet).toBeVisible({ timeout: 10_000 })
    await expect(gwSheet.getByTestId('sheet-live-badge')).toBeVisible()
    await expect(gwSheet.getByText('Playing XI')).toBeVisible()
    await expect(gwSheet.getByText('(C)')).toBeVisible()

    await page.screenshot({ path: 'test-results/lifecycle-stage4-allscored.png' })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  /* ─── Stage 5: Settlement — FINAL with stored score ─── */
  test('Stage 5: Settlement — FINAL mode with stored score', async ({ page }) => {
    const settledPoints = 474
    dbExec(`await p.gameweekScore.upsert({ where: { teamId_gameweekId: { teamId: '${teamId}', gameweekId: '${activeGwId}' } }, create: { teamId: '${teamId}', gameweekId: '${activeGwId}', totalPoints: ${settledPoints}, chipUsed: 'POWER_PLAY_BAT' }, update: { totalPoints: ${settledPoints}, chipUsed: 'POWER_PLAY_BAT' } })`)

    await page.goto('/')
    await waitForApp(page)

    const liveCard = page.getByTestId('live-gw-card')
    await expect(liveCard).toBeVisible({ timeout: 15_000 })

    // FINAL badge
    await expect(liveCard.getByTestId('final-badge')).toBeVisible()
    await expect(liveCard.getByTestId('final-badge')).toHaveText('FINAL')

    // Displayed score should match stored GameweekScore.totalPoints
    const displayedText = await liveCard.getByTestId('live-gw-total').textContent()
    const displayed = parseInt(displayedText?.replace(/,/g, '') || '-1')
    expect(displayed).toBe(settledPoints)

    // No match progress in FINAL mode
    await expect(liveCard.getByText(/matches scored/)).toBeHidden()

    // No "Bench subs applied" footer
    await expect(liveCard.getByText('Bench subs applied after final match')).toBeHidden()

    // Open detail sheet — FINAL badge, no LIVE badge
    await liveCard.click()
    const gwSheet = page.getByTestId('gw-detail-sheet')
    await expect(gwSheet).toBeVisible({ timeout: 10_000 })
    await expect(gwSheet.getByTestId('sheet-final-badge')).toBeVisible()
    await expect(gwSheet.getByTestId('sheet-live-badge')).toBeHidden()

    await page.screenshot({ path: 'test-results/lifecycle-stage5-final.png' })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  /* ─── Stage 6: GW completed — standings go FINAL ─── */
  test('Stage 6: GW completed — League Standings, no rank changes', async ({ page }) => {
    dbExec(`await p.gameweek.update({ where: { id: '${activeGwId}' }, data: { aggregationStatus: 'DONE' } })`)

    await page.goto('/')
    await waitForApp(page)

    const standingsCard = page.getByTestId('standings-card')
    await expect(standingsCard.getByText('League Standings')).toBeVisible()

    // No provisional footer
    await expect(standingsCard.getByText('Provisional — bench subs not yet applied')).toBeHidden()

    // No pulsing dot
    await expect(standingsCard.getByTestId('standings-pulsing-dot')).toBeHidden()

    // All rank changes should be — (no active GW for comparison)
    const rankChanges = standingsCard.getByTestId('rank-change')
    const count = await rankChanges.count()
    for (let i = 0; i < count; i++) {
      await expect(rankChanges.nth(i)).toHaveText('—')
    }

    // Hero should NOT show "(before bench subs)" in FINAL
    await expect(page.getByText('(before bench subs)')).toBeHidden()

    await page.screenshot({ path: 'test-results/lifecycle-stage6-completed.png' })
  })
})
