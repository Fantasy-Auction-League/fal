# Lineup UI & Scoring Changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven UI and scoring changes across lineup screens, player popup, player profile, and the scoring engine.

**Architecture:** All UI changes are in three page components (`app/lineup/page.tsx`, `app/view-lineup/[teamId]/page.tsx`, `app/players/page.tsx`) plus one shared scoring utility. The scoring fix is a one-line change in `lib/scoring/multipliers.ts`. A new API endpoint provides league GW stats (average, highest) for the read-only lineup header. A client-side scoring breakdown utility reconstructs per-category fantasy points from raw stats.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, PostgreSQL

**Design Spec:** `docs/superpowers/specs/2026-03-29-lineup-ui-scoring-changes-design.md`

---

### Task 1: Unify C/VC Badge Size (Both Lineup Screens)

**Files:**
- Modify: `app/lineup/page.tsx` (pitch view badge ~line 711, list view badge ~line 1226)
- Modify: `app/view-lineup/[teamId]/page.tsx` (pitch view badge ~line 184, list view badge ~line 998)

- [ ] **Step 1: Update edit lineup pitch view C/VC badge**

In `app/lineup/page.tsx`, find the pitch view badge (around line 711):

```tsx
// FIND this:
    width: 16, height: 16, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 8, fontWeight: 900,
    background: isCaptain ? '#F9CD05' : '#C0C7D0',
    color: '#1a1a1a',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
```

Replace with:

```tsx
    width: 22, height: 22, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 900,
    background: isCaptain ? '#F9CD05' : '#C0C7D0',
    color: '#1a1a1a',
    border: '2px solid #fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
```

Also update the position to accommodate the larger badge — change `top: -2, right: isBench ? -2 : 2` to `top: -4, right: isBench ? -4 : 0`.

- [ ] **Step 2: Update read-only lineup pitch view C/VC badge**

In `app/view-lineup/[teamId]/page.tsx`, find the same badge (around line 184) and apply the identical change:

```tsx
// FIND:
    width: 16, height: 16, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 8, fontWeight: 900,
    background: isCaptain ? '#F9CD05' : '#C0C7D0',
    color: '#1a1a1a',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',

// REPLACE:
    width: 22, height: 22, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 900,
    background: isCaptain ? '#F9CD05' : '#C0C7D0',
    color: '#1a1a1a',
    border: '2px solid #fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
```

Same position update: `top: -4, right: isBench ? -4 : 0`.

- [ ] **Step 3: Verify visually**

Open http://localhost:3000/lineup and http://localhost:3000/view-lineup/{teamId} in the browser. Confirm C/VC badges are the same size on both screens (~22px circle, larger text).

- [ ] **Step 4: Commit**

```bash
git add app/lineup/page.tsx app/view-lineup/\[teamId\]/page.tsx
git commit -m "feat: unify C/VC badge size across lineup screens"
```

---

### Task 2: Remove Role Background Labels + Add "Playing XI" Header (Both)

**Files:**
- Modify: `app/lineup/page.tsx` (~lines 1020-1044 for role labels)
- Modify: `app/view-lineup/[teamId]/page.tsx` (~lines 817-845 for role labels)

- [ ] **Step 1: Remove role labels from edit lineup**

In `app/lineup/page.tsx`, find and remove the three role label divs. Search for text "Top Order", "Middle Order", "Lower Order" — each is a `<div>` with:

```tsx
<div style={{
  fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
  textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
  textAlign: 'center', marginBottom: -2,
}}>Top Order</div>
```

Remove all three of these divs (Top Order, Middle Order, Lower Order). Do NOT remove the Bench label.

- [ ] **Step 2: Add "PLAYING XI" header to edit lineup**

Above the first row of XI players on the pitch view (just before the XI player grid begins), add:

```tsx
<div style={{
  fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
  textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.5)',
  textAlign: 'center', marginBottom: 4,
}}>Playing XI</div>
```

- [ ] **Step 3: Remove role labels from read-only lineup**

In `app/view-lineup/[teamId]/page.tsx`, find the same "Top Order" / "Middle Order" labels (~lines 817-845) and remove them. Same style pattern as edit lineup.

- [ ] **Step 4: Add "PLAYING XI" header to read-only lineup**

Same as step 2 — add the "Playing XI" header div before the XI player grid.

