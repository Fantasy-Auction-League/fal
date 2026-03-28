import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeLiveTeamScore } from '@/lib/scoring/live'
import { getCacheHeaders } from '@/lib/cache-headers'

// GET /api/teams/[teamId]/scores/[gameweekId] — Per-team and per-player breakdown for a team in a GW
// Returns either LIVE (running total) or FINAL (stored) score depending on GameweekScore existence
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string; gameweekId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { teamId, gameweekId } = await params

    // Get team and verify league membership
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { leagueId: true, userId: true },
    })
    if (!team) {
      return Response.json({ error: 'Team not found' }, { status: 404 })
    }

    const league = await prisma.league.findUnique({
      where: { id: team.leagueId },
      select: { adminUserId: true },
    })

    const isAdmin = league?.adminUserId === session.user.id
    const isMember = await prisma.team.findFirst({
      where: { leagueId: team.leagueId, userId: session.user.id },
    })
    if (!isMember && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check for GameweekScore (FINAL mode check)
    const gameweekScore = await prisma.gameweekScore.findUnique({
      where: { teamId_gameweekId: { teamId, gameweekId } },
    })

    if (gameweekScore) {
      // FINAL mode: return stored data with player breakdown
      const playerScores = await prisma.playerScore.findMany({
        where: {
          gameweekId,
          player: { teamPlayers: { some: { teamId } } },
        },
        include: {
          player: {
            select: { id: true, fullname: true, role: true, iplTeamCode: true },
          },
        },
      })

      // Fetch lineup for slot info (captain/VC/slotType)
      const lineup = await prisma.lineup.findFirst({
        where: { teamId, gameweekId },
        include: {
          slots: {
            include: {
              player: {
                select: { id: true, role: true },
              },
            },
          },
        },
      })

      // Get match count for the gameweek
      const allMatches = await prisma.match.findMany({
        where: { gameweekId },
        select: { id: true, scoringStatus: true },
      })

      const scoredMatches = allMatches.filter((m) => m.scoringStatus === 'SCORED')
      const matchesScored = scoredMatches.length
      const matchesTotal = allMatches.length

      // Build slot map for quick lookup
      const slotMap = new Map<
        string,
        { slotType: 'XI' | 'BENCH'; role?: string; isCaptain?: boolean; isVC?: boolean }
      >()

      if (lineup) {
        for (const slot of lineup.slots) {
          slotMap.set(slot.playerId, {
            slotType: slot.slotType,
            role: slot.role === 'CAPTAIN' ? 'CAPTAIN' : slot.role === 'VC' ? 'VC' : undefined,
            isCaptain: slot.role === 'CAPTAIN',
            isVC: slot.role === 'VC',
          })
        }
      }

      // Build per-player breakdown from stored PlayerScore data, merging with lineup slot info
      const players = playerScores.map((ps) => {
        const slotInfo = slotMap.get(ps.playerId)
        return {
          id: ps.playerId,
          name: ps.player.fullname,
          role: ps.player.role,
          iplTeamCode: ps.player.iplTeamCode,
          slotType: slotInfo?.slotType || 'XI',
          // TODO: In FINAL mode, we store the total (basePoints * multiplier + chipBonus) as totalPoints.
          // To properly break down basePoints vs multipliedPoints, we'd need separate fields in PlayerScore.
          // For now, both are set to totalPoints as a known limitation.
          basePoints: ps.totalPoints,
          chipBonus: 0, // Not tracked separately in stored data; would need separate PlayerChipBonus table for granular tracking
          isCaptain: slotInfo?.isCaptain ?? false,
          isVC: slotInfo?.isVC ?? false,
          multipliedPoints: ps.totalPoints,
          // TODO: matchesPlayed is not tracked in the current schema for FINAL mode.
          // In LIVE mode, this is available from computeLiveTeamScore's matchesPlayedMap,
          // but stored data does not preserve this per-player information.
          matchesPlayed: 1,
        }
      })

      const response = {
        gameweekId,
        gameweekNumber: (await prisma.gameweek.findUnique({ where: { id: gameweekId } }))
          ?.number,
        status: 'FINAL' as const,
        matchesScored,
        matchesTotal,
        totalPoints: gameweekScore.totalPoints,
        chipActive: gameweekScore.chipUsed || null,
        chipBonusPoints: 0, // Not tracked separately in stored data
        players,
      }

      const headers = getCacheHeaders('FINAL')

      return Response.json(response, { headers })
    } else {
      // LIVE mode: compute running totals
      let liveResult
      try {
        liveResult = await computeLiveTeamScore(prisma, teamId, gameweekId)
      } catch (error) {
        if (error instanceof Error && error.message.includes('No lineup found')) {
          // No lineup saved yet — return raw performances so frontend can show mid-GW points
          const allMatches = await prisma.match.findMany({
            where: { gameweekId },
            select: { id: true, scoringStatus: true },
          })
          const matchIds = allMatches.map((m) => m.id)
          const performances = await prisma.playerPerformance.findMany({
            where: {
              matchId: { in: matchIds },
              player: { teamPlayers: { some: { teamId } } },
            },
            include: {
              player: { select: { id: true, fullname: true, role: true, iplTeamCode: true } },
            },
          })

          // Sum fantasy points per player
          const pointsMap = new Map<string, number>()
          for (const perf of performances) {
            pointsMap.set(perf.playerId, (pointsMap.get(perf.playerId) || 0) + perf.fantasyPoints)
          }

          // Determine default captain/VC from squad ordering (WK > BAT > ALL > BOWL, then alphabetical)
          // Must match frontend: squad API returns alphabetically, frontend re-sorts by role
          const squadPlayers = await prisma.teamPlayer.findMany({
            where: { teamId },
            include: { player: { select: { id: true, role: true, fullname: true } } },
            orderBy: { player: { fullname: 'asc' } },
          })
          // Must match frontend normalizeRole + priority exactly
          const normalizeRole = (r: string): string => {
            const u = r?.toUpperCase() || 'BAT'
            if (u.includes('WK')) return 'WK'
            if (u.includes('ALL')) return 'ALL'
            if (u.includes('BOWL')) return 'BOWL'
            return 'BAT'
          }
          const rolePriority: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 }
          const sorted = squadPlayers.sort((a, b) =>
            (rolePriority[normalizeRole(a.player.role)] ?? 1) - (rolePriority[normalizeRole(b.player.role)] ?? 1)
          )
          const defaultCaptainId = sorted[0]?.player.id ?? null
          const defaultVcId = sorted[1]?.player.id ?? null

          // Check if captain played, apply multiplier
          const capPlayed = defaultCaptainId && pointsMap.has(defaultCaptainId)
          const vcPlayed = defaultVcId && pointsMap.has(defaultVcId)

          const players = [...pointsMap.entries()].map(([playerId, pts]) => {
            const perf = performances.find((p) => p.playerId === playerId)!
            const isCaptain = playerId === defaultCaptainId
            const isVC = playerId === defaultVcId
            let multipliedPts = pts
            if (isCaptain && capPlayed) {
              multipliedPts = pts * 2
            } else if (isVC && !capPlayed && vcPlayed) {
              multipliedPts = Math.round(pts * 1.5)
            }
            return {
              id: playerId,
              name: perf.player.fullname,
              role: perf.player.role,
              iplTeamCode: perf.player.iplTeamCode,
              slotType: 'XI' as const,
              basePoints: pts,
              chipBonus: 0,
              isCaptain,
              isVC,
              multipliedPoints: multipliedPts,
              matchesPlayed: performances.filter((p) => p.playerId === playerId).length,
            }
          })

          const totalPoints = players.reduce((sum, p) => sum + p.multipliedPoints, 0)

          return Response.json({
            gameweekId,
            gameweekNumber: (await prisma.gameweek.findUnique({ where: { id: gameweekId } }))?.number,
            status: 'LIVE' as const,
            matchesScored: allMatches.filter((m) => m.scoringStatus === 'SCORED').length,
            matchesTotal: allMatches.length,
            totalPoints,
            chipActive: null,
            chipBonusPoints: 0,
            players,
          })
        }
        throw error
      }

      // Enrich player data with name, role, and iplTeamCode
      const playerIds = liveResult.players.map((p) => p.playerId)
      const playerData = await prisma.player.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, fullname: true, role: true, iplTeamCode: true },
      })

      const playerDataMap = new Map(playerData.map((p) => [p.id, p]))

      const enrichedPlayers = liveResult.players.map((p) => {
        const playerInfo = playerDataMap.get(p.playerId)
        return {
          id: p.playerId,
          name: playerInfo?.fullname || 'Unknown',
          role: playerInfo?.role || 'ALL',
          iplTeamCode: playerInfo?.iplTeamCode || null,
          slotType: p.slotType,
          basePoints: p.basePoints,
          chipBonus: p.chipBonus,
          isCaptain: p.isCaptain,
          isVC: p.isVC,
          multipliedPoints: p.multipliedPoints,
          matchesPlayed: p.matchesPlayed,
        }
      })

      const enrichedResponse = {
        ...liveResult,
        players: enrichedPlayers,
      }

      const headers = getCacheHeaders('LIVE')

      return Response.json(enrichedResponse, { headers })
    }
  } catch (error) {
    console.error('GET /api/teams/[teamId]/scores/[gameweekId] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
