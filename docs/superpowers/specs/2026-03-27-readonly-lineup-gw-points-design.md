# Read-Only Lineup — GW Points & Live Navigation

**Date:** 2026-03-27
**Status:** Design approved, pending spec review + implementation plan

---

## Problem

The read-only lineup view (`/view-lineup/[teamId]`) currently shows hardcoded `0` for all player points. Users cannot see actual GW scores or navigate between gameweeks to view historical lineups and performance.

## Requirements (confirmed with user)

1. **Display current GW points** for each player in the read-only lineup, updating as scores come in
2. **GW navigation with left/right arrows** to browse past gameweeks all the way back to GW 1, but NOT into the future
3. **Lineup reflects the GW snapshot** — navigating to a past GW shows the exact lineup that manager submitted for that GW (different XI, captain, bench, etc.)
4. **Bench players show their actual points** even though those points didn't count toward the team total
5. **Default to current active GW** on page load — the left arrow from there takes the user to the latest completed GW

---

## Design

### GW Navigation Bar

Sits between the header bar and the pitch/list view toggle:

```
  [←]   GW 3   [→]
```

- **Left arrow**: Navigate to previous GW (GW N-1). Disabled/hidden at GW 1.
- **Right arrow**: Navigate to next GW (GW N+1). Disabled/hidden at the current active GW (no future navigation).
- **GW label**: Shows "GW {number}" and updates on navigation.
- **Default on page load**: Current active GW (UPCOMING or ACTIVE status). If no active GW, fall back to latest COMPLETED GW.

### Lineup Snapshot Per GW

When navigating to a GW, the page fetches **that GW's saved lineup** for the team via `GET /api/teams/[teamId]/lineups/[gameweekId]`. The XI, bench, captain, and VC all reflect the exact lineup submitted for that GW.

If no lineup was saved for that GW, show a "No lineup submitted for GW N" message in place of the pitch/list view.

### Player Points Display

- Fetch per-player points from `GET /api/teams/[teamId]/scores/[gameweekId]`
- **Pitch view**: Show each player's GW points on their name plate (replacing the hardcoded `0`)
- **List view**: Show each player's GW points in the right column (replacing the hardcoded `0`)
- **Bench players**: Show the actual points they scored (even though they didn't count toward team total)
- **Captain**: Shows `2×` multiplier badge next to their points
- **No scores yet** (active GW, matches not started): Show `0` or `—`

### Team GW Total

- Display the team's total GW score (from `GameweekScore.totalPoints` — includes captain/VC/chip multipliers)
- List view summary bar updates with actual totals per GW
- Header area shows the GW total alongside the GW navigation

### Data Flow

```
User taps ← or → arrow
  → setSelectedGW(newGwNumber)
  → Parallel fetch:
      1. GET /api/teams/[teamId]/lineups/[gameweekId]  → lineup snapshot
      2. GET /api/teams/[teamId]/scores/[gameweekId]   → player points
  → Update xi, bench, captainId, vcId from lineup response
  → Overlay points from scores response onto player cards
  → Update team GW total from GameweekScore
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| GW with no saved lineup | Show "No lineup submitted for GW N" message |
| GW with no scores yet (upcoming/active) | Show lineup with `0` points |
| Team didn't exist in earlier GWs | Show "No lineup submitted" |
| Left arrow at GW 1 | Arrow disabled/hidden |
| Right arrow at current active GW | Arrow disabled/hidden |

---

## Existing APIs to Use

| API | Purpose |
|-----|---------|
| `GET /api/gameweeks` | Fetch all GWs (to know min/max GW numbers) |
| `GET /api/gameweeks/current` | Get current active GW (default on load) |
| `GET /api/teams/[teamId]/lineups/[gameweekId]` | Fetch lineup snapshot for a specific GW |
| `GET /api/teams/[teamId]/scores/[gameweekId]` | Fetch per-player points for a team in a GW |

---

## File Changes

| File | Change |
|------|--------|
| `app/view-lineup/[teamId]/page.tsx` | Add GW navigation bar, fetch GW-specific lineup + scores, display real points |

No new API routes needed — all existing APIs support this feature.

---

## Context for Implementation

- The view-lineup page currently fetches lineup for the current GW on load and hardcodes `0` for all points
- The dashboard GW detail sheet (`app/page.tsx`) already fetches and displays per-player scores using the same `/api/teams/[teamId]/scores/[gameweekId]` endpoint — reference its data handling pattern
- `PlayerScore` model stores per-player GW points; `GameweekScore` stores the team GW total
- The lineup API supports carry-forward: if no lineup was explicitly saved for a GW, it auto-creates from the previous GW's lineup
- Gameweek statuses: UPCOMING, ACTIVE, COMPLETED
