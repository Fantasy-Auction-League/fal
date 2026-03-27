import { PrismaClient } from '@prisma/client'

/**
 * Live mid-gameweek score computation with both pure functions and orchestration.
 *
 * Pure functions (aggregateBasePoints, computeLivePlayerScores) contain deterministic
 * scoring logic and can be unit-tested without database dependencies.
 *
 * Orchestrator (computeLiveTeamScore) handles database fetches and calls pure functions.
 * PrismaClient is needed only by the orchestrator, not by the pure scoring functions.
 */

// ─── aggregateBasePoints ───────────────────────────────────────────

export interface PerformanceData {
  playerId: string
  fantasyPoints: number
}

/**
 * Aggregate base fantasy points per player across all performances.
 * Pure function - no side effects.
 */
export function aggregateBasePoints(
  performances: PerformanceData[]
): Map<string, number> {
  const basePointsMap = new Map<string, number>()

  for (const perf of performances) {
    const current = basePointsMap.get(perf.playerId) || 0
    basePointsMap.set(perf.playerId, current + perf.fantasyPoints)
  }

  return basePointsMap
}

// ─── computeLivePlayerScores ───────────────────────────────────────

export interface LiveScoreSlot {
  playerId: string
  slotType: 'XI' | 'BENCH'
  role: string
  isCaptain?: boolean
  isVC?: boolean
}

export interface PlayerScoreResult {
  playerId: string
  basePoints: number
  multipliedPoints: number
  chipBonus: number
  isCaptain: boolean
  isVC: boolean
  slotType: 'XI' | 'BENCH'
  matchesPlayed: number
}

export interface ComputeLiveScoresParams {
  slots: LiveScoreSlot[]
  basePointsMap: Map<string, number>
  chipType: 'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null
  matchesPlayedMap: Map<string, number>
}

/**
 * Compute live player scores with captain multiplier and chip bonuses.
 * Pure function - deterministic scoring rules.
 *
 * Live-specific rules (different from final aggregation):
 * - Captain gets 2x if they have any points > 0 (has played)
 * - VC does NOT get promoted (settlement-only) — stays at 1x
 * - Chip bonus = qualifying player's multipliedPoints (after captain) added again
 *   - POWER_PLAY_BAT: players with role 'BAT' in XI
 *   - BOWLING_BOOST: players with role 'BOWL' in XI
 * - Bench players: included in response but NOT in totalPoints
 */
export function computeLivePlayerScores(
  params: ComputeLiveScoresParams
): PlayerScoreResult[] {
  const { slots, basePointsMap, chipType, matchesPlayedMap } = params

  const results: PlayerScoreResult[] = []

  for (const slot of slots) {
    const basePoints = basePointsMap.get(slot.playerId) ?? 0
    const isCaptain = slot.isCaptain ?? false
    const isVC = slot.isVC ?? false

    // Apply captain multiplier (2x if captain has played, else stay at 1x)
    let multipliedPoints = basePoints
    if (isCaptain && basePoints > 0) {
      multipliedPoints = basePoints * 2
    }

    // Compute chip bonus
    // Chip bonus = add the multipliedPoints again for qualifying players
    let chipBonus = 0
    if (chipType !== null && slot.slotType === 'XI') {
      if (chipType === 'POWER_PLAY_BAT' && slot.role === 'BAT') {
        chipBonus = multipliedPoints
      } else if (chipType === 'BOWLING_BOOST' && slot.role === 'BOWL') {
        chipBonus = multipliedPoints
      }
    }

    results.push({
      playerId: slot.playerId,
      basePoints,
      multipliedPoints,
      chipBonus,
      isCaptain,
      isVC,
      slotType: slot.slotType,
      matchesPlayed: matchesPlayedMap.get(slot.playerId) ?? 0,
    })
  }

  return results
}

// ─── computeLiveTeamScore ───────────────────────────────────────────

export interface LiveTeamScoreResponse {
  gameweekId: string
  gameweekNumber: number
  status: 'LIVE'
  matchesScored: number
  matchesTotal: number
  totalPoints: number
  chipActive: string | null
  chipBonusPoints: number
  players: PlayerScoreResult[]
}

