// CRITICAL: SportMonks overs are in cricket notation
// 4.2 = 4 overs 2 balls = 26 balls, NOT 4.2 decimal
export function oversToDecimal(overs: number): number {
  const full = Math.floor(overs)
  const balls = Math.round((overs - full) * 10)
  return full + balls / 6
}

// Map SportMonks position name to our PlayerRole enum
export function mapPositionToRole(
  positionName: string
): 'BAT' | 'BOWL' | 'ALL' | 'WK' {
  switch (positionName?.toLowerCase()) {
    case 'batsman':
      return 'BAT'
    case 'bowler':
      return 'BOWL'
    case 'allrounder':
      return 'ALL'
    case 'wicketkeeper':
      return 'WK'
    case 'middle order batter':
      return 'BAT'
    case 'opening batter':
      return 'BAT'
    default:
      return 'ALL'
  }
}

// IPL team metadata
export const IPL_TEAMS = [
  { id: 6, name: 'Mumbai Indians', code: 'MI' },
  { id: 2, name: 'Chennai Super Kings', code: 'CSK' },
  { id: 5, name: 'Kolkata Knight Riders', code: 'KKR' },
  { id: 7, name: 'Rajasthan Royals', code: 'RR' },
  { id: 8, name: 'Royal Challengers Bengaluru', code: 'RCB' },
  { id: 4, name: 'Punjab Kings', code: 'PBKS' },
  { id: 1976, name: 'Gujarat Titans', code: 'GT' },
  { id: 9, name: 'Sunrisers Hyderabad', code: 'SRH' },
  { id: 3, name: 'Delhi Capitals', code: 'DC' },
  { id: 1979, name: 'Lucknow Super Giants', code: 'LSG' },
] as const

export function getTeamByApiId(apiId: number) {
  return IPL_TEAMS.find((t) => t.id === apiId)
}
