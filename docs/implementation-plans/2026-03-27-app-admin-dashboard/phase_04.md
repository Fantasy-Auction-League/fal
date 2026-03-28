# Phase 4: App Admin Dashboard UI

**Codebase verified:** 2026-03-27

---

## Acceptance Criteria Coverage

This phase implements:

### app-admin-dashboard.AC5: App Admin Dashboard Page
- **app-admin-dashboard.AC5.1 Success:** App admin can view match scoring status table with correct status pills
- **app-admin-dashboard.AC5.2 Success:** "Import Scores" button triggers scoring pipeline and shows success/error feedback
- **app-admin-dashboard.AC5.3 Success:** "Check for Updates" button shows player team changes table (dry run)
- **app-admin-dashboard.AC5.4 Success:** "Apply Changes" with confirmation sheet applies sync and shows success feedback
- **app-admin-dashboard.AC5.5 Success:** Error matches show "Recalculate" link that resets and re-scores
- **app-admin-dashboard.AC5.6 Failure:** Non-app-admin users see "Access denied" on `/app-admin`

### app-admin-dashboard.AC6: Navigation
- **app-admin-dashboard.AC6.1 Success:** App admin users see 5th "Admin" tab in bottom navigation
- **app-admin-dashboard.AC6.2 Failure:** Non-app-admin users see only the original 4-tab navigation

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Create `app/app-admin/page.tsx` — App Admin Dashboard

**Verifies:** app-admin-dashboard.AC5.1, app-admin-dashboard.AC5.2, app-admin-dashboard.AC5.3, app-admin-dashboard.AC5.4, app-admin-dashboard.AC5.5, app-admin-dashboard.AC5.6

**Files:**
- Create: `app/app-admin/page.tsx`

**Implementation:**

Client component (`'use client'`). Uses `AppFrame` wrapper, `useSession()` for auth.

**Auth guard:**
- `useSession()` from `next-auth/react`
- If `sessionStatus === 'loading'`: show loading spinner (same pattern as `app/admin/page.tsx:195-205`)
- If `!session?.user?.isAppAdmin`: show "Access denied — you don't have platform admin access" with link back to `/`

**Note on `/api/scoring/status` auth:** This endpoint currently allows any authenticated user to see match scoring statuses. This is intentionally left open — the data (match status pills) is not sensitive and could be used for a future public match status display. The app-admin page calls this endpoint to populate the match table, but the data it returns is not privileged.

**Section 1 — Import Scores:**

State:
```typescript
const [matches, setMatches] = useState<Match[]>([])
const [importing, setImporting] = useState(false)
const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
```

On mount: `fetch('/api/scoring/status')` → set matches

Match status table:
- Each row: `localTeamName vs visitorTeamName • date` | status pill
- Pills: `SCHEDULED` (#8e8e93 grey bg), `COMPLETED` (#004BA0 blue), `SCORING` (#F9CD05 yellow), `SCORED` (#0d9e5f green), `ERROR` (#d63060 red), `CANCELLED` (#666 dark grey)
- Error rows: "Recalculate" link → `POST /api/scoring/recalculate/${match.id}` → refresh matches

Ready-to-score badge: count `COMPLETED` matches → show "N matches ready to score" (blue) or "No matches ready to score" (grey)

Operational guidance text below badge: _"Tip: SportMonks data is usually complete 15-30 minutes after match end."_ (grey, fontSize: 11)

Import button:
- `onClick`: set `importing=true`, `POST /api/scoring/import`
- On success: `setImportMsg({ type: 'success', text: 'Scored N matches...' })`, refresh match list
- On error: `setImportMsg({ type: 'error', text: error.message })`
- Button disabled + "Importing..." text while loading

Message display: follows existing pattern from `app/admin/page.tsx:620-629` — inline colored divs.

**Section 2 — Sync Player Teams:**

State:
```typescript
const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
const [checking, setChecking] = useState(false)
const [applying, setApplying] = useState(false)
const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
const [confirmSheetOpen, setConfirmSheetOpen] = useState(false)
```

"Check for Updates" button:
- `onClick`: set `checking=true`, `GET /api/admin/sync-players`
- On success with changes: show table (Player | From | To | Fantasy Teams) + "Apply Changes" button
- On success with no changes: show green check "All player teams are up to date"
- Button disabled + "Checking..." while loading

Changes table: standard inline-styled table matching codebase patterns

"Apply Changes" button (orange): opens confirmation sheet

Confirmation sheet: follows existing bottom sheet pattern from `app/admin/page.tsx:940-1030`:
- Backdrop: `position: fixed, inset: 0, background: rgba(0,0,0,0.4), backdropFilter: blur(4px), zIndex: 200`
- Sheet: `position: fixed, bottom: 0, left: 50%, transform: translateX(-50%), maxWidth: 480, borderRadius: 20px 20px 0 0, zIndex: 210`
- Handle bar at top
- Text: "Apply N team changes and M new players? This only updates IPL team badges. Fantasy rosters, lineups, and scores are NOT affected."
- [Cancel] and [Apply] buttons
- On Apply: `POST /api/admin/sync-players` → success message → clear table → show "All up to date"

**Styling:** All inline styles, mobile-first (maxWidth: 480), card pattern:
```typescript
const cardStyle = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 16,
  padding: '20px',
  marginBottom: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}
```

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

Run: `npm run build`
Expected: Build succeeds

**Commit:** `feat: add App Admin dashboard with Import Scores and Sync Player Teams`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add App Admin nav link to bottom navigation

**Verifies:** app-admin-dashboard.AC6.1, app-admin-dashboard.AC6.2

**Files:**
- Modify: `app/page.tsx:1187-1221` — add conditional 5th tab
- Check and modify if nav is duplicated: `app/lineup/page.tsx`, `app/players/page.tsx`, `app/admin/page.tsx`

**Implementation:**

The bottom nav is rendered inline in page components. In each page that has the `<nav className="bottom-nav-fixed">` element, add a conditional 5th tab after the "League" link:

```typescript
{session?.user?.isAppAdmin && (
  <Link href="/app-admin" style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    fontSize: 10, fontWeight: pathname === '/app-admin' ? 700 : 400,
    color: pathname === '/app-admin' ? '#004BA0' : '#8e8e93',
    textDecoration: 'none',
  }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    Admin
  </Link>
)}
```

This uses the shield icon (security/admin connotation) and is only visible when `session?.user?.isAppAdmin` is true. Non-admins see the unchanged 4-tab nav.

Note: The existing "League" tab links to `/admin`. The new "Admin" tab links to `/app-admin`. Label the new tab "Platform" or keep as "Admin" with a different icon to distinguish from the league "League" tab. The shield icon + "Admin" label is sufficient visual distinction.

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

**Commit:** `feat: add conditional App Admin tab to bottom navigation`
<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->
