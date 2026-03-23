export interface FieldingStats {
  catches: number
  stumpings: number
  runoutsDirect: number
  runoutsAssisted: number
}

export function computeFieldingPoints(stats: FieldingStats): number {
  let pts = 0

  pts += stats.catches * 8                        // +8 per catch
  if (stats.catches >= 3) pts += 4                // one-time 3-catch bonus
  pts += stats.stumpings * 12                     // +12 per stumping
  pts += stats.runoutsDirect * 12                 // +12 per direct hit
  pts += stats.runoutsAssisted * 6                // +6 per assisted runout

  return pts
}
