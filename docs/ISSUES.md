# FAL — Known Issues & Fixes Tracker

Running document for bugs and improvements identified during testing. Add new issues as they're found.

---

## Open Issues

### ISSUE-003 — Captain / Vice Captain selection redesign
**Status:** Partially Fixed
**Found:** 2026-03-24
**Area:** Edit Lineup / Player Stats

**Description:**
Tapping a player name in the Edit Lineup list view now opens a player stats sheet with Captain and Vice Captain toggles. The existing C/VC action buttons in list view also remain as quick shortcuts.

**Remaining:** Consider removing the inline C/VC buttons once the stats sheet flow is validated by users.

---

## Resolved Issues

### ISSUE-001 — Admin must be a player in their own league
**Status:** Resolved (2026-03-24)
**Fix:** Already working — `teams.create` in POST /api/leagues auto-enrolls admin.

### ISSUE-002 — Cannot create a second league after creating the first
**Status:** Resolved (2026-03-25)
**Fix:** Added "Create New League" button on admin page. Form gate changed from `!league` to `!league || showCreateForm`. TDD test: test 36.

### ISSUE-004 — Manager name should display as team name
**Status:** Resolved (2026-03-24)
**Fix:** Changed all display pages (dashboard, standings, leaderboard) to show `teamName` instead of `manager`.

### ISSUE-005 — Tapping team name on home screen does not navigate
**Status:** Resolved (2026-03-24)
**Fix:** Standings rows now wrapped with `<Link>` to `/view-lineup/{teamId}`.

### ISSUE-006 — Read-only team view should show the locked GW lineup
**Status:** Resolved (2026-03-25)
**Fix:** View-lineup now fetches saved lineup via GET /api/teams/{teamId}/lineups/{gwId}. Falls back to last completed GW, then default sort. TDD test: test 37.

### ISSUE-007 — Bench swap auto-selects
**Status:** Resolved (2026-03-25)
**Fix:** Move to Bench/XI now opens a selection sheet showing eligible players. User picks who to swap with. TDD test: test 38.

### ISSUE-008 — Lineup and captain changes lost after re-login
**Status:** Resolved (2026-03-24)
**Fix:** Lineup page now fetches saved lineup on load instead of regenerating from squad.

---

## How to Use This Document

- Add new issues under **Open Issues** with the next `ISSUE-XXX` number
- Include: status, date found, area, description, expected vs actual behaviour
- Move to **Resolved Issues** when fixed, with fix date and commit reference