- [ ] **Step 5: Verify visually**

Check both screens. Role group labels should be gone. "PLAYING XI" should appear at top of the XI section. "BENCH" label should still be present.

- [ ] **Step 6: Commit**

```bash
git add app/lineup/page.tsx app/view-lineup/\[teamId\]/page.tsx
git commit -m "feat: replace role background labels with Playing XI header"
```

---

### Task 3: Read-Only Lineup Dashboard-Style Header

**Files:**
- Modify: `app/view-lineup/[teamId]/page.tsx` (~lines 626-675 header section)
- Create: `app/api/leagues/[id]/gw-stats/route.ts` (new API for league GW average/highest)

- [ ] **Step 1: Create the league GW stats API endpoint**

Create `app/api/leagues/[id]/gw-stats/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params
  const gwNumber = request.nextUrl.searchParams.get('gw')

  if (!gwNumber) {
    return NextResponse.json({ error: 'gw param required' }, { status: 400 })
  }

  const gw = await prisma.gameweek.findUnique({
    where: { number: parseInt(gwNumber) },
    select: { id: true },
  })

  if (!gw) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, userId: true },
  })

  const teamIds = teams.map(t => t.id)

  const scores = await prisma.gameweekScore.findMany({
    where: {
      gameweekId: gw.id,
      teamId: { in: teamIds },
    },
    select: { teamId: true, totalPoints: true },
  })

  if (scores.length === 0) {
    return NextResponse.json({ average: 0, highest: 0, highestTeamId: null })
  }

  const total = scores.reduce((sum, s) => sum + s.totalPoints, 0)
  const average = Math.round(total / scores.length)
  const best = scores.reduce((b, s) => s.totalPoints > b.totalPoints ? s : b, scores[0])

  return NextResponse.json({
    average,
    highest: best.totalPoints,
    highestTeamId: best.teamId,
  })
}
```

- [ ] **Step 2: Add state and fetch for GW stats in read-only lineup**

In `app/view-lineup/[teamId]/page.tsx`, add state variables near the other state declarations (~line 311):

```typescript
const [gwStats, setGwStats] = useState<{ average: number; highest: number; highestTeamId: string | null } | null>(null)
```

Add a useEffect to fetch GW stats when the selected GW or league changes:

