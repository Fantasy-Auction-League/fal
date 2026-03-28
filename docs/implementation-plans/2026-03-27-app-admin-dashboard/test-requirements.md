# Test Requirements — App Admin Dashboard

Maps each acceptance criterion to specific tests. Uses Vitest for unit/integration tests and Playwright for e2e browser tests.

---

## Phase 1: App Admin Access Control

### AC1.1 — App admin users can access scoring operations

| Test type | File path | Description |
|-----------|-----------|-------------|
| Unit | `tests/unit/app-admin.test.ts` | `isAppAdmin("viiveek@gmail.com")` returns `true` when `APP_ADMIN_EMAILS` includes it |
| Unit | `tests/unit/app-admin.test.ts` | `isAppAdmin("VIIVEEK@GMAIL.COM")` returns `true` (case-insensitive) |
| Unit | `tests/unit/app-admin.test.ts` | `isAppAdmin("viiveek@gmail.com")` returns `true` when env has whitespace around commas |

### AC1.2 — `isAppAdmin` boolean available in session token

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/app-admin-auth.test.ts` | JWT callback sets `token.isAppAdmin = true` for app admin email |
| Integration | `tests/integration/app-admin-auth.test.ts` | JWT callback sets `token.isAppAdmin = false` for non-admin email |
| Integration | `tests/integration/app-admin-auth.test.ts` | Session callback exposes `session.user.isAppAdmin` matching token value |

### AC1.3 — Non-app-admin users receive 403 on scoring endpoints

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/scoring-access-control.test.ts` | `POST /api/scoring/import` returns 403 for authenticated non-app-admin user |
| Integration | `tests/integration/scoring-access-control.test.ts` | `POST /api/scoring/recalculate/[matchId]` returns 403 for non-app-admin |
| Integration | `tests/integration/scoring-access-control.test.ts` | `POST /api/scoring/cancel/[matchId]` returns 403 for non-app-admin |

### AC1.4 — League admin (UserRole.ADMIN) NOT in APP_ADMIN_EMAILS receives 403

| Test type | File path | Description |
|-----------|-----------|-------------|
| Unit | `tests/unit/app-admin.test.ts` | `isAppAdmin("league-admin@example.com")` returns `false` when not in `APP_ADMIN_EMAILS` |
| Integration | `tests/integration/scoring-access-control.test.ts` | User with `role: ADMIN` but email not in `APP_ADMIN_EMAILS` gets 403 on `POST /api/scoring/import` |

---

## Phase 2: Match Status Sync + Pipeline Fix

### AC2.1 — SCHEDULED matches finished on SportMonks transition to COMPLETED

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/match-sync.test.ts` | Create a SCHEDULED match in DB. Mock SportMonks returning `status: "Finished"` for that fixture ID. Call `syncMatchStatuses()`. Assert match is now COMPLETED in DB. |

### AC2.2 — Cancelled matches on SportMonks transition to CANCELLED

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/match-sync.test.ts` | Create a SCHEDULED match, mock SportMonks returning `status: "Cancl."`. Call `syncMatchStatuses()`. Assert match is CANCELLED in DB. |
| Integration | `tests/integration/match-sync.test.ts` | Same test with `status: "Aban."` (abandoned) — assert CANCELLED. |

### AC2.3 — Import Scores and cron both sync statuses before scoring

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/match-sync.test.ts` | Call `POST /api/scoring/import` as app admin. Assert response includes `matchesTransitioned` field. |
| Integration | `tests/integration/match-sync.test.ts` | Verify cron route also includes `matchesTransitioned` in response. |

### AC3.1 — Pipeline processes up to 6 matches per run

| Test type | File path | Description |
|-----------|-----------|-------------|
| Unit | `tests/unit/scoring-pipeline-limit.test.ts` | Verify the SQL query in `pipeline.ts` contains `LIMIT 6` |
| Integration | `tests/integration/scoring-pipeline.test.ts` | Seed 7 COMPLETED matches, run pipeline, assert exactly 6 are claimed and 1 remains COMPLETED. |

---

## Phase 3: Sync Player Teams

### AC4.1 — Dry-run returns changes without modifying DB

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/sync-players.test.ts` | Seed a Player with `iplTeamId: X`. Mock SportMonks returning that player under team Y. Call `syncPlayerTeams({ apply: false })`. Assert `teamChanges` non-empty AND Player row still has `iplTeamId: X`. |

### AC4.2 — Apply writes team changes to Player table

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/sync-players.test.ts` | Same setup as AC4.1 but call with `{ apply: true }`. Assert Player row now has `iplTeamId: Y` and `updatedCount >= 1`. |

### AC4.3 — Response includes affected fantasy teams

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/sync-players.test.ts` | Seed a Player on a fantasy Team (via TeamPlayer). Mock SportMonks with team change. Call dry-run. Assert `teamChanges[0].fantasyTeams` includes the fantasy team name. |

