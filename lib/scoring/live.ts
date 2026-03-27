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
  const matchesPlayedMap = new Map<string, number>()
  for (const playerId of new Set(performances.map((p) => p.playerId))) {
    const distinctMatches = new Set(
      performances.filter((p) => p.playerId === playerId).map((p) => p.matchId)
    )
    matchesPlayedMap.set(playerId, distinctMatches.size)
  }

  // Build slots with role information
  const slots: LiveScoreSlot[] = lineup.slots.map((slot) => ({
    playerId: slot.playerId,
    slotType: slot.slotType as 'XI' | 'BENCH',
    role: slot.player?.role ?? slot.role ?? 'ALL',
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
