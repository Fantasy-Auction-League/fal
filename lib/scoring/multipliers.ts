import { PrismaClient } from '@prisma/client'

// Build the "played" set from PlayerPerformance rows already in DB
export async function buildPlayedSet(
  prisma: PrismaClient,
  matchIds: string[]
): Promise<Set<string>> {
  const rows = await prisma.playerPerformance.findMany({
    where: {
      matchId: { in: matchIds },
      OR: [{ inStartingXI: true }, { isImpactPlayer: true }],
    },
    select: { playerId: true },
    distinct: ['playerId'],
  })
  return new Set(rows.map(r => r.playerId))
}

// Bench auto-substitution algorithm
export interface LineupSlot {
  playerId: string
  slotType: 'XI' | 'BENCH'
  benchPriority: number | null
  role: 'CAPTAIN' | 'VC' | null
}

export interface Sub {
  out: string // playerId removed from XI
  in: string  // playerId added from bench
}

export function applyBenchSubs(
  lineup: LineupSlot[],
  playedPlayerIds: Set<string>
): { subs: Sub[]; scoringXI: Set<string> } {
  const xiSlots = lineup.filter(s => s.slotType === 'XI')
  const absentXI = xiSlots.filter(s => !playedPlayerIds.has(s.playerId))

  const bench = lineup
    .filter(s => s.slotType === 'BENCH')
    .sort((a, b) => (a.benchPriority ?? 99) - (b.benchPriority ?? 99))
  const availableBench = bench.filter(s => playedPlayerIds.has(s.playerId))

  const usedBench = new Set<string>()
  const subs: Sub[] = []

  for (const absent of absentXI) {
    const sub = availableBench.find(b => !usedBench.has(b.playerId))
    if (sub) {
      usedBench.add(sub.playerId)
      subs.push({ out: absent.playerId, in: sub.playerId })
    }
  }

  // Build final scoring XI
  const scoringXI = new Set(xiSlots.map(s => s.playerId))
  for (const s of subs) {
    scoringXI.delete(s.out)
    scoringXI.add(s.in)
  }

  return { subs, scoringXI }
}

// Captain/VC multiplier resolution (PRD model: VC gets 1x normally, 2x only if Captain absent)
export function resolveMultipliers(
  lineup: LineupSlot[],
  playedPlayerIds: Set<string>
): Map<string, number> {
  const captain = lineup.find(s => s.role === 'CAPTAIN')
  const vc = lineup.find(s => s.role === 'VC')

  if (!captain || !vc) {
    console.warn('Lineup missing captain/VC')
    return new Map()
  }

  const multipliers = new Map<string, number>()

  const captainPlayed = playedPlayerIds.has(captain.playerId)
  const vcPlayed = playedPlayerIds.has(vc.playerId)

  if (captainPlayed) {
    // Captain played -> 2x, VC gets 1x (no bonus)
    multipliers.set(captain.playerId, 2)
  } else if (vcPlayed) {
    // Captain absent -> VC promoted to 2x
    multipliers.set(vc.playerId, 2)
  }

  return multipliers
}

// Chip effects (only 2 chips: POWER_PLAY_BAT, BOWLING_BOOST)
export function applyChipEffects(
  chip: 'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null,
  scoringXI: Set<string>,
  gwPoints: Map<string, number>,
  playerRoles: Map<string, string>
): number {
  let teamTotal = 0

  for (const pid of scoringXI) {
    teamTotal += gwPoints.get(pid) ?? 0
  }

  switch (chip) {
    case 'POWER_PLAY_BAT':
      for (const pid of scoringXI) {
        if (playerRoles.get(pid) === 'BAT') {
          teamTotal += gwPoints.get(pid) ?? 0
        }
      }
      break
    case 'BOWLING_BOOST':
      for (const pid of scoringXI) {
        if (playerRoles.get(pid) === 'BOWL') {
          teamTotal += gwPoints.get(pid) ?? 0
        }
      }
      break
  }

  return teamTotal
}