/**
 * Orchestrates live team score computation with database fetches.
 * Assembles all needed data and calls computeLivePlayerScores.
 */
export async function computeLiveTeamScore(
  prisma: PrismaClient,
  teamId: string,
  gameweekId: string
): Promise<LiveTeamScoreResponse> {
  // Fetch lineup with slots and player data
  const lineup = await prisma.lineup.findFirst({
    where: { teamId, gameweekId },
    include: {
      slots: {
        include: {
          player: {
            select: {
              id: true,
              role: true,
              iplTeamCode: true,
            },
          },
        },
      },
    },
  })

  if (!lineup || lineup.slots.length === 0) {
    throw new Error(`No lineup found for team ${teamId}, gameweek ${gameweekId}`)
  }

  // Fetch all matches for the gameweek
  const allMatches = await prisma.match.findMany({
    where: { gameweekId },
    select: { id: true, scoringStatus: true },
  })

  const scoredMatches = allMatches.filter((m) => m.scoringStatus === 'SCORED')
  const matchesScored = scoredMatches.length
  const matchesTotal = allMatches.length

  // Fetch performances for scored matches only
  const performances = await prisma.playerPerformance.findMany({
    where: { matchId: { in: scoredMatches.map((m) => m.id) } },
    select: { playerId: true, fantasyPoints: true, matchId: true },
  })

  // Fetch active chip
  const chipUsage = await prisma.chipUsage.findFirst({
    where: { teamId, gameweekId, status: 'PENDING' },
  })

  // Fetch gameweek number
  const gameweek = await prisma.gameweek.findUnique({
    where: { id: gameweekId },
    select: { number: true },
  })

  if (!gameweek) {
    throw new Error(`Gameweek ${gameweekId} not found`)
  }

  // Aggregate base points
  const basePointsMap = aggregateBasePoints(performances)

  // Build matchesPlayedMap: count distinct matches per player
  // Single pass using Map<playerId, Set<matchId>> to avoid O(N*M) filtering
  const matchesPlayedMapTemp = new Map<string, Set<string>>()
  for (const perf of performances) {
    if (!matchesPlayedMapTemp.has(perf.playerId)) {
      matchesPlayedMapTemp.set(perf.playerId, new Set())
    }
    matchesPlayedMapTemp.get(perf.playerId)!.add(perf.matchId)
  }
  const matchesPlayedMap = new Map<string, number>()
  for (const [playerId, matchIds] of matchesPlayedMapTemp) {
    matchesPlayedMap.set(playerId, matchIds.size)
  }

  // Build slots with role information
  const slots: LiveScoreSlot[] = lineup.slots.map((slot) => ({
    playerId: slot.playerId,
    slotType: slot.slotType as 'XI' | 'BENCH',
    role: slot.player?.role ?? 'ALL',
    isCaptain: slot.role === 'CAPTAIN',
    isVC: slot.role === 'VC',
  }))

  // Compute live scores
  const playerScores = computeLivePlayerScores({
    slots,
    basePointsMap,
    chipType: (chipUsage?.chipType as 'POWER_PLAY_BAT' | 'BOWLING_BOOST') || null,
    matchesPlayedMap,
  })

  // Calculate totals (XI only for totalPoints)
  const xiScores = playerScores.filter((p) => p.slotType === 'XI')
  const totalPoints = xiScores.reduce((sum, p) => sum + p.multipliedPoints + p.chipBonus, 0)
  const chipBonusPoints = playerScores.reduce((sum, p) => sum + p.chipBonus, 0)

  return {
    gameweekId,
    gameweekNumber: gameweek.number,
    status: 'LIVE',
    matchesScored,
    matchesTotal,
    totalPoints,
    chipActive: chipUsage?.chipType ?? null,
    chipBonusPoints,
    players: playerScores,
  }
}

// ─── computeLeagueLiveScores ────────────────────────────────────────

export interface LeagueLiveScoreResult {
  teamScores: Map<
    string,
    {
      liveGwPoints: number
      chipType: 'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null
    }
  >
  matchesScored: number
  matchesTotal: number
}

