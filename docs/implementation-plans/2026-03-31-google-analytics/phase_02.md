# Google Analytics Integration — Phase 2: Custom Event Tracking

**Goal:** Track key user actions (lineup, league, scoring views) as custom GA4 events.

**Architecture:** Use `sendGAEvent` from `@next/third-parties/google` to fire events at key interaction points. Create a thin `lib/analytics.ts` helper to centralize event names and avoid typos.

**Tech Stack:** `@next/third-parties/google` (sendGAEvent)

**Scope:** 2 phases (this is phase 2 of 2)

**Codebase verified:** 2026-03-31

---

## Acceptance Criteria Coverage

### ga.AC3: Lineup events tracked
- **ga.AC3.1:** Event fired when user saves a lineup
- **ga.AC3.2:** Event fired when user changes captain/VC
- **ga.AC3.3:** Event fired when user activates a chip

### ga.AC4: League events tracked
- **ga.AC4.1:** Event fired when user creates a league
- **ga.AC4.2:** Event fired when user joins a league
- **ga.AC4.3:** Event fired when admin uploads a roster

### ga.AC5: Scoring view events tracked
- **ga.AC5.1:** Event fired when user views match scores (dashboard)
- **ga.AC5.2:** Event fired when user views leaderboard
- **ga.AC5.3:** Event fired when user views standings page
- **ga.AC5.4:** Event fired when user views another team's lineup

---

<!-- START_TASK_5 -->
### Task 5: Create analytics helper

**Files:**
- Create: `lib/analytics.ts`

**Step 1: Create the helper**

```typescript
import { sendGAEvent } from '@next/third-parties/google'

// Centralized event tracking — keeps event names consistent
export function trackEvent(action: string, params?: Record<string, string | number>) {
  if (typeof window === 'undefined') return
  try {
    sendGAEvent('event', action, params || {})
  } catch {
    // Silently fail — analytics should never break the app
  }
}

// Pre-defined event names to avoid typos
export const GA_EVENTS = {
  // Lineup
  LINEUP_SAVE: 'lineup_save',
  LINEUP_CAPTAIN_CHANGE: 'lineup_captain_change',
  LINEUP_CHIP_ACTIVATE: 'lineup_chip_activate',

  // League
  LEAGUE_CREATE: 'league_create',
  LEAGUE_JOIN: 'league_join',
  LEAGUE_ROSTER_UPLOAD: 'league_roster_upload',

  // Views
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_LEADERBOARD: 'view_leaderboard',
  VIEW_STANDINGS: 'view_standings',
  VIEW_LINEUP: 'view_lineup',
  VIEW_PLAYERS: 'view_players',
} as const
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add lib/analytics.ts
git commit -m "feat: add analytics event helper with event name constants"
```

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Add page view events to all pages

**Verifies:** ga.AC5.1, ga.AC5.2, ga.AC5.3, ga.AC5.4

**Files:**
- Modify: `app/page.tsx` (dashboard)
- Modify: `app/leaderboard/page.tsx`
- Modify: `app/standings/page.tsx`
- Modify: `app/players/page.tsx`
- Modify: `app/view-lineup/[teamId]/page.tsx`
- Modify: `app/lineup/page.tsx`

**Implementation:**

In each page, add a `useEffect` that fires the view event on mount. Import from the analytics helper:

```typescript
import { trackEvent, GA_EVENTS } from '@/lib/analytics'
```

Then in the component body:

```typescript
useEffect(() => {
  trackEvent(GA_EVENTS.VIEW_DASHBOARD) // or VIEW_LEADERBOARD, etc.
}, [])
```

For `view-lineup/[teamId]/page.tsx`, include the teamId as a parameter:

```typescript
useEffect(() => {
  if (teamId) trackEvent(GA_EVENTS.VIEW_LINEUP, { team_id: teamId as string })
}, [teamId])
```

**Verification:**

1. Open GA4 Real-time > Events
2. Navigate to each page
3. Confirm events appear: `view_dashboard`, `view_leaderboard`, `view_standings`, `view_lineup`, `view_players`

**Commit:**

```bash
git add app/page.tsx app/leaderboard/page.tsx app/standings/page.tsx app/players/page.tsx "app/view-lineup/[teamId]/page.tsx" app/lineup/page.tsx
git commit -m "feat: add page view GA events to all pages"
```

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->
### Task 7: Add lineup action events

**Verifies:** ga.AC3.1, ga.AC3.2, ga.AC3.3

**Files:**
- Modify: `app/lineup/page.tsx`

**Implementation:**

Find the existing handlers and add tracking calls:

1. **Lineup save** — find the `fetch('/api/teams/.../lineups/...')` PUT call. After success response, add:
   ```typescript
   trackEvent(GA_EVENTS.LINEUP_SAVE)
   ```

2. **Captain/VC change** — find where `setCaptainId` or `setVcId` is called by user action (not initial load). Add:
   ```typescript
   trackEvent(GA_EVENTS.LINEUP_CAPTAIN_CHANGE, { role: 'CAPTAIN' })
   // or role: 'VC'
   ```

3. **Chip activate** — find the `fetch('.../chip')` POST call. After success, add:
   ```typescript
   trackEvent(GA_EVENTS.LINEUP_CHIP_ACTIVATE, { chip_type: chipType })
   ```

**Verification:**

1. Open GA4 Real-time > Events
2. Save a lineup, change captain, activate chip
3. Confirm `lineup_save`, `lineup_captain_change`, `lineup_chip_activate` events appear

**Commit:**

```bash
git add app/lineup/page.tsx
git commit -m "feat: add lineup action GA events (save, captain, chip)"
```

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->
### Task 8: Add league action events

**Verifies:** ga.AC4.1, ga.AC4.2, ga.AC4.3

**Files:**
- Modify: `app/admin/page.tsx` (create league, upload roster)
- Modify: `app/page.tsx` or `app/login/page.tsx` (join league)

**Implementation:**

1. **League create** — find the `fetch('/api/leagues')` POST call in admin page. After success:
   ```typescript
   trackEvent(GA_EVENTS.LEAGUE_CREATE)
   ```

2. **League join** — find the join league flow (could be in login page via invite code, or dashboard join form). After success:
   ```typescript
   trackEvent(GA_EVENTS.LEAGUE_JOIN)
   ```

3. **Roster upload** — find the `fetch('.../roster')` POST call in admin page. After success:
   ```typescript
   trackEvent(GA_EVENTS.LEAGUE_ROSTER_UPLOAD)
   ```

**Verification:**

1. Open GA4 Real-time > Events
2. Create a league, join via invite code, upload roster
3. Confirm events appear

**Commit:**

```bash
git add app/admin/page.tsx app/page.tsx
git commit -m "feat: add league action GA events (create, join, roster upload)"
```

<!-- END_TASK_8 -->
