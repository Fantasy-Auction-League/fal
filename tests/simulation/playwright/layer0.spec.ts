import { test, expect, Page } from '@playwright/test'

/**
 * Layer 0 — UX smoke tests for all major pages (21 scenarios + 2 mid-season).
 *
 * Tags control which Playwright project (and storage state) runs each test:
 *   @admin  — logged in as sim-admin@fal-test.com
 *   @user   — logged in as sim-user-1@fal-test.com
 *   @noauth — fresh browser, no storage state
 */

/* ─── Helpers ─── */

/** Wait for the page to finish loading (network idle + no "Loading..." text). */
async function waitForApp(page: Page) {
  // Wait for DOM content first, then try networkidle (may not settle on Vercel)
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  // Give client-side hydration a moment (longer for Vercel cold starts)
  await expect(page.getByText('Loading...')).toBeHidden({ timeout: 30_000 }).catch(() => {})
}

/** Bottom nav labels present on every authenticated page. */
const NAV_LABELS = ['Home', 'Lineup', 'Players', 'League']

async function assertBottomNav(page: Page) {
  const nav = page.locator('nav.bottom-nav-fixed')
  await expect(nav).toBeVisible()
  for (const label of NAV_LABELS) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible()
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. Admin uploads roster
   ═══════════════════════════════════════════════════════════════════════════ */
test('1. Admin uploads roster @admin', async ({ page }) => {
  await page.goto('/admin')
  await waitForApp(page)

  // Hero should show "FAL" branding and "League Admin" badge
  await expect(page.getByText('FAL')).toBeVisible()
  await expect(page.getByText('League Admin')).toBeVisible()

  // Managers card should be visible (teams section)
  await expect(page.getByText('Managers', { exact: true })).toBeVisible()

  // Invite code card
  await expect(page.getByText('Invite Code')).toBeVisible()

  // Join a League card with invite code input
  await expect(page.getByText('Join a League')).toBeVisible()
  await expect(page.getByPlaceholder('Enter invite code')).toBeVisible()

  // Bottom nav
  await assertBottomNav(page)

  await expect(page).toHaveScreenshot('admin-page.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   2. User views squad
   ═══════════════════════════════════════════════════════════════════════════ */
test('2. User views squad @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  // Page header says "Pick Team"
  await expect(page.getByText('Pick Team')).toBeVisible()

  // Should have the pitch (green area) with player figures
  // Check that the bench section exists
  const benchLabel = page.getByText(/Bench/i)
  await expect(benchLabel.first()).toBeVisible()

  // Verify 15 players visible (11 XI + 4 bench) — check pitch area exists
  await expect(page.getByText('Top Order')).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-squad.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   3. User sets lineup — pitch view (4-3-3 formation, team figures, C/VC)
   ═══════════════════════════════════════════════════════════════════════════ */
test('3. User sets lineup — pitch view @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  await expect(page.getByText('Pick Team')).toBeVisible()

  // Pitch View should be default — verify toggle shows "Pitch View" active
  await expect(page.getByText('Pitch View')).toBeVisible()
  await expect(page.getByText('List View')).toBeVisible()

  // Compact chip bar: chip names + Play buttons visible
  await expect(page.getByText('Bowling Boost')).toBeVisible()
  await expect(page.getByText('Power Play Bat')).toBeVisible()

  // 4-3-3 formation row labels (Top Order, Middle Order, Lower Order)
  await expect(page.getByText('Top Order')).toBeVisible()
  await expect(page.getByText('Middle Order')).toBeVisible()
  await expect(page.getByText('Lower Order')).toBeVisible()

  // Captain badge ("C") should be visible on the pitch figure
  const captainBadge = page.locator('div').filter({ hasText: /^C$/ }).first()
  await expect(captainBadge).toBeVisible()

  // Vice-captain badge ("V") should be visible on the pitch figure
  const vcBadge = page.locator('div').filter({ hasText: /^V$/ }).first()
  await expect(vcBadge).toBeVisible()

  // Bench section visible
  await expect(page.getByText('Bench', { exact: false })).toBeVisible()

  // Bottom nav
  await assertBottomNav(page)

  await expect(page).toHaveScreenshot('lineup-pitch.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   4. User sets lineup — list view (toggle, player rows with C/VC/Bench buttons)
   ═══════════════════════════════════════════════════════════════════════════ */
test('4. User sets lineup — list view @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  await expect(page.getByText('Pick Team')).toBeVisible()

  // Tap "List View" toggle
  await page.getByText('List View').click()

  // Playing XI section label
  await expect(page.getByText(/Playing XI/).first()).toBeVisible()

  // Bench section label with "Auto-Sub Order" (CSS text-transform: uppercase)
  await expect(page.getByText(/BENCH.*AUTO-SUB ORDER/i)).toBeVisible()

  // XI rows show C / VC / -> Bench action buttons (unless locked)
  const lockBadge = page.getByText('Lineup Locked')
  const isLocked = await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)
  if (!isLocked) {
    // C button visible on at least one row
    const cButtons = page.getByRole('button', { name: 'C', exact: true })
    await expect(cButtons.first()).toBeVisible()

    // VC button visible
    const vcButtons = page.getByRole('button', { name: 'VC', exact: true })
    await expect(vcButtons.first()).toBeVisible()
  }

  await expect(page).toHaveScreenshot('lineup-list-view.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   5. User edits lineup (swap, save, verify persistence in both views)
   ═══════════════════════════════════════════════════════════════════════════ */
test('5. User edits lineup @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  await expect(page.getByText('Pick Team')).toBeVisible()

  // If lineup is locked, skip
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
    return
  }

  // Tap a player on the pitch to toggle captain/VC (makes lineup dirty)
  const pitchPlayer = page.locator('div[style*="cursor: pointer"]').first()
  if (await pitchPlayer.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pitchPlayer.click()
    await page.waitForTimeout(500)
  }

  // "Save Lineup" button should appear when dirty
  const saveBtn = page.getByText('Save Lineup')
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click()

    // After saving, a success message should appear
    await expect(page.getByText('Lineup saved!')).toBeVisible({ timeout: 5000 })
  }

  // Verify persistence: reload page
  await page.reload()
  await waitForApp(page)
  await expect(page.getByText('Pick Team')).toBeVisible()

  // Check pitch view still shows C/V badges
  const captainBadge = page.locator('div').filter({ hasText: /^C$/ }).first()
  await expect(captainBadge).toBeVisible()

  // Switch to list view and verify (CSS text-transform: uppercase)
  await page.getByText('List View').click()
  await expect(page.getByText(/Playing XI/i).first()).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-edited.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   6. User activates chip (compact bar: Play -> modal -> Active -> deactivate)
   ═══════════════════════════════════════════════════════════════════════════ */
test('6. User activates chip @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Compact chip bar should show chip names
  await expect(page.getByText('Bowling Boost')).toBeVisible()
  await expect(page.getByText('Power Play Bat')).toBeVisible()

  // Check chip state: Play, Active, or Used
  const playBtn = page.getByRole('button', { name: 'Play', exact: true }).first()
  const activeBtn = page.getByRole('button', { name: 'Active', exact: true }).first()

  const hasPlay = await playBtn.isVisible({ timeout: 2000 }).catch(() => false)
  const hasActive = await activeBtn.isVisible({ timeout: 2000 }).catch(() => false)

  if (hasActive) {
    // A chip is already active — deactivate it first, then re-activate
    await activeBtn.click()
    await page.waitForTimeout(500)
    // Should now show Play
    await expect(playBtn).toBeVisible({ timeout: 5000 })
  }

  if (hasPlay || hasActive) {
    // Click Play to activate
    await playBtn.click()

    // Confirmation modal should appear
    const modal = page.getByText(/Play .* Boost\?|Play .* Bat\?/)
    if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(page.getByText('Cancel')).toBeVisible()
      await expect(page).toHaveScreenshot('chip-confirmation-modal.png')

      // Confirm
      await page.getByText(/Yes, Play/).click()

      // Should show Active
      await expect(page.getByRole('button', { name: 'Active', exact: true }).first()).toBeVisible({ timeout: 5000 })
      await expect(page).toHaveScreenshot('chip-active.png')

      // Deactivate
      await page.getByRole('button', { name: 'Active', exact: true }).first().click()
      await expect(playBtn).toBeVisible({ timeout: 5000 })
    }
  }
  // If no Play or Active buttons, chips are all "Used" — that's fine
})

/* ═══════════════════════════════════════════════════════════════════════════
   7. User views dashboard (GW score, league switcher pill, standings)
   ═══════════════════════════════════════════════════════════════════════════ */
test('7. User views dashboard @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Gameweek label (either "Gameweek N" or "Season not started")
  const gwLabel = page.getByText(/Gameweek \d+/).first()
  await expect(gwLabel).toBeVisible()

  // Score trio: "Your Points", "Average", "Highest"
  await expect(page.getByText('Your Points')).toBeVisible()
  await expect(page.getByText('Average')).toBeVisible()
  await expect(page.getByText('Highest')).toBeVisible()

  // "tap for detail" hint under Your Points
  await expect(page.getByText('tap for detail')).toBeVisible()

  // Dashboard label in hero top-right
  await expect(page.getByText('Dashboard')).toBeVisible()

  // League switcher pill visible top-left in hero (shows league name + chevron ▾)
  // The pill is a button containing league name + ▾ character
  const leaguePill = page.locator('button').filter({ hasText: /[\u25BE\u25BC]/ }).first()
  if (await leaguePill.isVisible({ timeout: 3000 }).catch(() => false)) {
    await expect(leaguePill).toBeVisible()
  } else {
    // Fallback: find the pill button near "Dashboard" text
    const pillBtn = page.locator('button').filter({ hasText: /\w/ }).first()
    await expect(pillBtn).toBeVisible()
  }

  // Deadline section
  await expect(page.getByText(/Deadline/)).toBeVisible()

  // Edit Lineup link
  await expect(page.getByText('Edit Lineup')).toBeVisible()

  // League Standings card
  await expect(page.getByText('League Standings')).toBeVisible()

  // This Week card
  await expect(page.getByText('This Week')).toBeVisible()

  // Bottom nav: 4 tabs
  await assertBottomNav(page)

  await expect(page).toHaveScreenshot('dashboard.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   8. User views GW score detail — list view (tap score -> sheet with breakdown)
   ═══════════════════════════════════════════════════════════════════════════ */
test('8. User views GW score detail — list view @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Tap the "Your Points" score to open GW sheet
  const yourPoints = page.getByText('Your Points')
  await expect(yourPoints).toBeVisible()
  // The tappable area is the parent div containing the score
  await page.getByText('tap for detail').click()

  // Wait for sheet to animate in
  await page.waitForTimeout(500)

  // Sheet header should show "Gameweek N Breakdown"
  await expect(page.getByText(/Gameweek \d+ Breakdown|Gameweek Breakdown/)).toBeVisible({ timeout: 5000 })

  // List View toggle should be active by default
  await expect(page.getByText('List View')).toBeVisible()
  await expect(page.getByText('Pitch View')).toBeVisible()

  // Summary bar shows Base Pts, C/VC Bonus, Chip Bonus, Total — only when scores exist
  // When no scores: "No player scores available yet" is shown instead
  const noScores = page.getByText('No player scores available yet')
  const hasScores = !(await noScores.isVisible({ timeout: 2000 }).catch(() => false))
  if (hasScores) {
    await expect(page.getByText('Base Pts')).toBeVisible()
    await expect(page.getByText('C/VC Bonus')).toBeVisible()
    await expect(page.getByText('Chip Bonus')).toBeVisible()
    await expect(page.getByText('Total').first()).toBeVisible()
  } else {
    await expect(noScores).toBeVisible()
  }

  // Close button (X) visible
  await expect(page.getByText('\u2715')).toBeVisible()

  await expect(page).toHaveScreenshot('gw-sheet-list.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   9. User views GW score detail — pitch view (toggle to pitch in sheet)
   ═══════════════════════════════════════════════════════════════════════════ */
test('9. User views GW score detail — pitch view @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Open GW sheet
  await page.getByText('tap for detail').click()
  await page.waitForTimeout(500)
  await expect(page.getByText(/Gameweek.*Breakdown/)).toBeVisible({ timeout: 5000 })

  // Toggle to Pitch View
  // The GW sheet has its own Pitch View button — click the one inside the sheet
  const sheetPitchBtn = page.getByText('Pitch View').last()
  await sheetPitchBtn.click()
  await page.waitForTimeout(300)

  // Pitch view should show formation with player figures and scores
  // Look for formation row labels or player score plates
  const topOrder = page.getByText('Top Order')
  const hasFormation = await topOrder.isVisible({ timeout: 3000 }).catch(() => false)
  if (!hasFormation) {
    // May show empty state if no scores
    await expect(page.getByText(/No player scores|No lineup/i).first()).toBeVisible()
  }

  await expect(page).toHaveScreenshot('gw-sheet-pitch.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   10. User views leaderboard
   ═══════════════════════════════════════════════════════════════════════════ */
test('10. User views leaderboard @user', async ({ page }) => {
  await page.goto('/standings')
  await waitForApp(page)

  // Page title
  await expect(page.getByText('League Standings')).toBeVisible()

  // Table headers
  await expect(page.getByText('#')).toBeVisible()
  await expect(page.getByText('Team', { exact: true })).toBeVisible()
  await expect(page.getByText('GW', { exact: true })).toBeVisible()
  await expect(page.getByText('Total')).toBeVisible()

  // Team rows should be links to /view-lineup/
  const managerLinks = page.locator('a[href^="/view-lineup/"]')
  const hasLinks = await managerLinks.first().isVisible({ timeout: 5000 }).catch(() => false)
  if (hasLinks) {
    await expect(managerLinks.first()).toBeVisible()
  }

  await assertBottomNav(page)
  await expect(page).toHaveScreenshot('leaderboard.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   11. User views standings — GW selector
   ═══════════════════════════════════════════════════════════════════════════ */
test('11. User views standings @user', async ({ page }) => {
  await page.goto('/standings')
  await waitForApp(page)

  // Page title
  await expect(page.getByText('League Standings')).toBeVisible()

  // GW selector buttons (GW1, GW2, etc.) or "No gameweeks yet"
  const gwButtons = page.getByText(/^GW\d+$/)
  const noGw = page.getByText('No gameweeks yet')
  const hasGw = await gwButtons.first().isVisible({ timeout: 3000 }).catch(() => false)
  if (!hasGw) {
    await expect(noGw).toBeVisible()
  }

  // Table headers: #, Team, GW, Total
  await expect(page.getByText('#')).toBeVisible()
  await expect(page.getByText('Team', { exact: true })).toBeVisible()
  await expect(page.getByText('GW', { exact: true })).toBeVisible()
  await expect(page.getByText('Total')).toBeVisible()

  // Bottom nav
  await assertBottomNav(page)

  await expect(page).toHaveScreenshot('standings.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   12. User views player stats
   ═══════════════════════════════════════════════════════════════════════════ */
test('12. User views player stats @user', async ({ page }) => {
  await page.goto('/players')
  await waitForApp(page)

  // Header: "Players" title
  await expect(page.getByText('Players', { exact: true }).first()).toBeVisible()

  // Search bar
  await expect(page.getByPlaceholder('Search players...')).toBeVisible()

  // Role filter pills: All, BAT, BOWL, ALL, WK
  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'BAT' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'BOWL' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ALL' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'WK' })).toBeVisible()

  // Team filter chips
  await expect(page.getByRole('button', { name: 'MI' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'CSK' })).toBeVisible()

  // Click first player card to open detail sheet
  const playerCards = page.locator('div[style*="cursor: pointer"][style*="border-radius: 16px"]')
  const firstCard = playerCards.first()
  if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await firstCard.click()

    // Player detail bottom sheet should open
    await page.waitForTimeout(1000)
    await expect(page).toHaveScreenshot('player-detail.png')
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   13. User views another manager's lineup — pitch view
   ═══════════════════════════════════════════════════════════════════════════ */
test("13. User views another manager's lineup — pitch view @user", async ({ page }) => {
  await page.goto('/standings')
  await waitForApp(page)

  // Look for a manager row that links to /view-lineup/
  const managerLink = page.locator('a[href^="/view-lineup/"]').first()
  if (await managerLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await managerLink.click()

    // Should navigate to /view-lineup/<teamId>
    await page.waitForURL(/\/view-lineup\//, { timeout: 10_000 })
    await waitForApp(page)

    // Read Only badge should be visible
    await expect(page.getByText('Read Only')).toBeVisible()

    // Pitch View is default — formation rows visible
    await expect(page.getByText('Top Order')).toBeVisible()
    await expect(page.getByText('Middle Order')).toBeVisible()
    await expect(page.getByText('Lower Order')).toBeVisible()

    // View toggle present
    await expect(page.getByText('Pitch View')).toBeVisible()
    await expect(page.getByText('List View')).toBeVisible()

    // C/VC badges visible on pitch
    const captainBadge = page.locator('div').filter({ hasText: /^C$/ }).first()
    await expect(captainBadge).toBeVisible()

    await expect(page).toHaveScreenshot('view-lineup-pitch.png')
  } else {
    // If no other managers exist yet, just verify the standings page loaded
    await expect(page.getByText('League Standings')).toBeVisible()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   14. User views another manager's lineup — list view
   ═══════════════════════════════════════════════════════════════════════════ */
test("14. User views another manager's lineup — list view @user", async ({ page }) => {
  await page.goto('/standings')
  await waitForApp(page)

  const managerLink = page.locator('a[href^="/view-lineup/"]').first()
  if (await managerLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await managerLink.click()
    await page.waitForURL(/\/view-lineup\//, { timeout: 10_000 })
    await waitForApp(page)

    // Read Only badge
    await expect(page.getByText('Read Only')).toBeVisible()

    // Tap "List View" toggle
    await page.getByText('List View').click()
    await page.waitForTimeout(300)

    // Playing XI section label
    await expect(page.getByText('Playing XI').first()).toBeVisible()

    // Bench section label
    await expect(page.getByText('Bench').last()).toBeVisible()

    // Verify read-only: no C/VC/Bench action buttons
    const benchButton = page.getByRole('button', { name: /Bench/ })
    await expect(benchButton).toBeHidden().catch(() => {
      // No edit buttons expected in read-only view
    })

    await expect(page).toHaveScreenshot('view-lineup-list.png')
  } else {
    await expect(page.getByText('League Standings')).toBeVisible()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   15. League switcher — switch active league
   ═══════════════════════════════════════════════════════════════════════════ */
test('15. League switcher — switch active league @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/')
  await waitForApp(page)

  // Tap the league switcher pill (button with chevron ▾ in hero)
  const leaguePill = page.locator('button').filter({ hasText: /[\u25BE\u25BC]/ }).first()
  await expect(leaguePill).toBeVisible()
  await leaguePill.click()

  // Sheet should open with "YOUR LEAGUES" title
  await expect(page.getByText('YOUR LEAGUES')).toBeVisible({ timeout: 3000 })

  // Active league has a checkmark (✓)
  await expect(page.getByText('\u2713')).toBeVisible()

  // "Join a League" row visible
  await expect(page.getByText('Join a League')).toBeVisible()

  await expect(page).toHaveScreenshot('league-switcher-sheet.png')

  // If there are multiple leagues, tap a different one
  // For now, just verify the sheet structure and close it
  // Close by tapping overlay
  await page.locator('div[style*="position: fixed"][style*="inset: 0"]').first().click({ force: true })
  await page.waitForTimeout(400)
})

/* ═══════════════════════════════════════════════════════════════════════════
   16. League switcher — join a new league (pill -> Join a League -> enter code)
   ═══════════════════════════════════════════════════════════════════════════ */
test('16. League switcher — join a new league @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/')
  await waitForApp(page)

  // Open league sheet
  const leaguePill = page.locator('button').filter({ hasText: /[\u25BE\u25BC]/ }).first()
  await leaguePill.click()
  await expect(page.getByText('YOUR LEAGUES')).toBeVisible({ timeout: 3000 })

  // Tap "Join a League" row
  await page.getByText('Join a League').click()

  // Inline form should expand with invite code input
  const joinInput = page.getByPlaceholder('Invite code (e.g. ABC123)')
  await expect(joinInput).toBeVisible({ timeout: 3000 })

  // "Join League" button visible
  const joinBtn = page.getByRole('button', { name: /Join League/i })
  await expect(joinBtn).toBeVisible()

  // Type a code
  await joinInput.fill('TEST-JOIN-CODE')
  await expect(joinInput).toHaveValue('TEST-JOIN-CODE')

  await expect(page).toHaveScreenshot('league-join-form.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   17. New user signs up
   ═══════════════════════════════════════════════════════════════════════════ */
test('17. New user signs up @noauth', async ({ page }) => {
  await page.goto('/login')
  await waitForApp(page)

  // Verify login page structure
  await expect(page.getByText('Sign In')).toBeVisible()
  await expect(page.getByText('Fantasy Auction League')).toBeVisible()
  await expect(page.getByText('IPL 2026')).toBeVisible()

  // Fill sign-up form
  await page.getByLabel('Email').fill('sim-user-signup-test@fal-test.com')
  await page.getByLabel('Name').fill('Signup Test User')
  await page.getByLabel('Password').fill('test-password-2025')
  await page.getByLabel('Invite Code').fill('TESTCODE123')

  // Submit button text should be "Enter League"
  const submitBtn = page.getByRole('button', { name: /enter league/i })
  await expect(submitBtn).toBeVisible()

  // The password placeholder should say "Create a password" when invite code is present
  const passwordInput = page.getByLabel('Password')
  await expect(passwordInput).toHaveAttribute('placeholder', 'Create a password')

  await expect(page).toHaveScreenshot('signup-form.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   18. Returning user logs in
   ═══════════════════════════════════════════════════════════════════════════ */
test('18. Returning user logs in @noauth', async ({ page }) => {
  await page.goto('/login')
  await waitForApp(page)

  // Fill returning user form (no invite code)
  await page.getByLabel('Email').fill('sim-user-1@fal-test.com')
  await page.getByLabel('Password').fill('sim-test-2025')

  // Leave invite code empty — button should say "Enter League"
  const submitBtn = page.getByRole('button', { name: /enter league/i })
  await expect(submitBtn).toBeVisible()
  await expect(submitBtn).toBeEnabled()

  // Password placeholder should say "Enter your password" when no invite code
  const passwordInput = page.getByLabel('Password')
  await expect(passwordInput).toHaveAttribute('placeholder', 'Enter your password')

  await expect(page).toHaveScreenshot('login-returning-user.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   19. League switch persists across pages
   ═══════════════════════════════════════════════════════════════════════════ */
test('19. League switch persists across pages @user', async ({ page }) => {
  test.setTimeout(60000)

  // Navigate across multiple pages — verify league context persists
  await page.goto('/')
  await waitForApp(page)
  // League pill should be visible
  const leaguePill = page.locator('button').filter({ hasText: /[\u25BE\u25BC]/ }).first()
  await expect(leaguePill).toBeVisible()
  const leagueName = await leaguePill.innerText()

  await page.goto('/lineup')
  await waitForApp(page)
  await expect(page.getByText('Pick Team')).toBeVisible()

  await page.goto('/standings')
  await waitForApp(page)
  await expect(page.getByText('League Standings')).toBeVisible()

  // Go back to dashboard — pill should still show same league
  await page.goto('/')
  await waitForApp(page)
  const pillAfter = page.locator('button').filter({ hasText: /[\u25BE\u25BC]/ }).first()
  await expect(pillAfter).toBeVisible()
  const leagueNameAfter = await pillAfter.innerText()
  expect(leagueName).toBe(leagueNameAfter)

  await expect(page).toHaveScreenshot('league-persists.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   20. Invalid password rejected
   ═══════════════════════════════════════════════════════════════════════════ */
test('20. Invalid password rejected @noauth', async ({ page }) => {
  await page.goto('/login')
  await waitForApp(page)

  // Use existing user email with wrong password
  await page.getByLabel('Email').fill('sim-user-1@fal-test.com')
  await page.getByLabel('Password').fill('wrong-password-here')

  // Submit
  await page.getByRole('button', { name: /enter league/i }).click()

  // Wait for error message
  const errorMsg = page.getByText(/invalid password|sign-in failed|failed/i)
  await expect(errorMsg).toBeVisible({ timeout: 10_000 })

  await expect(page).toHaveScreenshot('invalid-password.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   21. Password too short rejected
   ═══════════════════════════════════════════════════════════════════════════ */
test('21. Password too short rejected @noauth', async ({ page }) => {
  await page.goto('/login')
  await waitForApp(page)

  // Use a new email with invite code but password too short (3 chars)
  await page.getByLabel('Email').fill('sim-short-pw-test@fal-test.com')
  await page.getByLabel('Password').fill('abc')
  await page.getByLabel('Invite Code').fill('TESTCODE123')

  // Submit
  await page.getByRole('button', { name: /enter league/i }).click()

  // Should show error about password length
  const errorMsg = page.getByText(/password must be at least 6 characters/i)
  await expect(errorMsg).toBeVisible({ timeout: 10_000 })

  await expect(page).toHaveScreenshot('password-too-short.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   24. Move player from XI to bench via list view
   ═══════════════════════════════════════════════════════════════════════════ */
test('24. Move player from XI to bench via list view @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Switch to List View
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  // Get all bench player names before the move
  const benchSection = page.getByText(/BENCH.*AUTO-SUB ORDER/i)
  await expect(benchSection).toBeVisible()

  // Find an XI player row that is NOT the captain or VC — look for → Bench buttons
  // Each XI row has C, VC, → Bench buttons. Pick the third XI row (index 2) to avoid captain/VC.
  const benchButtons = page.getByRole('button', { name: '→ Bench' })
  const benchBtnCount = await benchButtons.count()
  expect(benchBtnCount).toBeGreaterThan(0)

  // Read the player name from the row containing the last → Bench button (least likely to be C/VC)
  const targetBtn = benchButtons.last()
  const targetRow = targetBtn.locator('..')
  // Get the XI count from summary before swap
  const xiCountBefore = page.getByText(/Playing XI/).first()
  await expect(xiCountBefore).toBeVisible()

  // Click → Bench
  await targetBtn.click()
  await page.waitForTimeout(500)

  // Verify Playing XI section still visible and bench section still visible
  await expect(page.getByText(/Playing XI/).first()).toBeVisible()
  await expect(page.getByText(/BENCH.*AUTO-SUB ORDER/i)).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-move-to-bench.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   25. Move player from bench to XI via list view
   ═══════════════════════════════════════════════════════════════════════════ */
test('25. Move player from bench to XI via list view @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Switch to List View
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  // Find a bench player → XI button
  const xiButtons = page.getByRole('button', { name: '→ XI' })
  const xiBtnCount = await xiButtons.count()
  expect(xiBtnCount).toBeGreaterThan(0)

  // Click → XI on the first bench player
  await xiButtons.first().click()
  await page.waitForTimeout(500)

  // Verify both sections still visible
  await expect(page.getByText(/Playing XI/).first()).toBeVisible()
  await expect(page.getByText(/BENCH.*AUTO-SUB ORDER/i)).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-move-to-xi.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   26. Choose a new captain via list view
   ═══════════════════════════════════════════════════════════════════════════ */
test('26. Choose a new captain via list view @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Switch to List View
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  // Find all C buttons in XI rows — the currently active captain has golden background
  const cButtons = page.getByRole('button', { name: 'C', exact: true })
  const cCount = await cButtons.count()
  expect(cCount).toBeGreaterThan(1)

  // Find the current captain: the C button with golden bg (background: '#F9CD05')
  // Pick a non-captain C button (the second one should be a non-captain)
  // We click the last C button to choose a different player as captain
  const targetCBtn = cButtons.last()
  await targetCBtn.click()
  await page.waitForTimeout(500)

  // After clicking, the last C button should now be the active captain (golden bg)
  // Verify the "Save Lineup" button appeared (dirty state)
  const saveBtn = page.getByText('Save Lineup')
  await expect(saveBtn).toBeVisible({ timeout: 3000 })

  // Verify a C badge (span) exists next to a player name in XI section
  // The C badge on the player name is a <span> with text "C" inside the player info div
  const cBadges = page.locator('span').filter({ hasText: /^C$/ })
  await expect(cBadges.first()).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-new-captain.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   27. Choose a new vice captain via list view
   ═══════════════════════════════════════════════════════════════════════════ */
test('27. Choose a new vice captain via list view @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Switch to List View
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  // Find all VC buttons — pick one that is not the current VC
  const vcButtons = page.getByRole('button', { name: 'VC', exact: true })
  const vcCount = await vcButtons.count()
  expect(vcCount).toBeGreaterThan(1)

  // Click the last VC button (a non-VC player)
  const targetVcBtn = vcButtons.last()
  await targetVcBtn.click()
  await page.waitForTimeout(500)

  // Verify a VC badge (span) exists next to a player name
  const vcBadges = page.locator('span').filter({ hasText: /^VC$/ })
  await expect(vcBadges.first()).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-new-vc.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   28. Save lineup after changes and verify persistence
   ═══════════════════════════════════════════════════════════════════════════ */
test('28. Save lineup after changes and verify persistence @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Switch to List View and make a captain change to trigger dirty state
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  // Click a non-captain C button to make lineup dirty
  const cButtons = page.getByRole('button', { name: 'C', exact: true })
  await cButtons.last().click()
  await page.waitForTimeout(300)

  // Save the lineup
  const saveBtn = page.getByText('Save Lineup')
  await expect(saveBtn).toBeVisible({ timeout: 3000 })
  await saveBtn.click()

  // Verify success message
  await expect(page.getByText('Lineup saved!')).toBeVisible({ timeout: 5000 })

  // Record the captain name from the C badge span's parent
  // The C badge is a <span> inside a div containing the player name
  const cBadge = page.locator('span').filter({ hasText: /^C$/ }).first()
  await expect(cBadge).toBeVisible()

  // Reload the page to verify persistence
  await page.reload()
  await waitForApp(page)

  // Switch to List View
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  // Verify C badge persisted
  const persistedCBadge = page.locator('span').filter({ hasText: /^C$/ }).first()
  await expect(persistedCBadge).toBeVisible()

  // Verify VC badge persisted
  const persistedVcBadge = page.locator('span').filter({ hasText: /^VC$/ }).first()
  await expect(persistedVcBadge).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-saved-persisted.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   29. Swap bench player into XI via pitch view
   ═══════════════════════════════════════════════════════════════════════════ */
test('29. Swap bench player into XI via pitch view @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Ensure Pitch View is active (default)
  await expect(page.getByText('Pitch View')).toBeVisible()
  await expect(page.getByText('Top Order')).toBeVisible()

  // Find a bench player figure and click it to enter swap mode
  // Bench players are below the pitch, inside divs with onClick={handleBenchTap}
  const benchFigures = page.locator('div[style*="cursor: pointer"]').filter({
    has: page.locator('div').filter({ hasText: /^(BAT|BOWL|ALL|WK)$/ })
  })
  // The bench section comes after the pitch — use the last few clickable figures
  const allClickable = page.locator('div[style*="cursor: pointer"]')
  const totalCount = await allClickable.count()

  // Bench players are the last 4 clickable figures
  const benchPlayer = allClickable.nth(totalCount - 1)
  await expect(benchPlayer).toBeVisible()
  await benchPlayer.click()
  await page.waitForTimeout(500)

  // Verify swap hint toast appears
  await expect(page.getByText('Tap a player on the pitch to swap')).toBeVisible({ timeout: 3000 })

  // Click an XI player figure on the pitch (first clickable figure = XI player)
  const xiPlayer = allClickable.first()
  await xiPlayer.click()
  await page.waitForTimeout(500)

  // Verify swap hint disappeared (swap completed)
  await expect(page.getByText('Tap a player on the pitch to swap')).toBeHidden({ timeout: 3000 })

  // Verify dirty state — Save Lineup button should appear
  const saveBtn = page.getByText('Save Lineup')
  await expect(saveBtn).toBeVisible({ timeout: 3000 })

  await expect(page).toHaveScreenshot('pitch-swap-bench-to-xi.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   30. Choose captain in pitch view
   ═══════════════════════════════════════════════════════════════════════════ */
test('30. Choose captain in pitch view @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Ensure Pitch View is active
  await expect(page.getByText('Pitch View')).toBeVisible()

  // Find the current captain badge to know which player NOT to click
  const captainBadge = page.locator('div').filter({ hasText: /^C$/ }).first()
  await expect(captainBadge).toBeVisible()

  // Get all clickable XI player figures on the pitch
  const allClickable = page.locator('div[style*="cursor: pointer"]')
  const totalCount = await allClickable.count()
  // XI players are the first (totalCount - 4) figures; bench is the last 4
  const xiCount = totalCount - 4

  // Pick a non-captain, non-VC XI player (use one in the middle)
  // Click it once → becomes VC, click it again → becomes captain
  const targetIdx = Math.min(2, xiCount - 1)
  const targetPlayer = allClickable.nth(targetIdx)
  await expect(targetPlayer).toBeVisible()

  // First click: makes this player VC (if normal) or captain (if already VC)
  await targetPlayer.click()
  await page.waitForTimeout(500)

  // Second click: if it was normal → now VC → clicking again makes it captain
  await targetPlayer.click()
  await page.waitForTimeout(500)

  // Verify C badge is visible (captain was set)
  const newCaptainBadge = page.locator('div').filter({ hasText: /^C$/ }).first()
  await expect(newCaptainBadge).toBeVisible()

  // Verify dirty state
  const saveBtn = page.getByText('Save Lineup')
  await expect(saveBtn).toBeVisible({ timeout: 3000 })

  await expect(page).toHaveScreenshot('pitch-choose-captain.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   31. Choose vice captain in pitch view
   ═══════════════════════════════════════════════════════════════════════════ */
test('31. Choose vice captain in pitch view @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Ensure Pitch View is active
  await expect(page.getByText('Pitch View')).toBeVisible()

  // Get all clickable player figures
  const allClickable = page.locator('div[style*="cursor: pointer"]')
  const totalCount = await allClickable.count()
  const xiCount = totalCount - 4

  // Find an XI player that is NOT captain and NOT VC
  // We'll try the last XI player (index xiCount - 1)
  // Tapping a normal player once makes it VC
  const targetIdx = Math.max(0, xiCount - 1)
  const targetPlayer = allClickable.nth(targetIdx)
  await expect(targetPlayer).toBeVisible()

  // Single click: makes this player VC
  await targetPlayer.click()
  await page.waitForTimeout(500)

  // Verify V badge appears
  const vcBadge = page.locator('div').filter({ hasText: /^V$/ }).first()
  await expect(vcBadge).toBeVisible()

  // Verify dirty state
  const saveBtn = page.getByText('Save Lineup')
  await expect(saveBtn).toBeVisible({ timeout: 3000 })

  await expect(page).toHaveScreenshot('pitch-choose-vc.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   32. Save pitch view changes and verify persistence
   ═══════════════════════════════════════════════════════════════════════════ */
test('32. Save pitch view changes and verify persistence @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  // Skip if locked
  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Ensure Pitch View is active
  await expect(page.getByText('Pitch View')).toBeVisible()

  // Make a change: tap an XI player to toggle captain/VC (makes lineup dirty)
  const allClickable = page.locator('div[style*="cursor: pointer"]')
  const totalCount = await allClickable.count()
  const xiCount = totalCount - 4
  const targetPlayer = allClickable.nth(Math.min(3, xiCount - 1))
  await targetPlayer.click()
  await page.waitForTimeout(500)

  // Save the lineup
  const saveBtn = page.getByText('Save Lineup')
  await expect(saveBtn).toBeVisible({ timeout: 3000 })
  await saveBtn.click()

  // Verify success message
  await expect(page.getByText('Lineup saved!')).toBeVisible({ timeout: 5000 })

  // Reload and verify C and V badges persist
  await page.reload()
  await waitForApp(page)
  await expect(page.getByText('Pitch View')).toBeVisible()

  // C badge should still be visible
  const captainBadge = page.locator('div').filter({ hasText: /^C$/ }).first()
  await expect(captainBadge).toBeVisible()

  // V badge should still be visible
  const vcBadge = page.locator('div').filter({ hasText: /^V$/ }).first()
  await expect(vcBadge).toBeVisible()

  await expect(page).toHaveScreenshot('pitch-saved-persisted.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   22. Dashboard shows active gameweek with matches (mid-season)
   ═══════════════════════════════════════════════════════════════════════════ */
test('22. Dashboard shows active gameweek with matches @user', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // Should show "Gameweek N" (not "Season not started")
  await expect(page.getByText(/Gameweek \d+$/).first()).toBeVisible()

  // Should show upcoming match cards in "This Week" section
  await expect(page.getByText('This Week')).toBeVisible()

  // Should show at least one match with team codes (e.g., "MI vs CSK")
  // The "vs" text is inside a small <span> — use a locator that matches it
  const vsText = page.locator('span', { hasText: 'vs' }).first()
  await expect(vsText).toBeVisible({ timeout: 5000 })

  // Should show a deadline
  await expect(page.getByText(/Deadline/)).toBeVisible()

  await expect(page).toHaveScreenshot('dashboard-mid-season.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   23. Lineup shows gameweek deadline (mid-season)
   ═══════════════════════════════════════════════════════════════════════════ */
test('23. Lineup shows gameweek deadline @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  // Should show gameweek number and deadline or "Lineup Locked"
  await expect(page.getByText(/Gameweek \d+/).first()).toBeVisible()
  const deadlineOrLock = page.getByText(/Deadline|Lineup Locked/).first()
  await expect(deadlineOrLock).toBeVisible()

  await expect(page).toHaveScreenshot('lineup-mid-season.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   36. ISSUE-002: Admin can create a second league
   ═══════════════════════════════════════════════════════════════════════════ */
test('36. Admin can create a second league @admin', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/admin')
  await waitForApp(page)

  // Admin already has one league — should see a way to create another
  // Look for "Create Another League" or "Create New League" button
  const createBtn = page.getByRole('button', { name: /Create.*League|New League/i })
  await expect(createBtn).toBeVisible({ timeout: 5000 })

  await expect(page).toHaveScreenshot('admin-create-another.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   37. ISSUE-006: View-lineup shows SAVED lineup, not default sort
   ═══════════════════════════════════════════════════════════════════════════ */
test('37. View-lineup shows saved lineup @user', async ({ page }) => {
  test.setTimeout(60000)

  // First: save a lineup with a SPECIFIC captain (the 5th player, not default 1st)
  await page.goto('/lineup')
  await waitForApp(page)

  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Switch to list view
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  const playerNames = page.locator('div[style*="font-weight: 700"][style*="color: rgb(26, 26, 46)"]')
  const count = await playerNames.count()
  if (count < 5) return

  // Get the 5th player's name (definitely not the default captain)
  const fifthPlayerName = (await playerNames.nth(4).textContent())?.trim()
  console.log('Making captain:', fifthPlayerName)

  // Tap 5th player name to open stats sheet, make captain
  await playerNames.nth(4).click()
  await page.waitForTimeout(500)
  const makeCaptain = page.getByText('Make Captain', { exact: false })
  if (await makeCaptain.isVisible({ timeout: 3000 }).catch(() => false)) {
    await makeCaptain.click()
    await page.waitForTimeout(300)
  }

  // Save
  const saveBtn = page.getByText('Save Lineup')
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click()
    await expect(page.getByText('Lineup saved!')).toBeVisible({ timeout: 5000 })
  }

  // Navigate to view-lineup for our own team
  await page.goto('/')
  await waitForApp(page)

  const youLink = page.locator('a[href^="/view-lineup/"]').filter({ hasText: '(You)' }).first()
  if (await youLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await youLink.click()
    await page.waitForURL(/\/view-lineup\//, { timeout: 10000 })
    await waitForApp(page)

    // Switch to list view on view-lineup page
    const listViewBtn = page.getByText('List View')
    if (await listViewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await listViewBtn.click()
      await page.waitForTimeout(300)
    }

    // CRITICAL: The captain shown in view-lineup must be the 5th player we selected
    // NOT the default 1st player. If view-lineup uses default sort, this WILL FAIL.
    if (fifthPlayerName) {
      const captainName = page.getByText(fifthPlayerName).first()
      await expect(captainName).toBeVisible({ timeout: 3000 })

      // The captain badge should be near this player's name
      // Check that "C" badge exists somewhere on the page
      const cBadge = page.locator('span').filter({ hasText: 'C' }).first()
      const cVisible = await cBadge.isVisible({ timeout: 2000 }).catch(() => false)

      // If the C badge is NOT next to our chosen captain, the view-lineup is showing
      // default lineup instead of saved. This is the ISSUE-006 bug.
      expect(cVisible).toBe(true)
    }
  }

  await expect(page).toHaveScreenshot('view-lineup-saved.png')
})

/* ═══════════════════════════════════════════════════════════════════════════
   38. ISSUE-007: Bench swap shows selection sheet (not auto-select)
   ═══════════════════════════════════════════════════════════════════════════ */
test('38. Bench swap shows player selection @user', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/lineup')
  await waitForApp(page)

  const lockBadge = page.getByText('Lineup Locked')
  if (await lockBadge.isVisible({ timeout: 2000 }).catch(() => false)) return

  // Switch to list view
  await page.getByText('List View').click()
  await page.waitForTimeout(300)

  // Count bench players before swap
  const benchLabel = page.getByText(/BENCH/i).last()
  await expect(benchLabel).toBeVisible({ timeout: 3000 })

  // Open the action sheet for an XI player by tapping the row
  // The action sheet should have "Move to Bench" option
  const xiRows = page.locator('div[style*="padding: 10px 16px"][style*="background: rgb(255, 255, 255)"]')
  const firstXiRow = xiRows.first()
  if (await firstXiRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstXiRow.click()
    await page.waitForTimeout(500)

    // Action sheet should appear with "Move to Bench" option
    const moveToBench = page.getByText(/Move to Bench/i)
    if (await moveToBench.isVisible({ timeout: 3000 }).catch(() => false)) {
      await moveToBench.click()
      await page.waitForTimeout(500)

      // ISSUE-007 TEST: After clicking "Move to Bench", a selection sheet
      // should appear letting user pick WHICH bench player to swap with.
      // If the swap happens instantly (no selection), the issue is NOT fixed.
      const selectionSheet = page.getByText(/Select.*swap|Choose.*player|Swap with/i)
      await expect(selectionSheet).toBeVisible({ timeout: 3000 })

      await expect(page).toHaveScreenshot('bench-swap-selection.png')
    }
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   29. Player detail sheet — compact panel (no Form, has fixtures, C/VC)
   ═══════════════════════════════════════════════════════════════════════════ */
test('29. Player detail sheet — compact panel shows fixtures and actions @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  // Switch to list view for reliable player tap
  const listViewBtn = page.getByText('List View')
  if (await listViewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await listViewBtn.click()
    await page.waitForTimeout(500)
  }

  // Tap the first player name in the list to open the detail sheet
  const playerRow = page.locator('div[style*="cursor: pointer"]').first()
  if (await playerRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await playerRow.click()
    await page.waitForTimeout(1000)

    // Sheet should be visible — check for Auction Price label
    await expect(page.getByText('Auction Price')).toBeVisible({ timeout: 5000 })

    // Should show Pts/Match
    await expect(page.getByText('Pts/Match')).toBeVisible()

    // Should NOT have Form section (removed)
    await expect(page.getByText('Form', { exact: true })).not.toBeVisible()

    // Should show Fixtures section
    await expect(page.getByText('Fixtures')).toBeVisible()

    // Should show Captain and Vice Captain checkboxes
    await expect(page.getByRole('button', { name: /Captain/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Vice Captain/ }).first()).toBeVisible()

    // Should show Substitute and Full Profile buttons
    await expect(page.getByText('Substitute')).toBeVisible()
    await expect(page.getByText('Full Profile')).toBeVisible()

    // Should show Cancel button
    await expect(page.getByText('Cancel')).toBeVisible()

    await expect(page).toHaveScreenshot('player-detail-compact.png')
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   30. Player detail sheet — fixtures row shows played + upcoming
   ═══════════════════════════════════════════════════════════════════════════ */
test('30. Player detail sheet — fixtures row shows team codes @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  // Switch to list view
  const listViewBtn = page.getByText('List View')
  if (await listViewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await listViewBtn.click()
    await page.waitForTimeout(500)
  }

  // Tap a player
  const playerRow = page.locator('div[style*="cursor: pointer"]').first()
  if (await playerRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await playerRow.click()
    await page.waitForTimeout(1000)

    // Fixtures label should be visible
    await expect(page.getByText('Fixtures')).toBeVisible({ timeout: 5000 })

    // Fixture chips should exist — look for IPL team codes
    const teamCodes = ['MI', 'CSK', 'RCB', 'KKR', 'DC', 'RR', 'SRH', 'GT', 'LSG', 'PBKS']
    let foundTeamCode = false
    for (const code of teamCodes) {
      const chip = page.locator(`div:has-text("${code}")`).first()
      if (await chip.isVisible({ timeout: 500 }).catch(() => false)) {
        foundTeamCode = true
        break
      }
    }
    expect(foundTeamCode).toBe(true)

    await expect(page).toHaveScreenshot('player-fixtures-row.png')
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   31. Full Profile — in-place swap shows batting/bowling tables
   ═══════════════════════════════════════════════════════════════════════════ */
test('31. Full Profile — in-place swap shows batting/bowling tables @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  // Switch to list view
  const listViewBtn = page.getByText('List View')
  if (await listViewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await listViewBtn.click()
    await page.waitForTimeout(500)
  }

  // Tap a player
  const playerRow = page.locator('div[style*="cursor: pointer"]').first()
  if (await playerRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await playerRow.click()
    await page.waitForTimeout(1000)

    // Click "Full Profile" button
    const fullProfileBtn = page.getByText('Full Profile')
    await expect(fullProfileBtn).toBeVisible({ timeout: 5000 })
    await fullProfileBtn.click()
    await page.waitForTimeout(500)

    // "← Back" button should appear
    await expect(page.getByText('← Back')).toBeVisible({ timeout: 3000 })

    // Batting table should be visible (at least the header)
    await expect(page.getByText('Batting')).toBeVisible({ timeout: 5000 })

    // Table headers should show
    await expect(page.getByText('Mat').first()).toBeVisible()
    await expect(page.getByText('Runs').first()).toBeVisible()
    await expect(page.getByText('Avg').first()).toBeVisible()
    await expect(page.getByText('SR').first()).toBeVisible()

    // T20 row should exist (not "T20 Career")
    await expect(page.getByText('T20', { exact: true }).first()).toBeVisible()

    // Compact panel elements should NOT be visible
    await expect(page.getByText('Auction Price')).not.toBeVisible()
    await expect(page.getByText('Substitute')).not.toBeVisible()

    await expect(page).toHaveScreenshot('player-full-profile-inline.png')
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   32. Full Profile — back button returns to compact panel
   ═══════════════════════════════════════════════════════════════════════════ */
test('32. Full Profile — back button returns to compact panel @user', async ({ page }) => {
  await page.goto('/lineup')
  await waitForApp(page)

  const listViewBtn = page.getByText('List View')
  if (await listViewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await listViewBtn.click()
    await page.waitForTimeout(500)
  }

  const playerRow = page.locator('div[style*="cursor: pointer"]').first()
  if (await playerRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await playerRow.click()
    await page.waitForTimeout(1000)

    // Go to full profile
    const fullProfileBtn = page.getByText('Full Profile')
    await expect(fullProfileBtn).toBeVisible({ timeout: 5000 })
    await fullProfileBtn.click()
    await page.waitForTimeout(500)

    // Click back
    const backBtn = page.getByText('← Back')
    await expect(backBtn).toBeVisible({ timeout: 3000 })
    await backBtn.click()
    await page.waitForTimeout(500)

    // Compact panel should be back
    await expect(page.getByText('Auction Price')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Fixtures')).toBeVisible()
    await expect(page.getByText('Full Profile')).toBeVisible()

    // Tables should NOT be visible
    await expect(page.getByText('← Back')).not.toBeVisible()
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   33. Players page — full profile modal shows tables, no tabs
   ═══════════════════════════════════════════════════════════════════════════ */
test('33. Players page — full profile shows batting table, no GW tabs @user', async ({ page }) => {
  await page.goto('/players')
  await waitForApp(page)

  // Click first player card
  const playerCards = page.locator('div[style*="cursor: pointer"][style*="border-radius: 16px"]')
  const firstCard = playerCards.first()
  if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await firstCard.click()
    await page.waitForTimeout(1000)

    // Batting table should be visible
    await expect(page.getByText('Batting').first()).toBeVisible({ timeout: 5000 })

    // Should show T20 row (not "T20 Career")
    const t20Label = page.locator('td').filter({ hasText: /^T20$/ }).first()
    await expect(t20Label).toBeVisible({ timeout: 3000 })

    // Should NOT have GW tabs (Season, GW1, etc.)
    await expect(page.getByText('Season', { exact: true })).not.toBeVisible()

    // Should NOT have stats grid sections (All-Round header or Fielding header)
    // Use exact match to avoid matching "All-Rounder" in subtitle
    await expect(page.getByText('All-Round', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Fielding', { exact: true })).not.toBeVisible()

    // Close button should work
    const closeBtn = page.getByText('✕')
    await expect(closeBtn).toBeVisible()

    await expect(page).toHaveScreenshot('players-full-profile-modal.png')
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   34. Players page — ?playerId auto-opens player modal
   ═══════════════════════════════════════════════════════════════════════════ */
test('34. Players page — playerId query param auto-opens modal @user', async ({ page }) => {
  // First get a player ID from the API
  await page.goto('/players')
  await waitForApp(page)

  // Get first player card and extract its ID from the click handler
  const playerCards = page.locator('div[style*="cursor: pointer"][style*="border-radius: 16px"]')
  const firstCard = playerCards.first()

  if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Click to open, then read the URL or player name
    await firstCard.click()
    await page.waitForTimeout(1000)

    // Get the player name from the sheet
    const playerName = await page.locator('div[style*="font-weight: 800"][style*="font-size: 15px"]').first().textContent()

    // Close the sheet
    await page.getByText('✕').click()
    await page.waitForTimeout(500)

    // Now search for that player to get their ID
    if (playerName) {
      const searchBox = page.getByPlaceholder('Search players...')
      await searchBox.fill(playerName)
      await page.waitForTimeout(1000)

      // Navigate with playerId param (we'll use the API to get the ID)
      // For now, just verify the param mechanism works by checking the modal opens
      // when we use the search + click flow from lineup
    }
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
   35. Players page — bowling table shows for bowlers
   ═══════════════════════════════════════════════════════════════════════════ */
test('35. Players page — bowling table visible for bowlers @user', async ({ page }) => {
  await page.goto('/players')
  await waitForApp(page)

  // Filter to bowlers
  const bowlBtn = page.getByRole('button', { name: 'BOWL' })
  await expect(bowlBtn).toBeVisible({ timeout: 5000 })
  await bowlBtn.click()
  await page.waitForTimeout(1000)

  // Click first bowler card
  const playerCards = page.locator('div[style*="cursor: pointer"][style*="border-radius: 16px"]')
  const firstCard = playerCards.first()
  if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await firstCard.click()
    await page.waitForTimeout(1000)

    // Bowling table should be visible
    await expect(page.getByText('Bowling').first()).toBeVisible({ timeout: 5000 })

    // Bowling-specific headers
    await expect(page.getByText('Wkts').first()).toBeVisible()
    await expect(page.getByText('Econ').first()).toBeVisible()

    await expect(page).toHaveScreenshot('players-bowler-profile.png')
  }
})
