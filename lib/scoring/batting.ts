import { oversToDecimal } from '../sportmonks/utils'

// Duck-exempt dismissal types
const DUCK_EXEMPT_WICKET_IDS = [84, 138] // 84=Not Out, 138=Retired Out

export interface BattingStats {
  runs: number
  balls: number
  fours: number
  sixes: number
  wicketId: number | null // dismissal type
}

export function computeBattingPoints(stats: BattingStats, role: string): number {
  let pts = 0

  pts += stats.runs * 1     // +1 per run
  pts += stats.fours * 4    // +4 per four
  pts += stats.sixes * 6    // +6 per six

  // Milestone bonuses (highest only — do NOT stack)
  if (stats.runs >= 100) pts += 16
  else if (stats.runs >= 75) pts += 12
  else if (stats.runs >= 50) pts += 8
  else if (stats.runs >= 25) pts += 4

  // Duck: -2 if scored 0, faced >= 1 ball, dismissed, role != BOWL
  if (stats.runs === 0 && stats.balls >= 1 &&
      stats.wicketId !== null &&
      !DUCK_EXEMPT_WICKET_IDS.includes(stats.wicketId) &&
      role !== 'BOWL') {
    pts -= 2
  }

  // Strike Rate bonus/penalty (min 10 balls, bowlers exempt)
  if (stats.balls >= 10 && role !== 'BOWL') {
    const sr = (stats.runs / stats.balls) * 100
    if (sr > 170) pts += 6
    else if (sr > 150) pts += 4
    else if (sr >= 130) pts += 2
    else if (sr >= 60 && sr <= 70) pts -= 2
    else if (sr >= 50 && sr < 60) pts -= 4
    else if (sr < 50) pts -= 6
  }

  return pts
}