```typescript
useEffect(() => {
  if (!teamDetail?.league?.id || selectedGWNumber === null) return
  fetch(`/api/leagues/${teamDetail.league.id}/gw-stats?gw=${selectedGWNumber}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => setGwStats(data))
    .catch(() => setGwStats(null))
}, [teamDetail?.league?.id, selectedGWNumber])
```

- [ ] **Step 3: Replace the header with dashboard-style gradient**

Replace the existing header section (~lines 626-675) with:

```tsx
{/* ── Dashboard-Style Hero Header ── */}
<div style={{
  background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
  padding: '20px 18px 16px',
  position: 'relative',
  overflow: 'hidden',
  flexShrink: 0,
}}>
  {/* Radial glow */}
  <div style={{
    position: 'absolute', top: '-30%', right: '-20%',
    width: 300, height: 300,
    background: 'radial-gradient(circle, rgba(249,205,5,0.07) 0%, transparent 70%)',
    pointerEvents: 'none',
  }} />

  {/* Top row: back + title + read only badge */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
    <button
      onClick={() => router.back()}
      style={{
        width: 30, height: 30, borderRadius: 8,
        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'rgba(255,255,255,0.7)',
        fontSize: 15, fontWeight: 600,
      }}
    >
      &#8592;
    </button>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>
      {managerFirstName}&apos;s Lineup
    </div>
    <span style={{
      marginLeft: 'auto',
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
      background: 'rgba(255,255,255,0.12)', padding: '2px 7px', borderRadius: 5,
      border: '1px solid rgba(255,255,255,0.15)',
      letterSpacing: 0.3, textTransform: 'uppercase' as const,
    }}>
      <LockIcon />
      Read Only
    </span>
  </div>

  {/* GW label with status badge */}
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
    <div style={{
      fontSize: 10, color: 'rgba(255,255,255,0.5)',
      fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' as const,
    }}>
      Gameweek {selectedGWNumber}
    </div>
    {gwStatus && (
      <div style={{
        fontSize: 9, fontWeight: 700,
        color: gwStatus === 'ACTIVE' ? '#4ade80' : 'rgba(255,255,255,0.5)',
        background: gwStatus === 'ACTIVE' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
        padding: '2px 6px', borderRadius: 4,
      }}>
        {gwStatus === 'ACTIVE' ? 'LIVE' : 'FINAL'}
      </div>
    )}
  </div>

  {/* Score trio */}
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 12 }}>
    {/* Average */}
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
        {gwStats?.average ?? '—'}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginTop: 1 }}>Average</div>
    </div>

    {/* This team's points (center, large) */}
    <div style={{ flex: 1.3, textAlign: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '10%', bottom: '20%', left: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />
      <div style={{ position: 'absolute', top: '10%', bottom: '20%', right: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />
      <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {gwTotal > 0 ? gwTotal : '—'}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginTop: 2 }}>Points</div>
    </div>

    {/* Highest (clickable) */}
    <div
      onClick={() => {
        if (gwStats?.highestTeamId && gwStats.highestTeamId !== teamId) {
          router.push(`/view-lineup/${gwStats.highestTeamId}?gw=${selectedGWNumber}`)
        }
      }}
      style={{ flex: 1, textAlign: 'center', cursor: gwStats?.highestTeamId ? 'pointer' : 'default' }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
        {gwStats?.highest ?? '—'}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginTop: 1 }}>Highest</div>
    </div>
  </div>

  {/* GW navigation */}
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
    {selectedGWNumber > 1 && (
      <button
        onClick={() => navigateGW('prev')}
        style={{
          background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
          padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.6)',
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        ← GW{selectedGWNumber - 1}
      </button>
    )}
    <button
      onClick={() => navigateGW('next')}
      style={{
        background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
        padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.6)',
        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      GW{selectedGWNumber + 1} →
    </button>
  </div>
</div>
```

Note: You'll need to check how `gwStatus`, `navigateGW`, `selectedGWNumber`, `gwTotal`, `teamId` are defined — they already exist in the component. Also check if there's a `LockIcon` component already used.

- [ ] **Step 4: Remove the old GW navigation bar**

The old GW navigation bar that was below the header (~lines after the header section) should be removed since navigation is now inside the gradient header.

- [ ] **Step 5: Verify visually**

Open http://localhost:3000/view-lineup/{teamId}. Confirm:
- Gradient header matching dashboard style
- Score trio with Average | Points | Highest
- Clicking Highest navigates to that team's lineup
- GW navigation works

- [ ] **Step 6: Commit**

```bash
git add app/api/leagues/\[id\]/gw-stats/route.ts app/view-lineup/\[teamId\]/page.tsx
git commit -m "feat: dashboard-style header with score trio for read-only lineup"
```

---

### Task 4: Edit Lineup — GW Opponent Display

**Files:**
- Modify: `app/lineup/page.tsx` (IPL team code display ~line 1239, data fetching)

- [ ] **Step 1: Fetch GW fixtures in the lineup page**

In `app/lineup/page.tsx`, add a state variable for fixtures and fetch them. Near the existing state declarations, add:

```typescript
const [gwFixtures, setGwFixtures] = useState<{ localTeamName: string | null; visitorTeamName: string | null }[]>([])
```

Add a useEffect that fetches the current GW's matches:

```typescript
useEffect(() => {
  if (!currentGW?.id) return
  fetch(`/api/gameweeks/current`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.matches) setGwFixtures(data.matches)
    })
    .catch(() => {})
}, [currentGW?.id])
```

- [ ] **Step 2: Create a helper to get opponents for a player's IPL team**

Add this helper function inside the component (or near the top):

```typescript
function getGwOpponents(iplTeamName: string | null, fixtures: { localTeamName: string | null; visitorTeamName: string | null }[]): string[] {
  if (!iplTeamName) return []
  return fixtures
    .filter(f => f.localTeamName === iplTeamName || f.visitorTeamName === iplTeamName)
    .map(f => {
      const opponent = f.localTeamName === iplTeamName ? f.visitorTeamName : f.localTeamName
      return teamNameToCode[opponent ?? ''] || opponent?.slice(0, 3).toUpperCase() || '?'
    })
}
```

This uses the existing `teamNameToCode` map already in the file.

- [ ] **Step 3: Replace IPL team code with opponent display on pitch view**

Find where the IPL team code is shown under player names on the pitch view. Look for the display of `p.iplTeamCode` in the pitch player figure rendering. Replace:

```tsx
// FIND (around the pitch view player figure, below player name):
<div style={{ fontSize: 7, color: 'rgba(255,255,255,0.6)', ... }}>
  {p.iplTeamCode || 'IPL'}
</div>
```

Replace with:

```tsx
{(() => {
  const opponents = getGwOpponents(p.iplTeamName, gwFixtures)
  return opponents.length > 0 ? opponents.map((opp, i) => (
    <div key={i} style={{ fontSize: 7, color: '#0d9488', fontWeight: 600, lineHeight: 1.3 }}>
      vs {opp}
    </div>
  )) : (
    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.6)' }}>
      {p.iplTeamCode || 'IPL'}
    </div>
  )
})()}
```

- [ ] **Step 4: Replace IPL team code in list view**

Find the list view display of IPL team code (~line 1239):

```tsx
// FIND:
<div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
  {p.iplTeamCode || 'IPL'} &middot; {role}