### AC4.4 — Non-app-admin receives 403 on GET and POST

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/sync-players-api.test.ts` | Call `GET /api/admin/sync-players` as non-app-admin. Assert 403. |
| Integration | `tests/integration/sync-players-api.test.ts` | Call `POST /api/admin/sync-players` as non-app-admin. Assert 403. |

### AC4.5 — Concurrent apply requests do not create duplicates

| Test type | File path | Description |
|-----------|-----------|-------------|
| Integration | `tests/integration/sync-players.test.ts` | Call `syncPlayerTeams({ apply: true })` twice concurrently (Promise.all). Assert second call throws "Sync already in progress". Assert no duplicate Player rows. |

---

## Phase 4: App Admin Dashboard Page + Navigation

### AC5.1 — App admin can view match scoring status table

| Test type | File path | Description |
|-----------|-----------|-------------|
| E2E | `tests/simulation/playwright/app-admin.spec.ts` | Log in as app admin, navigate to `/app-admin`. Assert match status table visible with at least one row and correct status pills. |

### AC5.2 — "Import Scores" button triggers pipeline and shows feedback

| Test type | File path | Description |
|-----------|-----------|-------------|
| E2E | `tests/simulation/playwright/app-admin.spec.ts` | Click "Import Scores". Assert button shows "Importing..." and is disabled. Assert success or "no matches" message appears. |

### AC5.3 — "Check for Updates" shows player team changes

| Test type | File path | Description |
|-----------|-----------|-------------|
| E2E | `tests/simulation/playwright/app-admin.spec.ts` | Click "Check for Updates". Assert loading state then results (changes table or "all up to date" message). |

### AC5.4 — "Apply Changes" with confirmation sheet

| Test type | File path | Description |
|-----------|-----------|-------------|
| **Manual** | N/A | Requires SportMonks API to return actual team differences. Verify manually: confirmation sheet appears, cancel works, apply writes changes. |

### AC5.5 — Error matches show "Recalculate" link

| Test type | File path | Description |
|-----------|-----------|-------------|
| **Manual** | N/A | Requires a match in ERROR state. Verify manually: set match to ERROR in DB, confirm "Recalculate" link appears and triggers re-scoring. |

### AC5.6 — Non-app-admin sees "Access denied" on `/app-admin`

| Test type | File path | Description |
|-----------|-----------|-------------|
| E2E | `tests/simulation/playwright/app-admin.spec.ts` | Log in as regular user, navigate to `/app-admin`. Assert "Access denied" message. |

### AC6.1 — App admin sees 5th nav tab

| Test type | File path | Description |
|-----------|-----------|-------------|
| E2E | `tests/simulation/playwright/app-admin.spec.ts` | Log in as app admin, navigate to `/`. Assert bottom nav contains "Admin" link to `/app-admin`. |

### AC6.2 — Non-app-admin sees only 4-tab nav

| Test type | File path | Description |
|-----------|-----------|-------------|
| E2E | `tests/simulation/playwright/app-admin.spec.ts` | Log in as regular user, navigate to `/`. Assert exactly 4 nav tabs, no "Admin" link. |

---

## Manual Verification Summary

| AC | Why manual | How to verify |
|----|-----------|---------------|
| AC5.4 | Needs live SportMonks data with actual team changes | Trigger a player trade scenario, click Apply, verify confirmation sheet and success |
| AC5.5 | Needs match in ERROR state | Set `scoringStatus: ERROR` in DB, load `/app-admin`, verify Recalculate link appears and works |
| AC5.2 (partial) | Error/partial toast variants depend on pipeline state | Trigger error scenario, verify correct toast color and message |

---

## Test File Summary

| File | Type | Covers |
|------|------|--------|
| `tests/unit/app-admin.test.ts` | Unit | AC1.1, AC1.4 |
| `tests/unit/scoring-pipeline-limit.test.ts` | Unit | AC3.1 |
| `tests/integration/app-admin-auth.test.ts` | Integration | AC1.2 |
| `tests/integration/scoring-access-control.test.ts` | Integration | AC1.3, AC1.4 |
| `tests/integration/match-sync.test.ts` | Integration | AC2.1, AC2.2, AC2.3 |
| `tests/integration/scoring-pipeline.test.ts` | Integration | AC3.1 (add to existing) |
| `tests/integration/sync-players.test.ts` | Integration | AC4.1, AC4.2, AC4.3, AC4.5 |
| `tests/integration/sync-players-api.test.ts` | Integration | AC4.4 |
| `tests/simulation/playwright/app-admin.spec.ts` | E2E | AC5.1, AC5.2, AC5.3, AC5.6, AC6.1, AC6.2 |
