/**
 * Client-side scoring breakdown utility for the player popup.
 *
 * These formulas mirror the server-side scoring in batting.ts, bowling.ts,
 * and fielding.ts. Where the performance data lacks a field (e.g. dotBalls,
 * lbwBowledCount, runouts, wicketId) the points will appear in a catch-all
 * "remainder" line calculated by the caller.
 */

import { oversToDecimal } from '../sportmonks/utils'

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

  // Milestone bonuses (highest only — do NOT stack)
  if (runs >= 100) {
    lines.push({ category: '100 Bonus', rawValue: '✓', formula: '100+ runs', points: 16 })
  } else if (runs >= 75) {
    lines.push({ category: '75 Bonus', rawValue: '✓', formula: '75+ runs', points: 12 })
  } else if (runs >= 50) {
    lines.push({ category: '50 Bonus', rawValue: '✓', formula: '50+ runs', points: 8 })
  } else if (runs >= 25) {
    lines.push({ category: '25 Bonus', rawValue: '✓', formula: '25+ runs', points: 4 })
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

  // Duck penalty: we can't check wicketId from performance data, so we skip
  // the duck line here. It will be captured in the remainder if applicable.

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

  // Wicket milestone bonuses (don't stack — highest only)
  if (wickets >= 5) {
    lines.push({ category: '5W Bonus', rawValue: '✓', formula: '5+ wkts', points: 12 })
  } else if (wickets >= 4) {
    lines.push({ category: '4W Bonus', rawValue: '✓', formula: '4+ wkts', points: 8 })
  } else if (wickets >= 3) {
    lines.push({ category: '3W Bonus', rawValue: '✓', formula: '3+ wkts', points: 4 })
  }

  // Economy rate (min 2 overs, uses cricket notation conversion)
  const decimalOvers = oversToDecimal(overs)
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

  // Note: dotBalls (× 1pt) and lbwBowledCount (× 8pts) are not available
  // in performance data — they will appear in the remainder line.

  return lines
}

export function computeFieldingBreakdown(stats: {
  catches: number
  stumpings: number
}): ScoringLine[] {
  const lines: ScoringLine[] = []

  if (stats.catches > 0) {
    lines.push({ category: 'Catches', rawValue: `${stats.catches}`, formula: '× 8pts', points: stats.catches * 8 })
    if (stats.catches >= 3) {
      lines.push({ category: '3-Catch Bonus', rawValue: '✓', formula: '3+ catches', points: 4 })
    }
  }
  if (stats.stumpings > 0) {
    lines.push({ category: 'Stumpings', rawValue: `${stats.stumpings}`, formula: '× 12pts', points: stats.stumpings * 12 })
  }

  // Note: runoutsDirect (× 12pts) and runoutsAssisted (× 6pts) are not
  // available in performance data — they will appear in the remainder line.

  return lines
}
