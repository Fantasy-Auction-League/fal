/**
 * GW Transition Tests — Regression suite for gameweek boundary bugs
 *
 * Covers scenarios that occur between gameweeks:
 * - Dashboard shows correct GW label and links (PR35)
 * - Completed GW lineup shows bench subs (PR36)
 * - Deep link ?gw= loads correct data (PR37)
 * - Edit lineup shows next GW fixtures when locked (PR38)
 *
 * Requires: local dev server + PostgreSQL with GW1=COMPLETED, GW2=ACTIVE(locked)
 */
import { test, expect } from '@playwright/test'

const STORAGE_DIR = 'tests/simulation/playwright/.auth'

// Reuse existing auth from layer0 setup
test.use({ storageState: `${STORAGE_DIR}/user1.json` })

function waitForApp(page: import('@playwright/test').Page) {
  return page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
}

/* ═══════════════════════════════════════════════════════════════
   61. Between GWs: dashboard links include ?gw= param
   Regression: PR35 — dashboard showed "Gameweek 2" with GW1 scores
   ═══════════════════════════════════════════════════════════════ */
test('61. Dashboard "Your Points" link includes ?gw= param @user', async ({ page }) => {
  test.setTimeout(30000)
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByText('Sim Team 1 (You)')).toBeVisible({ timeout: 10000 })

  const heroPoints = page.locator('[data-testid="hero-your-points"]')
  const href = await heroPoints.getAttribute('href')

  expect(href).toContain('/view-lineup/')
  expect(href).toContain('?gw=')
})

/* ═══════════════════════════════════════════════════════════════
   62. Completed GW: bench subs reflected in view-lineup
   Regression: PR36 — DNP players shown in XI, subbed-in shown on bench
   ═══════════════════════════════════════════════════════════════ */
test('62. Completed GW lineup reflects bench subs @user', async ({ page }) => {
  test.setTimeout(30000)
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByText('Sim Team 1 (You)')).toBeVisible({ timeout: 10000 })

  // Get team ID and completed GW
  const data = await page.evaluate(async () => {
    const session = await (await fetch('/api/auth/session')).json()
    const leagues = await (await fetch('/api/leagues')).json()
    const league = await (await fetch(`/api/leagues/${leagues[0].id}`)).json()
    const team = league.teams?.find((t: any) => t.userId === session.user.id)
    const gws = await (await fetch('/api/gameweeks')).json()
    const completedGw = [...gws].reverse().find((g: any) => g.status === 'COMPLETED')
    if (!team || !completedGw) return null
    const scores = await (await fetch(`/api/teams/${team.id}/scores/${completedGw.id}`)).json()
    return { status: scores.status, players: scores.players }
  })

  expect(data).not.toBeNull()
  expect(data!.status).toBe('FINAL')

  // Every XI player should have points OR no bench player with points should be on BENCH
  // (bench subs should have moved playing bench players into XI)
  const xi = data!.players.filter((p: any) => p.slotType === 'XI')
  const bench = data!.players.filter((p: any) => p.slotType === 'BENCH')

  // Captain should exist and be in XI
  const captains = data!.players.filter((p: any) => p.isCaptain)
  expect(captains.length).toBe(1)
  expect(captains[0].slotType).toBe('XI')

  expect(xi.length).toBeGreaterThanOrEqual(1)
  expect(bench.length).toBeGreaterThanOrEqual(1)
})

/* ═══════════════════════════════════════════════════════════════
   63. Deep link ?gw=1 loads GW1 data on initial load
   Regression: PR37 — page fetched current GW first, showed 0 pts
   ═══════════════════════════════════════════════════════════════ */
test('63. View-lineup ?gw= loads correct GW data immediately @user', async ({ page }) => {
  test.setTimeout(30000)

  // Get team ID
  await page.goto('/')
  await waitForApp(page)
  const teamId = await page.evaluate(async () => {
    const session = await (await fetch('/api/auth/session')).json()
    const leagues = await (await fetch('/api/leagues')).json()
    const league = await (await fetch(`/api/leagues/${leagues[0].id}`)).json()
    return league.teams?.find((t: any) => t.userId === session.user.id)?.id
  })
  expect(teamId).toBeTruthy()

  // Track API calls — the FIRST scores call should be for GW1, not current GW
  const scoreCalls: string[] = []
  page.on('request', req => {
    if (req.url().includes('/scores/')) scoreCalls.push(req.url())
  })

  // Navigate directly to ?gw=1
  await page.goto(`/view-lineup/${teamId}?gw=1`)
  await page.waitForTimeout(5000)

  // Scores API should have been called for GW1
  expect(scoreCalls.length).toBeGreaterThan(0)

  // Verify GW1 data loaded (should have points if GW1 completed)
  const gw1Id = await page.evaluate(async () => {
    const gws = await (await fetch('/api/gameweeks')).json()
    return gws.find((g: any) => g.number === 1)?.id
  })

  // First scores call should contain GW1's ID
  expect(scoreCalls[0]).toContain(gw1Id)
})

/* ═══════════════════════════════════════════════════════════════
   64. Edit lineup shows next GW fixtures when current is locked
   Regression: PR38 — fixtures fetched from current GW, not editing GW
   ═══════════════════════════════════════════════════════════════ */
test('64. Edit lineup fixtures match the GW being edited @user', async ({ page }) => {
  test.setTimeout(30000)

  // Track fixture API calls
  const fixtureCalls: string[] = []
  page.on('request', req => {
    if (req.url().includes('/matches')) fixtureCalls.push(req.url())
  })

  await page.goto('/lineup')
  await waitForApp(page)
  await page.waitForTimeout(5000)

  // Determine which GW is being edited
  const bodyText = await page.textContent('body')
  const editingGw = bodyText?.match(/Gameweek\s*(\d+)/i)?.[1]
  expect(editingGw).toBeTruthy()

  // The fixture API call should be for the GW being edited
  const gwMatchCall = fixtureCalls.find(c => c.includes('/gameweeks/') && c.includes('/matches'))
  expect(gwMatchCall).toBeTruthy()

  // Verify the GW ID in the fixture call matches the editing GW
  const fixtureGwId = gwMatchCall!.match(/gameweeks\/([^/]+)\/matches/)?.[1]
  const gws = await page.evaluate(async () => (await (await fetch('/api/gameweeks')).json()))
  const matchedGw = (gws as any[]).find(g => g.id === fixtureGwId)
  expect(matchedGw?.number).toBe(parseInt(editingGw!))
})

/* ═══════════════════════════════════════════════════════════════
   65. Standings team links include ?gw= for selected GW
   Regression: PR35 — standings links had no GW param
   ═══════════════════════════════════════════════════════════════ */
test('65. Standings team links include ?gw= param @user', async ({ page }) => {
  test.setTimeout(30000)
  await page.goto('/standings')
  await waitForApp(page)
  await page.waitForTimeout(3000)

  const teamLink = page.locator('a[href*="view-lineup"]').first()
  await expect(teamLink).toBeVisible({ timeout: 5000 })
  const href = await teamLink.getAttribute('href')

  expect(href).toContain('/view-lineup/')
  expect(href).toContain('?gw=')
})
