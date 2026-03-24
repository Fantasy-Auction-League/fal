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

## Resolved Issues

_None yet._

---

## How to Use This Document

- Add new issues under **Open Issues** with the next `ISSUE-XXX` number
- Include: status, date found, area, description, expected vs actual behaviour
- Move to **Resolved Issues** when fixed, with fix date and commit reference
