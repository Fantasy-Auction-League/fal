/**
 * Comprehensive scoring engine tests
 * Run: npx tsx scripts/test-scoring.ts
 */

import { computeBattingPoints, BattingStats } from '../lib/scoring/batting'
import { computeBowlingPoints, BowlingStats } from '../lib/scoring/bowling'
import { computeFieldingPoints, FieldingStats } from '../lib/scoring/fielding'
import {
  applyBenchSubs,
  resolveMultipliers,
  applyChipEffects,
  LineupSlot,
} from '../lib/scoring/multipliers'

let passed = 0
let failed = 0

function assert(name: string, actual: number, expected: number) {
  if (actual === expected) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${name} — expected ${expected}, got ${actual}`)
  }
}

function assertSet(name: string, actual: Set<string>, expected: Set<string>) {
  const same = actual.size === expected.size && [...actual].every(v => expected.has(v))
  if (same) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${name} — expected {${[...expected].join(',')}} got {${[...actual].join(',')}}`)
  }
}

function assertMap(name: string, actual: Map<string, number>, expected: Map<string, number>) {
  const same = actual.size === expected.size && [...actual].every(([k, v]) => expected.get(k) === v)
  if (same) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${name} — maps differ`)
  }
}

// ============================================================
// BATTING TESTS
// ============================================================

// Removed initial draft tests — clean tests below

// ============================================================
// BATTING — clean tests
// ============================================================

passed = 0
failed = 0

// Pure runs, no boundaries, no milestones, no SR effect
assert('BAT-01: 5 runs off 5 balls (no bonus)',
  computeBattingPoints({ runs: 5, balls: 5, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  5 // just runs, <10 balls so no SR calc
)

// Fours bonus
assert('BAT-02: 8 runs, 2 fours, 4 balls',
  computeBattingPoints({ runs: 8, balls: 4, fours: 2, sixes: 0, wicketId: null }, 'BAT'),
  8 + 8 // 8 runs + 2*4 fours, <10 balls no SR
)

// Sixes bonus
assert('BAT-03: 18 runs, 3 sixes, 5 balls',
  computeBattingPoints({ runs: 18, balls: 5, fours: 0, sixes: 3, wicketId: null }, 'BAT'),
  18 + 18 // 18 runs + 3*6, <10 balls no SR
)

// 25 milestone
assert('BAT-04: 25 runs, no boundaries, 20 balls',
  computeBattingPoints({ runs: 25, balls: 20, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  29 // 25 runs + 4 (25 milestone) + SR=125 → 0
)

// 50 milestone (stacks with 25)
assert('BAT-05: 50 runs, 30 balls, no boundaries',
  computeBattingPoints({ runs: 50, balls: 30, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  66 // 50 runs + 8 (50 milestone) + 4 (25 milestone) + 4 (SR=166.7 → >150 → +4)
)

// 75 milestone (stacks with 50 and 25)
assert('BAT-06: 75 runs, 50 balls',
  computeBattingPoints({ runs: 75, balls: 50, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  101 // 75 runs + 12+8+4 (milestones stack) + 2 (SR=150 → >=130 → +2)
)

// 100 milestone (REPLACES all lower)
assert('BAT-07: 100 runs, 60 balls',
  computeBattingPoints({ runs: 100, balls: 60, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  120 // 100 runs + 16 (century only) + 4 (SR=166.7 → >150 → +4)
)

// Duck: 0 runs, dismissed (wicketId = 1 = caught), BAT role → -2
assert('BAT-08: duck (BAT, dismissed)',
  computeBattingPoints({ runs: 0, balls: 3, fours: 0, sixes: 0, wicketId: 1 }, 'BAT'),
  -2 // 0 runs + duck penalty, <10 balls no SR
)

// Duck: 0 runs, not out (wicketId = null) → no penalty
assert('BAT-09: 0 runs not out',
  computeBattingPoints({ runs: 0, balls: 3, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  0
)

// Duck: 0 runs, bowler role → exempt
assert('BAT-10: duck bowler exempt',
  computeBattingPoints({ runs: 0, balls: 3, fours: 0, sixes: 0, wicketId: 1 }, 'BOWL'),
  0
)

// Duck: 0 runs, retired out (wicketId=138) → exempt
assert('BAT-11: duck retired out exempt',
  computeBattingPoints({ runs: 0, balls: 3, fours: 0, sixes: 0, wicketId: 138 }, 'BAT'),
  0
)

// Duck: 0 runs, not out (wicketId=84) → exempt
assert('BAT-12: duck not-out wicketId exempt',
  computeBattingPoints({ runs: 0, balls: 3, fours: 0, sixes: 0, wicketId: 84 }, 'BAT'),
  0
)

// SR > 170 → +6
assert('BAT-13: SR > 170',
  computeBattingPoints({ runs: 18, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  18 + 6 // SR = 180 → +6
)

// SR > 150 → +4
assert('BAT-14: SR 160 (>150, <=170)',
  computeBattingPoints({ runs: 16, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  16 + 4 // SR = 160 → +4
)

// SR >= 130 → +2
assert('BAT-15: SR 130 (>=130)',
  computeBattingPoints({ runs: 13, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  13 + 2 // SR = 130 → +2
)

// SR 100 → no bonus/penalty (between 70 and 130 exclusive on penalty side)
assert('BAT-16: SR 100 (neutral zone)',
  computeBattingPoints({ runs: 10, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  10 // SR = 100 → 0
)

// SR 70 → -2 (>=60 && <=70)
assert('BAT-17: SR 70',
  computeBattingPoints({ runs: 7, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  7 - 2 // SR = 70 → -2
)

// SR 50 → -4 (>=50 && <60)
assert('BAT-18: SR 50',
  computeBattingPoints({ runs: 5, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  5 - 4 // SR = 50 → -4
)

// SR < 50 → -6
assert('BAT-19: SR 40 (<50)',
  computeBattingPoints({ runs: 4, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  4 - 6 // SR = 40 → -6
)

// SR exemption for bowlers
assert('BAT-20: bowler SR exempt (SR 40, BOWL role)',
  computeBattingPoints({ runs: 4, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BOWL'),
  4 // no SR penalty for bowlers
)

// SR with <10 balls → no SR calc
assert('BAT-21: <10 balls no SR calc',
  computeBattingPoints({ runs: 2, balls: 9, fours: 0, sixes: 0, wicketId: null }, 'BAT'),
  2 // only runs
)

// ============================================================
// BOWLING TESTS
// ============================================================

// Basic wickets
assert('BOWL-01: 2 wickets, 4 overs, 0 maidens, 30 runs, 10 dots, 0 lbw',
  computeBowlingPoints({ wickets: 2, overs: 4, maidens: 0, runsConceded: 30, dotBalls: 10, lbwBowledCount: 0 }),
  70 // 2*30 wickets + 10 dots + ER=7.5 → neutral
)

// Maidens
assert('BOWL-02: 1 maiden',
  computeBowlingPoints({ wickets: 0, overs: 2, maidens: 1, runsConceded: 6, dotBalls: 6, lbwBowledCount: 0 }),
  24 // 12 (maiden) + 6 (dots) + 6 (ER=3 → <5 → +6)
)

// LBW/Bowled bonus
assert('BOWL-03: 1 wicket with 1 LBW',
  computeBowlingPoints({ wickets: 1, overs: 2, maidens: 0, runsConceded: 10, dotBalls: 4, lbwBowledCount: 1 }),
  30 + 4 + 8 + 4 // wicket + dots + lbw + ER=10/2=5 → <6 → +4. Total = 46
)

// 3 wicket bonus (+4, non-stacking)
assert('BOWL-04: 3 wickets',
  computeBowlingPoints({ wickets: 3, overs: 4, maidens: 0, runsConceded: 25, dotBalls: 8, lbwBowledCount: 0 }),
  90 + 8 + 4 + 2 // 3*30 + dots + 3w bonus + ER=25/4=6.25 → <=7 → +2. Total = 104
)

// 4 wicket bonus (+8, replaces 3w)
assert('BOWL-05: 4 wickets',
  computeBowlingPoints({ wickets: 4, overs: 4, maidens: 0, runsConceded: 25, dotBalls: 8, lbwBowledCount: 0 }),
  120 + 8 + 8 + 2 // 4*30 + dots + 4w bonus + ER=6.25 → +2. Total = 138
)

// 5 wicket bonus (+12, replaces 4w and 3w)
assert('BOWL-06: 5 wickets',
  computeBowlingPoints({ wickets: 5, overs: 4, maidens: 0, runsConceded: 25, dotBalls: 8, lbwBowledCount: 0 }),
  150 + 8 + 12 + 2 // 5*30 + dots + 5w bonus + ER=6.25 → +2. Total = 172
)

// Economy rate tiers
// ER < 5 → +6
assert('BOWL-07: ER < 5',
  computeBowlingPoints({ wickets: 0, overs: 4, maidens: 0, runsConceded: 16, dotBalls: 0, lbwBowledCount: 0 }),
  0 + 0 + 6 // ER=16/4=4 → +6
)

// ER < 6 → +4
assert('BOWL-08: ER 5.5',
  computeBowlingPoints({ wickets: 0, overs: 4, maidens: 0, runsConceded: 22, dotBalls: 0, lbwBowledCount: 0 }),
  0 + 0 + 4 // ER=22/4=5.5 → +4
)

// ER <= 7 → +2
assert('BOWL-09: ER 7',
  computeBowlingPoints({ wickets: 0, overs: 4, maidens: 0, runsConceded: 28, dotBalls: 0, lbwBowledCount: 0 }),
  0 + 0 + 2 // ER=28/4=7 → +2
)

// ER 8 → neutral
assert('BOWL-10: ER 8 (neutral)',
  computeBowlingPoints({ wickets: 0, overs: 4, maidens: 0, runsConceded: 32, dotBalls: 0, lbwBowledCount: 0 }),
  0 // ER=8 → 0
)

// ER 10 → -2
assert('BOWL-11: ER 10',
  computeBowlingPoints({ wickets: 0, overs: 4, maidens: 0, runsConceded: 40, dotBalls: 0, lbwBowledCount: 0 }),
  -2 // ER=10 → -2
)

// ER 11.5 → -4
assert('BOWL-12: ER 11.5',
  computeBowlingPoints({ wickets: 0, overs: 4, maidens: 0, runsConceded: 46, dotBalls: 0, lbwBowledCount: 0 }),
  -4 // ER=46/4=11.5 → -4
)

// ER > 12 → -6
assert('BOWL-13: ER 13',
  computeBowlingPoints({ wickets: 0, overs: 4, maidens: 0, runsConceded: 52, dotBalls: 0, lbwBowledCount: 0 }),
  -6 // ER=52/4=13 → -6
)

// Cricket notation overs conversion: 4.2 = 4 overs 2 balls = 4.333 decimal
assert('BOWL-14: overs 4.2 cricket notation ER calc',
  computeBowlingPoints({ wickets: 0, overs: 4.2, maidens: 0, runsConceded: 20, dotBalls: 0, lbwBowledCount: 0 }),
  // oversToDecimal(4.2) = 4 + 2/6 = 4.333..., ER = 20/4.333 = 4.615 → <5 → +6
  6
)

// Min 2 overs for ER calc
assert('BOWL-15: <2 overs no ER calc',
  computeBowlingPoints({ wickets: 0, overs: 1, maidens: 0, runsConceded: 20, dotBalls: 0, lbwBowledCount: 0 }),
  0 // <2 overs → no ER penalty even though ER=20
)

// ============================================================
// FIELDING TESTS
// ============================================================

assert('FIELD-01: 1 catch',
  computeFieldingPoints({ catches: 1, stumpings: 0, runoutsDirect: 0, runoutsAssisted: 0 }),
  8
)

assert('FIELD-02: 2 catches (no 3-catch bonus)',
  computeFieldingPoints({ catches: 2, stumpings: 0, runoutsDirect: 0, runoutsAssisted: 0 }),
  16
)

assert('FIELD-03: 3 catches (with bonus)',
  computeFieldingPoints({ catches: 3, stumpings: 0, runoutsDirect: 0, runoutsAssisted: 0 }),
  24 + 4 // 3*8 + 3-catch bonus
)

assert('FIELD-04: 1 stumping',
  computeFieldingPoints({ catches: 0, stumpings: 1, runoutsDirect: 0, runoutsAssisted: 0 }),
  12
)

assert('FIELD-05: 1 direct runout',
  computeFieldingPoints({ catches: 0, stumpings: 0, runoutsDirect: 1, runoutsAssisted: 0 }),
  12
)

assert('FIELD-06: 1 assisted runout',
  computeFieldingPoints({ catches: 0, stumpings: 0, runoutsDirect: 0, runoutsAssisted: 1 }),
  6
)

assert('FIELD-07: mixed fielding',
  computeFieldingPoints({ catches: 3, stumpings: 1, runoutsDirect: 1, runoutsAssisted: 1 }),
  24 + 4 + 12 + 12 + 6 // 3 catches + bonus + stumping + direct + assisted
)

// ============================================================
// MULTIPLIERS: Captain/VC
// ============================================================

const baseLineup: LineupSlot[] = [
  { playerId: 'p1', slotType: 'XI', benchPriority: null, role: 'CAPTAIN' },
  { playerId: 'p2', slotType: 'XI', benchPriority: null, role: 'VC' },
  { playerId: 'p3', slotType: 'XI', benchPriority: null, role: null },
]

// Captain played → 2x captain, no VC bonus
const mult1 = resolveMultipliers(baseLineup, new Set(['p1', 'p2', 'p3']))
assertMap('MULT-01: captain played', mult1, new Map([['p1', 2]]))

// Captain absent, VC played → VC gets 2x
const mult2 = resolveMultipliers(baseLineup, new Set(['p2', 'p3']))
assertMap('MULT-02: captain absent VC promoted', mult2, new Map([['p2', 2]]))

// Both absent → empty
const mult3 = resolveMultipliers(baseLineup, new Set(['p3']))
assertMap('MULT-03: both absent', mult3, new Map())

// ============================================================
// BENCH SUBS
// ============================================================

const subLineup: LineupSlot[] = [
  { playerId: 'x1', slotType: 'XI', benchPriority: null, role: 'CAPTAIN' },
  { playerId: 'x2', slotType: 'XI', benchPriority: null, role: 'VC' },
  { playerId: 'x3', slotType: 'XI', benchPriority: null, role: null },
  { playerId: 'b1', slotType: 'BENCH', benchPriority: 1, role: null },
  { playerId: 'b2', slotType: 'BENCH', benchPriority: 2, role: null },
]

// All XI played → no subs
const res1 = applyBenchSubs(subLineup, new Set(['x1', 'x2', 'x3', 'b1', 'b2']))
assert('SUB-01: no subs needed', res1.subs.length, 0)
assertSet('SUB-01b: scoringXI', res1.scoringXI, new Set(['x1', 'x2', 'x3']))

// x3 absent, b1 available → b1 subs in
const res2 = applyBenchSubs(subLineup, new Set(['x1', 'x2', 'b1', 'b2']))
assert('SUB-02: one sub', res2.subs.length, 1)
assertSet('SUB-02b: scoringXI', res2.scoringXI, new Set(['x1', 'x2', 'b1']))

// x2 and x3 absent, b1 and b2 available → priority order
const res3 = applyBenchSubs(subLineup, new Set(['x1', 'b1', 'b2']))
assert('SUB-03: two subs', res3.subs.length, 2)
assertSet('SUB-03b: scoringXI', res3.scoringXI, new Set(['x1', 'b1', 'b2']))

// x3 absent, b1 also absent, b2 available → b2 subs in
const res4 = applyBenchSubs(subLineup, new Set(['x1', 'x2', 'b2']))
assert('SUB-04: skip absent bench', res4.subs.length, 1)
assertSet('SUB-04b: scoringXI', res4.scoringXI, new Set(['x1', 'x2', 'b2']))

// All absent, no bench available → no subs, but scoringXI still has XI players
const res5 = applyBenchSubs(subLineup, new Set([]))
assert('SUB-05: all absent no subs', res5.subs.length, 0)
assertSet('SUB-05b: scoringXI unchanged', res5.scoringXI, new Set(['x1', 'x2', 'x3']))

// ============================================================
// CHIP EFFECTS
// ============================================================

const chipXI = new Set(['p1', 'p2', 'p3', 'p4'])
const chipPoints = new Map<string, number>([
  ['p1', 50], // BAT
  ['p2', 30], // BOWL
  ['p3', 40], // ALL
  ['p4', 20], // WK
])
const chipRoles = new Map<string, string>([
  ['p1', 'BAT'],
  ['p2', 'BOWL'],
  ['p3', 'ALL'],
  ['p4', 'WK'],
])

// No chip → sum of all
assert('CHIP-01: no chip',
  applyChipEffects(null, chipXI, chipPoints, chipRoles),
  140 // 50+30+40+20
)

// POWER_PLAY_BAT → BAT players doubled
assert('CHIP-02: POWER_PLAY_BAT',
  applyChipEffects('POWER_PLAY_BAT', chipXI, chipPoints, chipRoles),
  140 + 50 // base + p1 BAT doubled
)

// BOWLING_BOOST → BOWL players doubled
assert('CHIP-03: BOWLING_BOOST',
  applyChipEffects('BOWLING_BOOST', chipXI, chipPoints, chipRoles),
  140 + 30 // base + p2 BOWL doubled
)

// Captain 2x + chip 2x interaction test
// If captain (p1, BAT) has 50 base points, with 2x multiplier = 100 points in gwPoints
// Then POWER_PLAY_BAT doubles the BAT player's gwPoints again → 100 added
const captainChipPoints = new Map<string, number>([
  ['p1', 100], // captain BAT already 2x
  ['p2', 30],  // BOWL
])
const captainChipRoles = new Map<string, string>([
  ['p1', 'BAT'],
  ['p2', 'BOWL'],
])
const captainChipXI = new Set(['p1', 'p2'])

assert('CHIP-04: captain 2x + POWER_PLAY_BAT = 4x effective',
  applyChipEffects('POWER_PLAY_BAT', captainChipXI, captainChipPoints, captainChipRoles),
  130 + 100 // base (100+30) + BAT doubled (100)
)

// ============================================================
// SUMMARY
// ============================================================

console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`)
console.log(`${'='.repeat(50)}`)

if (failed > 0) {
  process.exit(1)
}