</div>
```

Replace with:

```tsx
<div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
  {(() => {
    const opponents = getGwOpponents(p.iplTeamName, gwFixtures)
    return opponents.length > 0
      ? opponents.map(o => `vs ${o}`).join(', ')
      : (p.iplTeamCode || 'IPL')
  })()} · {role}
</div>
```

- [ ] **Step 5: Verify visually**

Open http://localhost:3000/lineup. Confirm:
- Players show "vs GT", "vs RR" instead of "MI"
- Players with 2 matches show two lines on pitch view
- List view shows "vs GT, vs RR · BAT" format
- Falls back to team code if no fixtures loaded

- [ ] **Step 6: Commit**

```bash
git add app/lineup/page.tsx
git commit -m "feat: show GW opponents instead of IPL team code on edit lineup"
```

---

### Task 5: Player Popup — GW Points Breakdown (Read-Only Lineup)

**Files:**
- Create: `lib/scoring/breakdown.ts` (client-side scoring breakdown utility)
- Modify: `app/view-lineup/[teamId]/page.tsx` (popup section)

- [ ] **Step 1: Create the scoring breakdown utility**

Create `lib/scoring/breakdown.ts`:

```typescript
export interface ScoringLine {
  category: string
  rawValue: string     // e.g., "52"
  formula: string      // e.g., "× 1pt"
  points: number
}

const DUCK_EXEMPT_ROLES = ['BOWL']

export function computeBattingBreakdown(stats: {
  runs: number | null
  balls: number | null
  fours: number | null
  sixes: number | null
}, role: string): ScoringLine[] {
  const lines: ScoringLine[] = []
  const runs = stats.runs ?? 0
  const balls = stats.balls ?? 0
  const fours = stats.fours ?? 0
  const sixes = stats.sixes ?? 0

  if (runs > 0) {
    lines.push({ category: 'Runs', rawValue: `${runs}`, formula: '× 1pt', points: runs })
  }
  if (fours > 0) {
    lines.push({ category: 'Fours', rawValue: `${fours}`, formula: '× 4pts', points: fours * 4 })
  }
  if (sixes > 0) {
    lines.push({ category: 'Sixes', rawValue: `${sixes}`, formula: '× 6pts', points: sixes * 6 })
  }

  // Milestone bonuses
  if (runs >= 100) {
    lines.push({ category: '100 Bonus', rawValue: '✓', formula: '100+ runs', points: 16 })
  } else {
    if (runs >= 75) lines.push({ category: '75 Bonus', rawValue: '✓', formula: '75+ runs', points: 12 })
    if (runs >= 50) lines.push({ category: '50 Bonus', rawValue: '✓', formula: '50+ runs', points: 8 })
    if (runs >= 25) lines.push({ category: '25 Bonus', rawValue: '✓', formula: '25+ runs', points: 4 })
  }

  // Strike rate bonus/penalty (min 10 balls, bowlers exempt)
  if (balls >= 10 && role !== 'BOWL') {
    const sr = (runs / balls) * 100
    let srPts = 0
    let label = ''
    if (sr > 170) { srPts = 6; label = '>170' }
    else if (sr > 150) { srPts = 4; label = '>150' }
    else if (sr >= 130) { srPts = 2; label = '≥130' }
    else if (sr >= 60 && sr <= 70) { srPts = -2; label = '60-70' }
    else if (sr >= 50 && sr < 60) { srPts = -4; label = '50-60' }
    else if (sr < 50) { srPts = -6; label = '<50' }
    if (srPts !== 0) {
      lines.push({ category: 'Strike Rate', rawValue: sr.toFixed(1), formula: label, points: srPts })
    }
  }

  // Duck penalty
  if (runs === 0 && balls >= 1 && !DUCK_EXEMPT_ROLES.includes(role)) {
    lines.push({ category: 'Duck', rawValue: '✗', formula: '0 runs', points: -2 })
  }

  return lines
}

