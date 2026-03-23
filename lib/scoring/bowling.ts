import { oversToDecimal } from '../sportmonks/utils'

export interface BowlingStats {
  wickets: number
  overs: number // CRICKET NOTATION (4.2 = 4o 2b)
  maidens: number
  runsConceded: number
  dotBalls: number
  lbwBowledCount: number // derived from batting data: count where wicket_id IN (79,83) AND bowling_player_id = this bowler
}

export function computeBowlingPoints(stats: BowlingStats): number {
  let pts = 0

  pts += stats.wickets * 30     // +30 per wicket (excl. runout, incl. stumpings)
  pts += stats.maidens * 12     // +12 per maiden
  pts += stats.dotBalls * 1     // +1 per dot ball
  pts += stats.lbwBowledCount * 8 // +8 per LBW/Bowled dismissal (Hit Wicket excluded per PRD)

  // Wicket bonuses (do NOT stack — 5w gets +12 only)
  if (stats.wickets >= 5) pts += 12
  else if (stats.wickets >= 4) pts += 8
  else if (stats.wickets >= 3) pts += 4

  // Economy Rate bonus/penalty (min 2 overs, use oversToDecimal)
  const decimalOvers = oversToDecimal(stats.overs)
  if (decimalOvers >= 2) {
    const er = stats.runsConceded / decimalOvers
    if (er < 5) pts += 6
    else if (er < 6) pts += 4
    else if (er <= 7) pts += 2
    else if (er >= 10 && er <= 11) pts -= 2
    else if (er > 11 && er <= 12) pts -= 4
    else if (er > 12) pts -= 6
  }

  return pts
}
