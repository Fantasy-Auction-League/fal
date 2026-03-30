# Test Requirements: Lineup UI & Scoring Changes

## Automated Tests

| AC ID | Description | Test Type | Test File | Status |
|-------|-------------|-----------|-----------|--------|
| 1.1 | C/VC badge visible on edit lineup pitch view (22px) | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 1.2 | C/VC badge visible on read-only lineup pitch view (22px) | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 2.1 | Role labels (Top/Middle/Lower Order) removed from edit lineup | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 2.2 | "Playing XI" header visible on edit lineup pitch view | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 2.3 | Role labels removed from read-only lineup | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 2.4 | "Playing XI" header visible on read-only lineup | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 2.5 | Bench label still present on both screens | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 2.6 | Bench role labels (ALL/BOWL/BAT/WK above bench figures) removed on both screens | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 3.1 | Read-only lineup has gradient header with Average/Points/Highest | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 3.2 | GW navigation (prev/next) works in gradient header | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 3.3 | Highest score area is clickable and navigates to team lineup | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 3.4 | LIVE/FINAL status badge visible in header | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 3.5 | GW stats API returns { average, highest, highestTeamId } | integration | — | NOT COVERED |
| 3.6 | GW stats API requires authentication | integration | — | NOT COVERED |
| 4.1 | Edit lineup pitch view shows "vs XYZ" opponent labels | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 4.2 | Edit lineup list view shows "vs XYZ" opponent format | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 4.3 | Falls back to team code when no fixtures loaded | e2e | — | PARTIAL (implicit) |
| 4.4 | Opponent text color is readable (black/white matching jersey) | visual | — | COVERED (human) |
| 5.1 | Player popup shows "GW{N} Points Breakdown" section | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 5.2 | Breakdown shows match cards with "vs XYZ · date" header | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 5.3 | Formula rows show "rawValue × rate" pattern | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 5.4 | Breakdown updates when navigating to different GW | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 5.5 | Batting breakdown matches scoring rules (runs, 4s, 6s, milestones, SR) | unit | `lib/scoring/breakdown.ts` (verified against batting.ts) | PARTIAL |
| 5.6 | Bowling breakdown matches scoring rules (wickets, maidens, economy) | unit | `lib/scoring/breakdown.ts` (verified against bowling.ts) | PARTIAL |
| 5.7 | Fielding breakdown matches scoring rules (catches, stumpings) | unit | `lib/scoring/breakdown.ts` (verified against fielding.ts) | PARTIAL |
| 6.1 | IPL divider visible between T20 career row and season rows (edit lineup) | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 6.2 | IPL divider visible in players page full profile | e2e | `tests/simulation/playwright/lineup-ui-changes.spec.ts` | COVERED |
| 6.3 | IPL divider in both batting and bowling tables | e2e | — | PARTIAL (visual) |
| 7.1 | POWER_PLAY_BAT chip doubles WK player points | unit | `tests/unit/scoring-multipliers.test.ts` | COVERED |
| 7.2 | POWER_PLAY_BAT chip still doubles BAT player points | unit | `tests/unit/scoring-multipliers.test.ts` | COVERED |
| 7.3 | POWER_PLAY_BAT chip does not double BOWL player points | unit | `tests/unit/scoring-multipliers.test.ts` | COVERED |
| 7.4 | All existing scoring tests pass (no regressions) | unit | `tests/unit/scoring-multipliers.test.ts` | COVERED |

## Human Verification

| AC ID | Description | Why Not Automated | Verification Approach |
|-------|-------------|-------------------|----------------------|
| H1.1 | C/VC badge size is exactly 22px with white border and drop shadow on both screens | Pixel-level sizing requires visual inspection | Open edit lineup and read-only lineup side by side. Verify badges are same size (~22px circle), have white border, and subtle shadow |
| H1.2 | Badge positioning doesn't overlap player name or role badge | Layout interaction hard to assert programmatically | Inspect badges on both pitch and list views, verify no overlapping |
| H2.1 | "Playing XI" header has correct styling (uppercase, 11px, muted white) | CSS styling verification | Visually confirm the header styling matches spec on both screens |
| H3.1 | Gradient header matches dashboard visual style | Complex visual matching | Compare read-only lineup header side-by-side with dashboard hero |
| H3.2 | Score trio layout matches dashboard (Average left, Points center 36px, Highest right) | Layout proportions and typography | Verify center points are prominently larger, side scores are equal width |
| H3.3 | Glassmorphic "Read Only" pill styling | CSS blur/transparency effects | Verify translucent white background with border |
| H2.2 | Bench role labels (ALL/BOWL/BAT/WK) no longer appear above bench player figures | Visual inspection of bench area | Open edit lineup and read-only lineup, verify no standalone role text above bench figures |
| H4.1 | Opponent text color is readable (black on light jerseys, white on dark) | Color contrast on varied backgrounds | Check "vs GT" text on players with different jersey colors, verify readability |
| H4.2 | Players with 2 GW matches show two "vs" lines, players with 1 show one | Data-dependent layout | Find players with 2 matches in the GW, verify two opponent lines |
| H5.1 | Match card color coding: green >30pts, amber 15-30pts, red <15pts | Color thresholds | Click players with different scores, verify correct color on match total |
| H5.2 | Formula pattern: "52 × 1pt" for multiplied stats, "✓ 50+ runs" for bonuses | Text formatting | Click a player with runs, verify formula formatting |
| H5.3 | Full Profile button still accessible below the breakdown | Scroll and layout | Verify scrolling past breakdown reveals Full Profile button |
| H6.1 | "IPL" text is blue (#004BA0), 9px, bold with horizontal line extending right | Typography and layout | Open full profile, verify IPL divider styling matches spec |
| H6.2 | IPL divider appears in both batting and bowling sections | Visual confirmation across tables | Scroll through full profile, verify divider in both tables |