export function computeBowlingBreakdown(stats: {
  wickets: number | null
  overs: number | null
  maidens: number | null
  runsConceded: number | null
}): ScoringLine[] {
  const lines: ScoringLine[] = []
  const wickets = stats.wickets ?? 0
  const overs = stats.overs ?? 0
  const maidens = stats.maidens ?? 0
  const runsConceded = stats.runsConceded ?? 0

  if (wickets > 0) {
    lines.push({ category: 'Wickets', rawValue: `${wickets}`, formula: '× 30pts', points: wickets * 30 })
  }
  if (maidens > 0) {
    lines.push({ category: 'Maidens', rawValue: `${maidens}`, formula: '× 12pts', points: maidens * 12 })
  }

  // Wicket milestone bonuses (don't stack)
  if (wickets >= 5) {
    lines.push({ category: '5W Bonus', rawValue: '✓', formula: '5+ wkts', points: 12 })
  } else if (wickets >= 4) {
    lines.push({ category: '4W Bonus', rawValue: '✓', formula: '4+ wkts', points: 8 })
  } else if (wickets >= 3) {
    lines.push({ category: '3W Bonus', rawValue: '✓', formula: '3+ wkts', points: 4 })
  }

  // Economy rate (min 2 overs)
  const decimalOvers = Math.floor(overs) + (overs % 1) * 10 / 6
  if (decimalOvers >= 2) {
    const er = runsConceded / decimalOvers
    let erPts = 0
    let label = ''
    if (er < 5) { erPts = 6; label = '<5' }
    else if (er < 6) { erPts = 4; label = '<6' }
    else if (er <= 7) { erPts = 2; label = '≤7' }
    else if (er >= 10 && er <= 11) { erPts = -2; label = '10-11' }
    else if (er > 11 && er <= 12) { erPts = -4; label = '11-12' }
    else if (er > 12) { erPts = -6; label = '>12' }
    if (erPts !== 0) {
      lines.push({ category: 'Economy', rawValue: er.toFixed(1), formula: label, points: erPts })
    }
  }

  return lines
}

export function computeFieldingBreakdown(stats: {
  catches: number
  stumpings: number
}): ScoringLine[] {
  const lines: ScoringLine[] = []

  if (stats.catches > 0) {
    lines.push({ category: 'Catches', rawValue: `${stats.catches}`, formula: '× 2pts', points: stats.catches * 2 })
  }
  if (stats.stumpings > 0) {
    lines.push({ category: 'Stumpings', rawValue: `${stats.stumpings}`, formula: '× 6pts', points: stats.stumpings * 6 })
  }

  return lines
}

