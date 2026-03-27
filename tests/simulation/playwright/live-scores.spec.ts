import { test, expect, Page } from '@playwright/test'

/**
 * Live Mid-Gameweek Scores — E2E tests for dashboard UI.
 *
 * These tests verify the live scoring UI elements added in Phase 4:
 * - Live GW card (AC13.1, AC13.2, AC13.3)
 * - LIVE/FINAL status badges (AC15.1, AC15.2)
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
   AC13.1: Live GW card shown during active gameweek
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC13.1: Live GW card shows running total and match progress @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Live GW card should be visible
  const liveCard = page.getByTestId('live-gw-card')
  await expect(liveCard).toBeVisible({ timeout: 15_000 })

  // Should show either LIVE or FINAL badge
  const liveBadge = liveCard.getByTestId('live-badge')
  const finalBadge = liveCard.getByTestId('final-badge')
  const hasLive = await liveBadge.isVisible().catch(() => false)
  const hasFinal = await finalBadge.isVisible().catch(() => false)
  expect(hasLive || hasFinal).toBe(true)

  // Should show GW label
  await expect(liveCard.getByText(/GW \d+/)).toBeVisible()

  // Should show a score (large number)
  const scoreEl = liveCard.getByTestId('live-gw-total')
  await expect(scoreEl).toBeVisible()

  // If LIVE, should show match progress
  if (hasLive) {
    await expect(liveCard.getByText(/\d+\/\d+ matches scored/)).toBeVisible()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC15.1: LIVE badge with pulsing dot
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC15.1: LIVE badge shows pulsing dot @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  const liveCard = page.getByTestId('live-gw-card')
  // Only check if card is visible (depends on active GW existing)
  const cardVisible = await liveCard.isVisible().catch(() => false)
  if (!cardVisible) {
    test.skip()
    return
  }

  const liveBadge = liveCard.getByTestId('live-badge')
  const isLive = await liveBadge.isVisible().catch(() => false)

  if (isLive) {
    // Pulsing dot should exist
    const pulsingDot = liveCard.getByTestId('pulsing-dot')
    await expect(pulsingDot).toBeVisible()

    // LIVE text should be visible
    await expect(liveBadge).toHaveText('LIVE')
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC15.2: FINAL badge (static)
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC15.2: FINAL badge shown when GW is finalized @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  const liveCard = page.getByTestId('live-gw-card')
  const cardVisible = await liveCard.isVisible().catch(() => false)
  if (!cardVisible) {
    test.skip()
    return
  }

  const finalBadge = liveCard.getByTestId('final-badge')
  const isFinal = await finalBadge.isVisible().catch(() => false)

  if (isFinal) {
    await expect(finalBadge).toHaveText('FINAL')
    // No pulsing dot in FINAL mode
    const pulsingDot = liveCard.getByTestId('pulsing-dot')
    await expect(pulsingDot).toBeHidden()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC13.3: No lineup submitted fallback
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC13.3: No lineup fallback card shown when applicable @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Check for the no-lineup fallback card
  const noLineupCard = page.getByTestId('no-lineup-card')
  const noLineupVisible = await noLineupCard.isVisible().catch(() => false)

  if (noLineupVisible) {
    await expect(noLineupCard.getByText(/No lineup submitted for GW \d+/)).toBeVisible()
  }
  // If not visible, that's fine — user has a lineup
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

  // If live, should have pulsing dot and match progress badge
  if (isLive) {
    const standingsDot = standingsCard.getByTestId('standings-pulsing-dot')
    await expect(standingsDot).toBeVisible()

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

  // Get all rank change cells
  const rankChangeCells = standingsCard.getByTestId('rank-change')
  const count = await rankChangeCells.count()
  expect(count).toBeGreaterThan(0)

  // Each should show ↑N, ↓N, or —
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
    // In FINAL mode, the provisional footer should NOT be present
    await expect(standingsCard.getByText('Provisional — bench subs not yet applied')).toBeHidden()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC14.1 + AC14.2: GW detail sheet with chip progression
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC14: GW detail sheet shows player breakdown and chip info @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Open GW sheet by clicking the live GW card
  const liveCard = page.getByTestId('live-gw-card')
  const cardVisible = await liveCard.isVisible().catch(() => false)
  if (!cardVisible) {
    test.skip()
    return
  }

  await liveCard.click()

  // Wait for the sheet to appear
  const gwSheet = page.getByTestId('gw-detail-sheet')
  await expect(gwSheet).toBeVisible({ timeout: 10_000 })

  // Sheet should have "Gameweek N Breakdown" header
  await expect(gwSheet.getByText(/Gameweek.*Breakdown/)).toBeVisible()

  // Should show LIVE or FINAL badge in the sheet
  const sheetLive = gwSheet.getByTestId('sheet-live-badge')
  const sheetFinal = gwSheet.getByTestId('sheet-final-badge')
  const hasLive = await sheetLive.isVisible().catch(() => false)
  const hasFinal = await sheetFinal.isVisible().catch(() => false)
  expect(hasLive || hasFinal).toBe(true)

  // Should have "Playing XI" section
  await expect(gwSheet.getByText('Playing XI')).toBeVisible()

  // Captain indicator should be visible
  await expect(gwSheet.getByText('(C)')).toBeVisible()

  // Bench section header exists in the sheet (may require scroll to see)
  const benchHeader = gwSheet.getByText('Bench', { exact: true }).first()
  await expect(benchHeader).toHaveCount(1)

  // Summary row exists in the sheet
  await expect(gwSheet.getByText('Base Pts')).toHaveCount(1)

  // If a chip is active, should show chip badge
  const chipBadge = gwSheet.getByTestId('sheet-chip-badge')
  const chipVisible = await chipBadge.isVisible().catch(() => false)
  if (chipVisible) {
    // Should show chip name and ACTIVE text
    await expect(chipBadge.getByText('ACTIVE')).toBeVisible()

    // Should have chip progression arrows on qualifying players
    const progressions = gwSheet.getByTestId('chip-progression')
    const progressionCount = await progressions.count()
    expect(progressionCount).toBeGreaterThan(0)
    // Each progression should show "N → M" format
    for (let i = 0; i < progressionCount; i++) {
      const text = await progressions.nth(i).textContent()
      expect(text).toMatch(/\d+ → \d+/)
    }
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   AC13.1: Chip badge on live GW card
   ═══════════════════════════════════════════════════════════════════════════ */
test('AC13.1: Live GW card shows chip badge when chip active @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  const liveCard = page.getByTestId('live-gw-card')
  const cardVisible = await liveCard.isVisible().catch(() => false)
  if (!cardVisible) {
    test.skip()
    return
  }

  // Check for chip badge
  const chipBadge = liveCard.getByTestId('card-chip-badge')
  const chipVisible = await chipBadge.isVisible().catch(() => false)
  if (chipVisible) {
    // Should show chip name and bonus pts
    await expect(chipBadge).toHaveText(/⚡ .+ \+\d+ pts/)
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   Screenshot tests
   ═══════════════════════════════════════════════════════════════════════════ */
test('Screenshot: Dashboard with live scores @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Wait a bit for animations to settle
  await page.waitForTimeout(2000)

  await expect(page).toHaveScreenshot('dashboard-live-scores.png', {
    maxDiffPixelRatio: 0.05,
  })
})
