import { prisma } from '../db'
import { fetchScorecard } from '../sportmonks/fixtures'
import { computeBattingPoints, BattingStats } from './batting'
import { computeBowlingPoints, BowlingStats } from './bowling'
import { computeFieldingPoints, FieldingStats } from './fielding'
import {
  buildPlayedSet,
  applyBenchSubs,
  resolveMultipliers,
  applyChipEffects,
} from './multipliers'

export interface PipelineResult {
  matchesScored: number
  matchesFailed: number
  gwAggregated: boolean
  errors: string[]
}

export async function runScoringPipeline(): Promise<PipelineResult> {
  const result: PipelineResult = {
    matchesScored: 0,
    matchesFailed: 0,
    gwAggregated: false,
    errors: [],
  }

  // Phase A: Claim completed matches using UPDATE...RETURNING
  const claimed: {
    id: string
    apiMatchId: number
    gameweekId: string
    superOver: boolean
  }[] = await prisma.$queryRawUnsafe(`
    UPDATE "Match" SET "scoringStatus" = 'SCORING'
    WHERE id IN (
      SELECT id FROM "Match"
      WHERE "scoringStatus" = 'COMPLETED'
      ORDER BY "startingAt" ASC
      LIMIT 6
    )
    RETURNING id, "apiMatchId", "gameweekId", "superOver"
  `)

  if (claimed.length === 0) return result

  // Score each match
  for (const match of claimed) {
    try {
      await scoreMatch(match)
      result.matchesScored++
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)

      // Reset match on failure, increment attempts
      await prisma.match.update({
        where: { id: match.id },
        data: {
          scoringStatus: 'COMPLETED',
          scoringAttempts: { increment: 1 },
        },
      })

      // Check if max attempts reached -> mark as ERROR
      const updated = await prisma.match.findUnique({
        where: { id: match.id },
      })
      if (updated && updated.scoringAttempts >= 3) {
        await prisma.match.update({
          where: { id: match.id },
          data: { scoringStatus: 'ERROR' },
        })
      }

      result.matchesFailed++
      result.errors.push(`Match ${match.apiMatchId}: ${msg}`)
    }
  }

  // Phase B: Check if gameweek is ready for aggregation
  const gwId = claimed[0]?.gameweekId
  if (gwId) {
    const gwClaimed: { id: string }[] = await prisma.$queryRawUnsafe(`
      UPDATE "Gameweek" SET "aggregationStatus" = 'AGGREGATING'
      WHERE id = $1 AND "aggregationStatus" = 'PENDING'
      AND NOT EXISTS (
        SELECT 1 FROM "Match"
        WHERE "gameweekId" = $1
        AND "scoringStatus" NOT IN ('SCORED', 'ERROR', 'CANCELLED')
      )
      RETURNING id
    `, gwId)

    if (gwClaimed.length > 0) {
      try {
        await aggregateGameweek(gwId)
        result.gwAggregated = true
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        result.errors.push(`GW aggregation failed: ${msg}`)
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Live mid-match scoring
// ---------------------------------------------------------------------------

export async function scoreLiveMatches(): Promise<{
  matchesScored: number
  matchesFailed: number
  lineupsCreated: number
  errors: string[]
}> {
  const result = { matchesScored: 0, matchesFailed: 0, lineupsCreated: 0, errors: [] as string[] }

  const liveMatches = await prisma.match.findMany({
    where: { scoringStatus: 'LIVE_SCORING' },
    select: { id: true, apiMatchId: true, gameweekId: true, superOver: true },
  })

  if (liveMatches.length === 0) return result

  // Activate GWs and ensure lineups exist before scoring live matches
  const gwIds = [...new Set(liveMatches.map((m) => m.gameweekId))]
  for (const gwId of gwIds) {
    // Transition UPCOMING → ACTIVE when first match goes live
    await prisma.gameweek.updateMany({
      where: { id: gwId, status: 'UPCOMING' },
      data: { status: 'ACTIVE' },
    })
    const created = await ensureLineupsForGameweek(gwId)
    result.lineupsCreated += created
  }

  for (const match of liveMatches) {
    try {
      await scoreMatch(match)
      // scoreMatch() marks it as SCORED — reset back to LIVE_SCORING
      // so it gets re-scored on next cron run with updated stats
      await prisma.match.update({
        where: { id: match.id },
        data: { scoringStatus: 'LIVE_SCORING' },
      })
      result.matchesScored++
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      result.matchesFailed++
      result.errors.push(`Live match ${match.apiMatchId}: ${msg}`)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Per-match scoring
// ---------------------------------------------------------------------------

export async function scoreMatch(match: {
  id: string
  apiMatchId: number
  gameweekId: string
  superOver: boolean
}) {
  const scorecard = await fetchScorecard(match.apiMatchId, true)

  // Filter Super Over data if applicable
  let batting = scorecard.batting
  let bowling = scorecard.bowling
  let balls = scorecard.balls
  if (match.superOver) {
    batting = batting.filter(
      (b) => b.scoreboard === 'S1' || b.scoreboard === 'S2'
    )
    bowling = bowling.filter(
      (b) => b.scoreboard === 'S1' || b.scoreboard === 'S2'
    )
    balls = balls?.filter(
      (b) => b.scoreboard === 'S1' || b.scoreboard === 'S2'
    )
  }

  // Player role map from lineup
  const playerRoleMap = new Map<number, string>()
  for (const p of scorecard.lineup) {
    playerRoleMap.set(p.id, mapPositionName(p.position?.name))
  }

  // LBW/Bowled count per bowler (wicket_id 79=LBW, 83=Bowled)
  const lbwBowledMap = new Map<number, number>()
  for (const b of batting) {
    if (b.wicket_id && [79, 83].includes(b.wicket_id) && b.bowling_player_id) {
      lbwBowledMap.set(
        b.bowling_player_id,
        (lbwBowledMap.get(b.bowling_player_id) || 0) + 1
      )
    }
  }

  // Dot balls per bowler from ball-by-ball
  const dotBallMap = new Map<number, number>()
  if (balls) {
    for (const b of balls) {
      const s = b.score
      if (
        s.runs === 0 &&
        s.ball &&
        s.noball === 0 &&
        s.bye === 0 &&
        s.leg_bye === 0
      ) {
        dotBallMap.set(b.bowler_id, (dotBallMap.get(b.bowler_id) || 0) + 1)
      }
    }
  }

  // Fielding stats per fielder
  const fieldingMap = new Map<number, FieldingStats>()
  const getFielding = (id: number): FieldingStats => {
    if (!fieldingMap.has(id))
      fieldingMap.set(id, {
        catches: 0,
        stumpings: 0,
        runoutsDirect: 0,
        runoutsAssisted: 0,
      })
    return fieldingMap.get(id)!
  }

  for (const b of batting) {
    if (!b.wicket_id) continue
    // Catches
    if ([54, 55].includes(b.wicket_id) && b.catch_stump_player_id) {
      getFielding(b.catch_stump_player_id).catches++
    }
    // Stumpings
    if (b.wicket_id === 56 && b.catch_stump_player_id) {
      getFielding(b.catch_stump_player_id).stumpings++
    }
    // Runouts
    if ([63, 64, 65, 66, 67, 68, 22, 32].includes(b.wicket_id)) {
      if (b.runout_by_id && b.catch_stump_player_id) {
        if (b.runout_by_id === b.catch_stump_player_id) {
          getFielding(b.runout_by_id).runoutsDirect++
        } else {
          getFielding(b.runout_by_id).runoutsAssisted++
          getFielding(b.catch_stump_player_id).runoutsAssisted++
        }
      } else if (b.runout_by_id) {
        getFielding(b.runout_by_id).runoutsDirect++
      } else if (b.catch_stump_player_id) {
        // SportMonks sometimes only populates catch_stump_player_id for runouts
        getFielding(b.catch_stump_player_id).runoutsDirect++
      }
    }
  }

  // Determine Starting XI vs Impact Players
  const startingXIIds = new Set<number>()
  const impactPlayerIds = new Set<number>()
  const battedOrBowled = new Set<number>()
  for (const b of batting) battedOrBowled.add(b.player_id)
  for (const b of bowling) battedOrBowled.add(b.player_id)

  for (const p of scorecard.lineup) {
    if (!p.lineup.substitution) {
      startingXIIds.add(p.id)
    } else if (battedOrBowled.has(p.id)) {
      impactPlayerIds.add(p.id)
    }
  }

  // All participants
  const allParticipants = new Set<number>([
    ...startingXIIds,
    ...impactPlayerIds,
  ])
  for (const [fid] of fieldingMap) allParticipants.add(fid)

  // Map API player IDs -> DB records
  const apiPlayerIds = [...allParticipants]
  const dbPlayers = await prisma.player.findMany({
    where: { apiPlayerId: { in: apiPlayerIds } },
    select: { id: true, apiPlayerId: true, role: true },
  })
  const apiToDbMap = new Map(
    dbPlayers.map((p) => [p.apiPlayerId, { id: p.id, role: p.role }])
  )

  // Compute fantasy points per player
  const perfRows: Array<{
    playerId: string
    matchId: string
    runs: number | null
    balls: number | null
    fours: number | null
    sixes: number | null
    strikeRate: number | null
    wicketId: number | null
    overs: number | null
    maidens: number | null
    runsConceded: number | null
    wickets: number | null
    economyRate: number | null
    dotBalls: number | null
    catches: number
    stumpings: number
    runoutsDirect: number
    runoutsAssisted: number
    fantasyPoints: number
    inStartingXI: boolean
    isImpactPlayer: boolean
  }> = []

  for (const apiPid of allParticipants) {
    const dbPlayer = apiToDbMap.get(apiPid)
    if (!dbPlayer) continue

    const role = playerRoleMap.get(apiPid) || dbPlayer.role
    const inStartingXI = startingXIIds.has(apiPid)
    const isImpactPlayer = impactPlayerIds.has(apiPid)

    // Batting
    const battingEntry = batting.find((b) => b.player_id === apiPid)
    const battingStats: BattingStats | null = battingEntry
      ? {
          runs: battingEntry.score,
          balls: battingEntry.ball,
          fours: battingEntry.four_x,
          sixes: battingEntry.six_x,
          wicketId: battingEntry.wicket_id,
        }
      : null

    // Bowling
    const bowlingEntry = bowling.find((b) => b.player_id === apiPid)
    const bowlingStats: BowlingStats | null = bowlingEntry
      ? {
          wickets: bowlingEntry.wickets,
          overs: bowlingEntry.overs,
          maidens: bowlingEntry.medians,
          runsConceded: bowlingEntry.runs,
          dotBalls: dotBallMap.get(apiPid) || 0,
          lbwBowledCount: lbwBowledMap.get(apiPid) || 0,
        }
      : null

    // Fielding
    const fieldingStats: FieldingStats = fieldingMap.get(apiPid) || {
      catches: 0,
      stumpings: 0,
      runoutsDirect: 0,
      runoutsAssisted: 0,
    }

    // Points
    let pts = 0
    if (inStartingXI) pts += 4
    if (isImpactPlayer) pts += 4
    if (battingStats) pts += computeBattingPoints(battingStats, role)
    if (bowlingStats) pts += computeBowlingPoints(bowlingStats)
    pts += computeFieldingPoints(fieldingStats)

    perfRows.push({
      playerId: dbPlayer.id,
      matchId: match.id,
      runs: battingStats?.runs ?? null,
      balls: battingStats?.balls ?? null,
      fours: battingStats?.fours ?? null,
      sixes: battingStats?.sixes ?? null,
      strikeRate: battingEntry ? battingEntry.rate : null,
      wicketId: battingStats?.wicketId ?? null,
      overs: bowlingStats?.overs ?? null,
      maidens: bowlingStats?.maidens ?? null,
      runsConceded: bowlingStats?.runsConceded ?? null,
      wickets: bowlingStats?.wickets ?? null,
      economyRate: bowlingEntry ? bowlingEntry.rate : null,
      dotBalls: bowlingStats?.dotBalls ?? null,
      catches: fieldingStats.catches,
      stumpings: fieldingStats.stumpings,
      runoutsDirect: fieldingStats.runoutsDirect,
      runoutsAssisted: fieldingStats.runoutsAssisted,
      fantasyPoints: pts,
      inStartingXI,
      isImpactPlayer,
    })
  }

  // Batch upsert PlayerPerformance
  for (const row of perfRows) {
    await prisma.playerPerformance.upsert({
      where: {
        playerId_matchId: { playerId: row.playerId, matchId: row.matchId },
      },
      update: { ...row },
      create: { ...row },
    })
  }

  // Mark match as scored
  await prisma.match.update({
    where: { id: match.id },
    data: { scoringStatus: 'SCORED', scoringAttempts: { increment: 1 } },
  })
}

// ---------------------------------------------------------------------------
// Gameweek aggregation
// ---------------------------------------------------------------------------

export async function aggregateGameweek(gameweekId: string) {
  const matches = await prisma.match.findMany({
    where: { gameweekId, scoringStatus: 'SCORED' },
    select: { id: true },
  })
  const matchIds = matches.map((m) => m.id)

  // All teams across all leagues
  const teams = await prisma.team.findMany({
    include: {
      league: true,
      lineups: {
        where: { gameweekId },
        include: { slots: true },
      },
      chipUsages: {
        where: { gameweekId, status: 'PENDING' },
      },
    },
  })

  const playedSet = await buildPlayedSet(prisma, matchIds)

  // All performances in this GW
  const performances = await prisma.playerPerformance.findMany({
    where: { matchId: { in: matchIds } },
  })

  // Pre-compute base points per player across GW matches
  const gwBasePointsAll = new Map<string, number>()
  for (const perf of performances) {
    gwBasePointsAll.set(
      perf.playerId,
      (gwBasePointsAll.get(perf.playerId) || 0) + perf.fantasyPoints
    )
  }

  await prisma.$transaction(async (tx) => {
    // Carry-forward lineups for teams missing one this GW
    const ensureResult = await ensureLineups(tx, teams, gameweekId)
    if (ensureResult.carriedForward > 0 || ensureResult.autoGenerated > 0) {
      console.log(`ensureLineups: ${ensureResult.carriedForward} carried forward, ${ensureResult.autoGenerated} auto-generated`)
    }

    for (const team of teams) {
      const lineup = team.lineups[0]
      if (!lineup || lineup.slots.length === 0) continue

      const slots = lineup.slots.map((s) => ({
        playerId: s.playerId,
        slotType: s.slotType as 'XI' | 'BENCH',
        benchPriority: s.benchPriority,
        role: s.role as 'CAPTAIN' | 'VC' | null,
      }))

      // Clone base points for this team's context
      const gwPoints = new Map<string, number>()
      for (const s of slots) {
        gwPoints.set(s.playerId, gwBasePointsAll.get(s.playerId) || 0)
      }

      // Bench substitutions
      const { subs, scoringXI } = applyBenchSubs(slots, playedSet)

      // Captain/VC multipliers
      const multipliers = resolveMultipliers(slots, playedSet)
      for (const [pid, mult] of multipliers) {
        const current = gwPoints.get(pid) || 0
        gwPoints.set(pid, current * mult)
      }

      // Player roles for chip effects
      const playerIds = [...scoringXI]
      const players = await tx.player.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, role: true },
      })
      const playerRoles = new Map(players.map((p) => [p.id, p.role]))

      // Apply chip
      const activeChip = team.chipUsages[0]
      const chipType = (activeChip?.chipType as 'POWER_PLAY_BAT' | 'BOWLING_BOOST') || null
      const teamTotal = applyChipEffects(chipType, scoringXI, gwPoints, playerRoles)

      // Write PlayerScore rows
      for (const [playerId, points] of gwPoints) {
        await tx.playerScore.upsert({
          where: { playerId_gameweekId: { playerId, gameweekId } },
          update: { totalPoints: points },
          create: { playerId, gameweekId, totalPoints: points },
        })
      }

      // Write GameweekScore
      await tx.gameweekScore.upsert({
        where: { teamId_gameweekId: { teamId: team.id, gameweekId } },
        update: { totalPoints: teamTotal, chipUsed: chipType },
        create: {
          teamId: team.id,
          gameweekId,
          totalPoints: teamTotal,
          chipUsed: chipType,
        },
      })

      // Update team totals
      await tx.team.update({
        where: { id: team.id },
        data: {
          totalPoints: { increment: teamTotal },
          bestGwScore: Math.max(team.bestGwScore, teamTotal),
        },
      })

      // Mark chip as used
      if (activeChip) {
        await tx.chipUsage.update({
          where: { id: activeChip.id },
          data: { status: 'USED' },
        })
      }
    }

    // Mark GW as done
    await tx.gameweek.update({
      where: { id: gameweekId },
      data: { aggregationStatus: 'DONE', status: 'COMPLETED' },
    })
  })
}

// ---------------------------------------------------------------------------
// Pre-GW Lineup Ensure (for live scoring)
// ---------------------------------------------------------------------------

/**
 * Ensures all teams in leagues with matches in this GW have lineups.
 * Called before live scoring so computeLiveTeamScore has lineups to work with.
 * Returns number of lineups created.
 */
async function ensureLineupsForGameweek(gameweekId: string): Promise<number> {
  // Find all teams that DON'T have a lineup for this GW
  const teamsWithoutLineups = await prisma.team.findMany({
    where: {
      lineups: { none: { gameweekId } },
    },
    include: {
      league: true,
      teamPlayers: {
        include: { player: true },
        orderBy: { purchasePrice: 'desc' },
      },
    },
  })

  if (teamsWithoutLineups.length === 0) return 0

  let created = 0

  for (const team of teamsWithoutLineups) {
    // Try carry-forward from previous GW
    const prevLineup = await prisma.lineup.findFirst({
      where: { teamId: team.id },
      orderBy: { gameweek: { number: 'desc' } },
      include: { slots: true, gameweek: { select: { number: true } } },
    })

    if (prevLineup) {
      const currentPlayerIds = new Set(team.teamPlayers.map((tp) => tp.playerId))
      const filteredSlots = prevLineup.slots.filter((slot) => currentPlayerIds.has(slot.playerId))

      if (filteredSlots.length > 0) {
        await prisma.lineup.create({
          data: {
            teamId: team.id,
            gameweekId,
            slots: {
              createMany: {
                data: filteredSlots.map((slot) => ({
                  playerId: slot.playerId,
                  slotType: slot.slotType,
                  role: slot.role,
                  benchPriority: slot.benchPriority,
                })),
              },
            },
          },
        })
        console.log(`ensureLineupsForGameweek: carried forward ${team.name} from GW${prevLineup.gameweek.number}`)
        created++
        continue
      }
    }

    // Auto-generate from squad
    if (team.teamPlayers.length === 0) continue

    const xiPlayers = team.teamPlayers.slice(0, 11)
    const benchPlayers = team.teamPlayers.slice(11, 15)

    const slots: { playerId: string; slotType: 'XI' | 'BENCH'; role: 'CAPTAIN' | 'VC' | null; benchPriority: number | null }[] = []

    for (let i = 0; i < xiPlayers.length; i++) {
      slots.push({
        playerId: xiPlayers[i].playerId,
        slotType: 'XI',
        role: i === 0 ? 'CAPTAIN' : i === 1 ? 'VC' : null,
        benchPriority: null,
      })
    }

    for (let i = 0; i < benchPlayers.length; i++) {
      slots.push({
        playerId: benchPlayers[i].playerId,
        slotType: 'BENCH',
        role: null,
        benchPriority: i + 1,
      })
    }

    await prisma.lineup.create({
      data: {
        teamId: team.id,
        gameweekId,
        slots: { createMany: { data: slots } },
      },
    })
    console.log(`ensureLineupsForGameweek: auto-generated ${team.name} (captain: ${xiPlayers[0].player.fullname})`)
    created++
  }

  return created
}

// ---------------------------------------------------------------------------
// Lineup Carry-Forward (used during aggregation)
// ---------------------------------------------------------------------------

type TeamsWithLineups = Awaited<ReturnType<typeof prisma.team.findMany<{
  include: { league: true; lineups: { where: { gameweekId: string }; include: { slots: true } }; chipUsages: { where: { gameweekId: string; status: 'PENDING' } } }
}>>>

export async function ensureLineups(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  teams: TeamsWithLineups,
  gameweekId: string
): Promise<{ carriedForward: number; autoGenerated: number }> {
  let carriedForward = 0
  let autoGenerated = 0

  for (const team of teams) {
    // Skip teams that already have a lineup for this GW (AC1.4)
    if (team.lineups.length > 0) {
      continue
    }

    // Find most recent previous lineup (AC1.2)
    const prevLineup = await tx.lineup.findFirst({
      where: { teamId: team.id },
      orderBy: { gameweek: { number: 'desc' } },
      include: { slots: true, gameweek: { select: { number: true } } },
    })

    if (prevLineup) {
      // Get current squad (AC1.5)
      const currentSquad = await tx.teamPlayer.findMany({
        where: { teamId: team.id },
        select: { playerId: true },
      })
      const currentPlayerIds = new Set(currentSquad.map((tp) => tp.playerId))

      // Filter previous lineup slots to only include players still in squad
      const filteredSlots = prevLineup.slots.filter((slot) => currentPlayerIds.has(slot.playerId))

      // Create new Lineup + LineupSlot records (AC1.1, AC1.3)
      const newLineup = await tx.lineup.create({
        data: {
          teamId: team.id,
          gameweekId,
          slots: {
            createMany: {
              data: filteredSlots.map((slot) => ({
                playerId: slot.playerId,
                slotType: slot.slotType,
                role: slot.role,
                benchPriority: slot.benchPriority,
              })),
            },
          },
        },
        include: { slots: true },
      })

      console.log(`ensureLineups: carried forward ${team.name} from GW${prevLineup.gameweek.number}`)

      // Push the new lineup into team.lineups array so scoring loop picks it up
      // Type narrowing: cast to the shape expected by the scoring loop (lineup with slots included)
      team.lineups.push(newLineup as typeof team.lineups[number])

      carriedForward++
      continue
    }

    // Case 2: Auto-generate lineup from squad if no previous lineup exists
    const teamPlayers = await tx.teamPlayer.findMany({
      where: { teamId: team.id },
      include: { player: true },
      orderBy: { purchasePrice: 'desc' },
    })

    // Skip if squad is empty (AC2.5)
    if (teamPlayers.length === 0) {
      continue
    }

    // Top 11 by purchasePrice → XI, remaining 4 → BENCH (AC2.2)
    const xiPlayers = teamPlayers.slice(0, 11)
    const benchPlayers = teamPlayers.slice(11, 15)

    const slots = []

    // First player (highest price) = CAPTAIN, second = VC (AC2.3)
    for (let i = 0; i < xiPlayers.length; i++) {
      let role: 'CAPTAIN' | 'VC' | null = null
      if (i === 0) role = 'CAPTAIN'
      else if (i === 1) role = 'VC'

      slots.push({
        playerId: xiPlayers[i].playerId,
        slotType: 'XI' as const,
        role,
        benchPriority: null,
      })
    }

    // Bench players with priorities 1-4 by descending price (AC2.4)
    for (let i = 0; i < benchPlayers.length; i++) {
      slots.push({
        playerId: benchPlayers[i].playerId,
        slotType: 'BENCH' as const,
        role: null,
        benchPriority: i + 1,
      })
    }

    // Create Lineup + LineupSlot records
    const newLineup = await tx.lineup.create({
      data: {
        teamId: team.id,
        gameweekId,
        slots: {
          createMany: {
            data: slots,
          },
        },
      },
      include: { slots: true },
    })

    console.log(`ensureLineups: auto-generated ${team.name} (captain: ${xiPlayers[0].player.fullname})`)

    // Push into team.lineups array so scoring loop picks it up
    // Type narrowing: cast to the shape expected by the scoring loop (lineup with slots included)
    team.lineups.push(newLineup as typeof team.lineups[number])

    autoGenerated++
  }

  return { carriedForward, autoGenerated }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPositionName(name: string | undefined): string {
  switch (name?.toLowerCase()) {
    case 'batsman':
    case 'middle order batter':
    case 'opening batter':
      return 'BAT'
    case 'bowler':
      return 'BOWL'
    case 'allrounder':
      return 'ALL'
    case 'wicketkeeper':
      return 'WK'
    default:
      return 'ALL'
  }
}