export function computeParticipationLine(fantasyPoints: number, battingPts: number, bowlingPts: number, fieldingPts: number): ScoringLine[] {
  // Participation = total fantasy points minus batting + bowling + fielding
  const participationPts = fantasyPoints - battingPts - bowlingPts - fieldingPts
  if (participationPts > 0) {
    return [{ category: 'Starting XI', rawValue: '✓', formula: 'played', points: participationPts }]
  }
  return []
}
```

- [ ] **Step 2: Add the GW breakdown section to the read-only popup**

In `app/view-lineup/[teamId]/page.tsx`, find the compact view section of the player popup (after the Fixtures row, before the Full Profile button — around line 1306).

Import the breakdown utility at the top of the file:

```typescript
import { computeBattingBreakdown, computeBowlingBreakdown, computeFieldingBreakdown, type ScoringLine } from '@/lib/scoring/breakdown'
```

Insert the breakdown section between the Fixtures section and the Full Profile button:

```tsx
{/* GW Points Breakdown */}
{!sheetDetailLoading && sheetDetail && (() => {
  const gwPerfs = sheetDetail.performances.filter(perf => {
    const gwNum = perf.match?.gameweek?.number
    return gwNum === selectedGWNumber
  })
  if (gwPerfs.length === 0) return null

  const gwMatchTotal = gwPerfs.reduce((sum, p) => sum + p.fantasyPoints, 0)
  const playerTeam = playerStatsSheet?.iplTeamName

  return (
    <div style={{ padding: '8px 16px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          GW{selectedGWNumber} Points Breakdown
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#004BA0' }}>{gwMatchTotal} pts</div>
      </div>

      {gwPerfs.map((perf, perfIdx) => {
        const m = perf.match
        if (!m) return null
        const opponentName = m.localTeamName === playerTeam ? m.visitorTeamName : m.localTeamName
        const oppCode = teamNameToCode[opponentName ?? ''] || opponentName?.slice(0, 3).toUpperCase() || '?'
        const fmtDate = (iso: string) => {
          const d = new Date(iso)
          return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        }
        const matchDate = m.startingAt ? fmtDate(m.startingAt) : ''
        const pts = perf.fantasyPoints
        const ptsColor = pts > 30 ? '#0d9e5f' : pts >= 15 ? '#c88a00' : '#d44'

        const role = normalizeRole(playerStatsSheet?.role ?? 'BAT')
        const batLines = computeBattingBreakdown(perf, role)
        const bowlLines = computeBowlingBreakdown(perf)
        const fieldLines = computeFieldingBreakdown(perf)
        const batTotal = batLines.reduce((s, l) => s + l.points, 0)
        const bowlTotal = bowlLines.reduce((s, l) => s + l.points, 0)
        const fieldTotal = fieldLines.reduce((s, l) => s + l.points, 0)
        const remainder = pts - batTotal - bowlTotal - fieldTotal
        const participationLines: ScoringLine[] = remainder > 0
          ? [{ category: 'Starting XI', rawValue: '✓', formula: 'played', points: remainder }]
          : []
        const allLines = [...batLines, ...bowlLines, ...fieldLines, ...participationLines]

        return (
          <div key={perfIdx} style={{
            background: '#fff', border: '1.5px solid #e8eaf0', borderRadius: 12,
            padding: '12px 14px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #f0f1f5',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>
                vs {oppCode} · {matchDate}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: ptsColor }}>{pts}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {allLines.map((line, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', fontSize: 12, padding: '5px 0',
                  borderBottom: i < allLines.length - 1 ? '1px solid #f5f6f9' : 'none',
                }}>
                  <span style={{ flex: 1.2, color: '#555', fontWeight: 500 }}>{line.category}</span>
                  <span style={{ flex: 2, textAlign: 'center', color: '#1a1a2e' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{line.rawValue}</span>
                    <span style={{ color: '#999', fontSize: 11, marginLeft: 2 }}>{line.formula}</span>
                  </span>
                  <span style={{ flex: 0.8, textAlign: 'right', fontWeight: 700, color: '#004BA0', fontSize: 12 }}>
                    {line.points > 0 ? '+' : ''}{line.points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
})()}
```

- [ ] **Step 3: Verify visually**

Open a read-only lineup page, click a player. Below Fixtures, you should see "GW{N} POINTS BREAKDOWN" with per-match cards showing the formula breakdown. Navigate to a different GW and confirm the breakdown updates.

- [ ] **Step 4: Commit**

```bash
git add lib/scoring/breakdown.ts app/view-lineup/\[teamId\]/page.tsx
git commit -m "feat: add GW points breakdown with formulas to player popup"
```

---

### Task 6: Player Full Profile — IPL Stats Header

**Files:**
- Modify: `app/view-lineup/[teamId]/page.tsx` (~line 1430 batting table, ~line 1468 bowling table)
- Modify: `app/lineup/page.tsx` (same full profile view)
- Modify: `app/players/page.tsx` (same full profile view)

- [ ] **Step 1: Add IPL divider row to batting table in read-only lineup**

In `app/view-lineup/[teamId]/page.tsx`, find the batting table `<tbody>` section (~line 1447). After the career row (`r.isCareer` row) and before the season rows, add an IPL divider:

Find the `batRows.map` block. Modify it to insert the IPL divider:

```tsx
{batRows.map((r, i) => (
  <React.Fragment key={i}>
    {/* Insert IPL divider between career row and first season row */}
    {i === 1 && batRows[0]?.isCareer && (
      <tr>
        <td colSpan={7} style={{ padding: '8px 4px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#004BA0', textTransform: 'uppercase', letterSpacing: 1 }}>IPL</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(0,75,160,0.15)' }} />
          </div>
        </td>
      </tr>
    )}
    <tr style={{
      background: r.isCareer ? 'rgba(0,75,160,0.04)' : i % 2 === 0 ? '#fff' : '#fafbfd',
    }}>
      {/* ... existing td cells ... */}
    </tr>
  </React.Fragment>
))}
```

- [ ] **Step 2: Add IPL divider row to bowling table**

Apply the same pattern to the bowling table `bowlRows.map` block (~line 1486).

- [ ] **Step 3: Apply the same changes to edit lineup and players page**

Repeat steps 1-2 for:
- `app/lineup/page.tsx` (find the same batting/bowling table rendering in the full profile view)
- `app/players/page.tsx` (find the same table rendering)

All three files have nearly identical full profile rendering code.

- [ ] **Step 4: Verify visually**

Click a player → Full Profile on any of the three screens. Confirm "IPL" divider with blue text + line appears between the T20 career row and the season rows, in both batting and bowling tables.

- [ ] **Step 5: Commit**

```bash
git add app/view-lineup/\[teamId\]/page.tsx app/lineup/page.tsx app/players/page.tsx
git commit -m "feat: add IPL header divider to player profile stats tables"
```

---

### Task 7: WK Powerplay Batting Chip Fix

**Files:**
- Modify: `lib/scoring/multipliers.ts` (line ~96 in `applyChipEffects`)
- Modify: `tests/unit/scoring-multipliers.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/scoring-multipliers.test.ts`, add a new test case in the `applyChipEffects` describe block:

```typescript
it('POWER_PLAY_BAT doubles WK player points', () => {
  const scoringXI = new Set(['p1', 'p2', 'p3'])
  const gwPoints = new Map([['p1', 30], ['p2', 20], ['p3', 15]])
  const playerRoles = new Map([['p1', 'BAT'], ['p2', 'WK'], ['p3', 'BOWL']])

  const total = applyChipEffects('POWER_PLAY_BAT', scoringXI, gwPoints, playerRoles)

  // Base: 30 + 20 + 15 = 65
  // Chip doubles BAT (30) + WK (20) = 50 extra
  // Total: 65 + 50 = 115
  expect(total).toBe(115)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/scoring-multipliers.test.ts -t "POWER_PLAY_BAT doubles WK"
```

Expected: FAIL — WK player points not doubled (total will be 95 instead of 115).

- [ ] **Step 3: Fix the chip logic**

In `lib/scoring/multipliers.ts`, find the `POWER_PLAY_BAT` case (~line 96):

```typescript
// FIND:
    case 'POWER_PLAY_BAT':
      for (const pid of scoringXI) {
        if (playerRoles.get(pid) === 'BAT') {
          teamTotal += gwPoints.get(pid) ?? 0
        }
      }
      break

// REPLACE:
    case 'POWER_PLAY_BAT':
      for (const pid of scoringXI) {
        const role = playerRoles.get(pid)
        if (role === 'BAT' || role === 'WK') {
          teamTotal += gwPoints.get(pid) ?? 0
        }
      }
      break
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/unit/scoring-multipliers.test.ts -t "POWER_PLAY_BAT doubles WK"
```

Expected: PASS

- [ ] **Step 5: Run all scoring tests to confirm no regressions**

```bash
npx vitest run tests/unit/scoring-multipliers.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/scoring/multipliers.ts tests/unit/scoring-multipliers.test.ts
git commit -m "fix: WK players get powerplay batting chip bonus (same as BAT)"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] All existing tests pass: `npm test`
- [ ] Edit lineup: C/VC badges are 22px, role labels removed, "Playing XI" header visible, opponents shown in teal
- [ ] Read-only lineup: gradient header with score trio, highest is clickable, GW points breakdown in popup with formulas
- [ ] Player full profile: "IPL" divider visible in stats tables
- [ ] WK players receive powerplay batting bonus in scoring engine
