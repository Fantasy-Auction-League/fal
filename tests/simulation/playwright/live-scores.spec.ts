import { test, expect, Page } from '@playwright/test'

/**
 * Live Mid-Gameweek Scores — E2E tests for dashboard UI.
 *
 * These tests verify the live scoring UI elements:
 * - Hero section: GW scores (avg/your/highest), LIVE/FINAL badge, match progress
 * - League Standings with rank changes (AC16.1, AC16.2, AC16.3, AC16.4)
 * - GW detail sheet with chip progression (AC14.1, AC14.2)
 *
 * Tags:
 *   @user — logged in as sim-user-1@fal-test.com
 */

/* ─── Helpers ─── */

async function waitForApp(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await expect(page.getByText('Loading...')).toBeHidden({ timeout: 30_000 }).catch(() => {})
}

/* ═══════════════════════════════════════════════════════════════════════════
   Hero section: LIVE/FINAL badge and GW scores
   ═══════════════════════════════════════════════════════════════════════════ */
test('Hero shows GW scores and LIVE/FINAL badge @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Should show either LIVE or FINAL badge in hero
  const liveBadge = page.getByTestId('hero-live-badge')
  const finalBadge = page.getByTestId('hero-final-badge')
  const hasLive = await liveBadge.isVisible().catch(() => false)
  const hasFinal = await finalBadge.isVisible().catch(() => false)
  expect(hasLive || hasFinal).toBe(true)

  // Should show GW label
  await expect(page.getByText(/^Gameweek \d+$/i)).toBeVisible()

  // Your Points should be visible and tappable
  const yourPoints = page.getByTestId('hero-your-points')
  await expect(yourPoints).toBeVisible()
  await expect(yourPoints.getByText('Your Points')).toBeVisible()

  // If LIVE, should show match progress
  if (hasLive) {
    const matchProgress = page.getByTestId('hero-match-progress')
    await expect(matchProgress).toBeVisible()
    await expect(matchProgress).toHaveText(/\d+\/\d+ matches/)

    // Pulsing dot should exist
    await expect(page.getByTestId('hero-pulsing-dot')).toBeVisible()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   Hero: Your Points navigates to read-only lineup view (PR #20 behavior)
   ═══════════════════════════════════════════════════════════════════════════ */
test('Tapping Your Points navigates to view-lineup @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Tap Your Points — should navigate to /view-lineup/{teamId}
  await page.getByTestId('hero-your-points').click()
  await page.waitForURL(/\/view-lineup\//, { timeout: 10_000 })

  // Should show the lineup view page (shows team name + "Lineup" or pitch/list toggle)
  await expect(page.getByText(/Lineup|Pitch View/i).first()).toBeVisible({ timeout: 10_000 })
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC16.1: Standings header shows "Live Standings" with pulsing dot
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC16.1: Standings header reflects live/final state @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  const standingsCard = page.getByTestId('standings-card')
  await expect(standingsCard).toBeVisible({ timeout: 15_000 })

  // Should show either "Live Standings" or "League Standings"
  const liveHeader = standingsCard.getByText('Live Standings')
  const finalHeader = standingsCard.getByText('League Standings')
  const isLive = await liveHeader.isVisible().catch(() => false)
  const isFinal = await finalHeader.isVisible().catch(() => false)
  expect(isLive || isFinal).toBe(true)

  if (isLive) {
    await expect(standingsCard.getByTestId('standings-pulsing-dot')).toBeVisible()
    const matchBadge = standingsCard.getByTestId('standings-match-progress')
    await expect(matchBadge).toBeVisible()
    await expect(matchBadge).toHaveText(/\d+\/\d+/)
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC16.2: Rank change indicators (↑N, ↓N, —)
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC16.2: Standings show rank change indicators @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  const standingsCard = page.getByTestId('standings-card')
  await expect(standingsCard).toBeVisible({ timeout: 15_000 })

  const rankChangeCells = standingsCard.getByTestId('rank-change')
  const count = await rankChangeCells.count()
  expect(count).toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    const text = await rankChangeCells.nth(i).textContent()
    expect(text).toMatch(/^(↑\d+|↓\d+|—)$/)
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC16.4: Provisional footer during live mode
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC16.4: Provisional footer shown during live mode @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  const standingsCard = page.getByTestId('standings-card')
  await expect(standingsCard).toBeVisible({ timeout: 15_000 })

  const isLive = await standingsCard.getByText('Live Standings').isVisible().catch(() => false)

  if (isLive) {
    await expect(standingsCard.getByText('Provisional — bench subs not yet applied')).toBeVisible()
  } else {
    await expect(standingsCard.getByText('Provisional — bench subs not yet applied')).toBeHidden()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   Screenshot
   ═══════════════════════════════════════════════════════════════════════════ */
test('Screenshot: Dashboard with live scores @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await page.waitForTimeout(2000)

  await expect(page).toHaveScreenshot('dashboard-live-scores.png', {
    maxDiffPixelRatio: 0.1,
  })
})
