# FAL — Known Issues & Fixes Tracker

Running document for bugs and improvements identified during testing. Add new issues as they're found.

---

## Open Issues

### ISSUE-001 — Admin must be a player in their own league
**Status:** Open
**Found:** 2026-03-24
**Area:** League Creation / Admin

**Description:**
When creating a league as an admin, the admin is not automatically added as a player/team member. The admin should be required to be part of the league they create — either by auto-enrolling them, or by blocking league creation unless the admin also registers a team.

**Expected behaviour:** Admin creates a league and is automatically enrolled as a participant, or is prompted to register their team before the league goes live.
**Actual behaviour:** Admin can create a league without being a player in it.

---

### ISSUE-002 — Cannot create a second league after creating the first
**Status:** Open
**Found:** 2026-03-24
**Area:** League Creation / Admin

**Description:**
After successfully creating one league, attempting to create a second league fails. It is unclear whether this is a UI bug (form not resetting), a backend constraint (one league per admin), or a session/state issue.

**Expected behaviour:** An admin should be able to create multiple leagues.
**Actual behaviour:** Second league creation is blocked or fails silently.

---

### ISSUE-003 — Captain / Vice Captain selection redesign
**Status:** Open
**Found:** 2026-03-24
**Area:** Edit Lineup / Player Stats

**Description:**
The current C/VC selection flow needs to be replaced with a player-stats-driven approach:

1. Tapping a player name in the Edit Lineup screen should open the **Player Stats screen**.
2. The Player Stats screen should have two checkboxes: **Captain** and **Vice Captain**.
3. Selecting Captain on a player automatically removes the Captain badge from whoever previously held it (and same for Vice Captain) — only one player can hold each role at a time.
4. The existing C/VC action buttons in the list view can be removed or demoted once this flow is in place.

**Expected behaviour:** User taps player name → Player Stats screen opens → checks Captain or VC checkbox → previous C/VC is overridden → change reflected immediately in the lineup.
**Actual behaviour:** C/VC is assigned via action buttons directly in the lineup list view with no player stats context.

---

### ISSUE-004 — Manager name should display as team name
**Status:** Open
**Found:** 2026-03-24
**Area:** UI / Display

**Description:**
Wherever a manager's name is shown (leaderboard, standings, lineup views, league screens), it should display the team name instead of the manager's account name.

**Expected behaviour:** All references to the manager show their team name (e.g. "Cummin Side", "BashXI").
**Actual behaviour:** Manager's account name/email is shown instead of their team name.

---

### ISSUE-005 — Tapping team name on home screen does not navigate
**Status:** Open
**Found:** 2026-03-24
**Area:** Dashboard / Navigation

**Description:**
On the home screen, tapping a team name does nothing. It should navigate to the read-only lineup view for that team (the view-lineup screen).

**Expected behaviour:** Tap team name on home screen → opens the read-only lineup view for that team.
**Actual behaviour:** Nothing happens, no navigation occurs.

---

### ISSUE-006 — Read-only team view should show the locked GW lineup, not pending changes
**Status:** Open
**Found:** 2026-03-24
**Area:** View Lineup (Read-only)

**Description:**
When viewing another team's lineup (or your own in read-only mode), the screen is showing lineup changes that have been made for the upcoming gameweek but not yet locked. It should only show the team as it was locked for the most recently completed or active gameweek.

**Expected behaviour:** The read-only team view shows the lineup that was locked at the GW deadline — no in-progress edits or future GW changes should be visible.
**Actual behaviour:** Pending/unsaved lineup changes for the next GW are visible in the read-only view.

---

### ISSUE-007 — Bench swap in list view auto-selects first eligible player instead of letting user choose
**Status:** Open
**Found:** 2026-03-24
**Area:** Edit Lineup / List View

**Description:**
When moving a player to/from the bench in the list view, the app automatically swaps with the first eligible player of the same role (e.g. first bowler swaps with first bowler on bench) instead of letting the user pick which player they want to swap with.

**Expected behaviour:** When the user initiates a bench swap, they should be presented with a list of eligible players in the same role to choose from, then confirm the swap.
**Actual behaviour:** The swap happens automatically with the first matching player in the same role category — no choice is given to the user.

---

### ISSUE-008 — Lineup and captain changes lost after re-login despite "Saved Successfully" confirmation
**Status:** Open
**Found:** 2026-03-24
**Reported by:** Sanket Subu
**Area:** Edit Lineup / Persistence

**Description:**
After editing the lineup and changing captains, the user received a "Saved Successfully" confirmation. However, upon logging out and back in, all changes were reset to the previous state — indicating the save either failed silently on the backend or was only saved to local/session state and not persisted to the database.

**Expected behaviour:** Lineup and captain changes are persisted to the database on save. Re-login shows the last saved state.
**Actual behaviour:** Changes appear saved (confirmation shown) but are lost on re-login — the lineup reverts to its previous state.

---

## Resolved Issues

_None yet._

---

## How to Use This Document

- Add new issues under **Open Issues** with the next `ISSUE-XXX` number
- Include: status, date found, area, description, expected vs actual behaviour
- Move to **Resolved Issues** when fixed, with fix date and commit reference
