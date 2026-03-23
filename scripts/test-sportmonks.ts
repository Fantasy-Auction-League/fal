import { config } from 'dotenv'
config({ path: '.env.local' })

import { SportMonksClient } from '../lib/sportmonks/client'
import { fetchSeasonFixtures, fetchScorecard, generateGameweeks } from '../lib/sportmonks/fixtures'
import { oversToDecimal, mapPositionToRole, getTeamByApiId } from '../lib/sportmonks/utils'

async function main() {
  let passed = 0
  let failed = 0

  function assert(label: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  PASS: ${label}`)
      passed++
    } else {
      console.log(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`)
      failed++
    }
  }

  // --- Unit tests (no API) ---
  console.log('\n=== oversToDecimal ===')
  const v1 = oversToDecimal(4.2)
  assert('4.2 → ~4.333', Math.abs(v1 - 4.333) < 0.01, `got ${v1}`)
  const v2 = oversToDecimal(2.0)
  assert('2.0 → 2.0', v2 === 2.0, `got ${v2}`)
  const v3 = oversToDecimal(3.5)
  assert('3.5 → ~3.833', Math.abs(v3 - 3.833) < 0.01, `got ${v3}`)

  console.log('\n=== mapPositionToRole ===')
  assert('batsman → BAT', mapPositionToRole('Batsman') === 'BAT')
  assert('bowler → BOWL', mapPositionToRole('Bowler') === 'BOWL')
  assert('allrounder → ALL', mapPositionToRole('Allrounder') === 'ALL')
  assert('wicketkeeper → WK', mapPositionToRole('Wicketkeeper') === 'WK')
  assert('unknown → ALL', mapPositionToRole('Coach') === 'ALL')

  console.log('\n=== getTeamByApiId ===')
  assert('MI = id 6', getTeamByApiId(6)?.code === 'MI')
  assert('unknown → undefined', getTeamByApiId(999) === undefined)

  // --- API tests ---
  const client = new SportMonksClient()

  console.log('\n=== fetchSeasonFixtures (IPL 2026, season 1795) ===')
  const fixtures = await fetchSeasonFixtures(1795, client)
  console.log(`  Fixture count: ${fixtures.length}`)
  assert('Has fixtures', fixtures.length > 0, `count=${fixtures.length}`)
  assert('Fixtures have starting_at', !!fixtures[0]?.starting_at)

  console.log('\n=== generateGameweeks ===')
  const gws = generateGameweeks(fixtures)
  console.log(`  Gameweek count: ${gws.length}`)
  assert('Has gameweeks', gws.length > 0)
  assert('GW1 starts on Monday', gws[0]?.startDate.getDay() === 1)

  console.log('\n=== fetchScorecard (fixture 65240 — IPL 2025) ===')
  const sc = await fetchScorecard(65240, false, client)
  console.log(`  Batting entries: ${sc.batting.length}`)
  console.log(`  Bowling entries: ${sc.bowling.length}`)
  console.log(`  Lineup entries: ${sc.lineup.length}`)
  console.log(`  Runs entries: ${sc.runs.length}`)
  assert('Has batting data', sc.batting.length > 0)
  assert('Has bowling data', sc.bowling.length > 0)
  assert('Has lineup data', sc.lineup.length > 0)
  assert('Has runs data', sc.runs.length > 0)
  assert('Fixture status present', !!sc.fixture.status)

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Test error:', e)
  process.exit(1)
})
