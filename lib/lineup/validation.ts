import { prisma } from '../db'

export interface LineupSubmission {
  slots: Array<{
    playerId: string
    slotType: 'XI' | 'BENCH'
    benchPriority: number | null
    role: 'CAPTAIN' | 'VC' | null
  }>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export async function validateLineup(
  teamId: string,
  _leagueId: string,
  submission: LineupSubmission
): Promise<ValidationResult> {
  const errors: string[] = []
  const { slots } = submission

  // 1. Check XI count
  const xiSlots = slots.filter(s => s.slotType === 'XI')
  const benchSlots = slots.filter(s => s.slotType === 'BENCH')

  if (xiSlots.length !== 11) {
    errors.push(`Playing XI must have exactly 11 players, got ${xiSlots.length}`)
  }

  // 2. Bench must be 0-4
  if (benchSlots.length > 4) {
    errors.push(`Bench can have at most 4 players, got ${benchSlots.length}`)
  }

  // 3. Exactly 1 Captain and 1 VC, different players
  const captains = slots.filter(s => s.role === 'CAPTAIN')
  const vcs = slots.filter(s => s.role === 'VC')

  if (captains.length !== 1) errors.push(`Must have exactly 1 Captain, got ${captains.length}`)
  if (vcs.length !== 1) errors.push(`Must have exactly 1 Vice Captain, got ${vcs.length}`)
  if (captains.length === 1 && vcs.length === 1 && captains[0].playerId === vcs[0].playerId) {
    errors.push('Captain and Vice Captain must be different players')
  }

  // 4. No duplicate players
  const playerIds = slots.map(s => s.playerId)
  const uniqueIds = new Set(playerIds)
  if (uniqueIds.size !== playerIds.length) {
    errors.push('Duplicate players in lineup')
  }

  // 5. All players must be on this team's squad
  const squadPlayers = await prisma.teamPlayer.findMany({
    where: { teamId },
    select: { playerId: true },
  })
  const squadPlayerIds = new Set(squadPlayers.map(tp => tp.playerId))

  for (const slot of slots) {
    if (!squadPlayerIds.has(slot.playerId)) {
      errors.push(`Player ${slot.playerId} is not on this team's squad`)
    }
  }

  // 6. Bench priorities must be sequential 1-N
  const benchPriorities = benchSlots
    .map(s => s.benchPriority)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b)
  for (let i = 0; i < benchPriorities.length; i++) {
    if (benchPriorities[i] !== i + 1) {
      errors.push('Bench priorities must be sequential starting from 1')
      break
    }
  }

  return { valid: errors.length === 0, errors }
}