/**
 * Computes live GW scores for ALL teams in a league with batch queries.
 * Uses 3 queries total (lineups, performances, chips) instead of N+1.
 *
 * Query 1: Fetch all lineups for the league's teams in this gameweek
 * Query 2: Fetch all player performances for scored matches
 * Query 3: Fetch all chip usages for these teams
 *
 * Then computes scores in-memory using pure functions (aggregateBasePoints,
 * computeLivePlayerScores) to avoid logic drift between single-team and
 * batch paths.
 */
export async function computeLeagueLiveScores(
  prisma: PrismaClient,
  gameweekId: string,
  leagueId: string
): Promise<LeagueLiveScoreResult> {
  // Query 1: Fetch all lineups for the league's teams in this gameweek
  const lineups = await prisma.lineup.findMany({
    where: {
      gameweekId,
      team: { leagueId },
    },
    include: {
      slots: {
        include: {
          player: {
            select: {
              id: true,
              role: true,
            },
          },
        },
      },
      team: {
        select: {
          id: true,
        },
      },
    },
  })

  // Query 2: Fetch all matches and determine which are scored
  const allMatches = await prisma.match.findMany({
    where: { gameweekId },
    select: { id: true, scoringStatus: true },
  })

  const scoredMatches = allMatches.filter((m) => m.scoringStatus === 'SCORED')
  const matchesScored = scoredMatches.length
  const matchesTotal = allMatches.length

  // Fetch all performances for scored matches in this gameweek
  const performances = await prisma.playerPerformance.findMany({
    where: { matchId: { in: scoredMatches.map((m) => m.id) } },
    select: { playerId: true, fantasyPoints: true, matchId: true },
  })

  // Query 3: Fetch all chip usages for teams in this league in this gameweek
  const teamIds = lineups.map((l) => l.team.id)
  const chipUsages = await prisma.chipUsage.findMany({
    where: { teamId: { in: teamIds }, gameweekId, status: 'PENDING' },
  })

  // Build a map: teamId -> chipType for quick lookup
  const chipByTeam = new Map<string, 'POWER_PLAY_BAT' | 'BOWLING_BOOST'>(
    chipUsages.map((c) => [c.teamId, c.chipType as 'POWER_PLAY_BAT' | 'BOWLING_BOOST'])
  )

  // Build global basePointsMap from all performances
  const basePointsMap = aggregateBasePoints(performances)

  // Build global matchesPlayedMap: count distinct matches per player
  // Single pass using Map<playerId, Set<matchId>> to avoid O(N*M) filtering
  const matchesPlayedMapTemp = new Map<string, Set<string>>()
  for (const perf of performances) {
    if (!matchesPlayedMapTemp.has(perf.playerId)) {
      matchesPlayedMapTemp.set(perf.playerId, new Set())
    }
    matchesPlayedMapTemp.get(perf.playerId)!.add(perf.matchId)
  }
  const matchesPlayedMap = new Map<string, number>()
  for (const [playerId, matchIds] of matchesPlayedMapTemp) {
    matchesPlayedMap.set(playerId, matchIds.size)
  }

  // Compute live scores for each team
  const teamScores = new Map<
    string,
    {
      liveGwPoints: number
      chipType: 'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null
    }
  >()

  for (const lineup of lineups) {
    const teamId = lineup.team.id

    // Build slots with role information for this team's lineup
    const slots: LiveScoreSlot[] = lineup.slots.map((slot) => ({
      playerId: slot.playerId,
      slotType: slot.slotType as 'XI' | 'BENCH',
      role: slot.player?.role ?? 'ALL',
      isCaptain: slot.role === 'CAPTAIN',
      isVC: slot.role === 'VC',
    }))

    // Delegate to computeLivePlayerScores with shared data
    // This ensures scoring logic is identical between single-team and batch paths
    const chipType = chipByTeam.get(teamId) || null
    const playerScores = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType,
      matchesPlayedMap,
    })

    // Calculate live GW total (XI only)
    const xiScores = playerScores.filter((p) => p.slotType === 'XI')
    const liveGwPoints = xiScores.reduce((sum, p) => sum + p.multipliedPoints + p.chipBonus, 0)

    teamScores.set(teamId, {
      liveGwPoints,
      chipType,
    })
  }

  return {
    teamScores,
    matchesScored,
    matchesTotal,
  }
}
