import { prisma } from '../../lib/db'
import { getSportMonksClient } from '../../lib/sportmonks/client'
import { IPL_TEAMS, mapPositionToRole } from '../../lib/sportmonks/utils'
import { importFixturesAndGameweeks } from '../../lib/sportmonks/fixtures'
import { hash } from 'bcryptjs'
import {
  SIM_ADMIN_EMAIL,
  SIM_PASSWORD,
  SIM_LEAGUE_NAME,
  SIM_INVITE_CODE,
  IPL_2025_SEASON_ID,
  simUserEmail,
  generateLineup,
} from './helpers'

export async function setupSimulation() {
  const log: string[] = ['Starting simulation setup...']

  // 1. Hash password
  const passwordHash = await hash(SIM_PASSWORD, 10)
  log.push('Password hashed')

  // 2. Seed 2025 players from SportMonks
  const client = getSportMonksClient()
  let totalPlayers = 0

  for (const team of IPL_TEAMS) {
    const squad: any[] = await client.fetch<any[]>(
      `/teams/${team.id}/squad/${IPL_2025_SEASON_ID}`
    )
    const players = (squad as any)?.squad ?? squad ?? []
    log.push(`${team.code}: ${players.length} players`)

    for (const player of players) {
      await prisma.player.upsert({
        where: { apiPlayerId: player.id },
        update: {
          fullname: player.fullname,
          firstname: player.firstname,
          lastname: player.lastname,
          iplTeamId: team.id,
          iplTeamName: team.name,
          iplTeamCode: team.code,
          role: mapPositionToRole(player.position?.name),
          battingStyle: player.battingstyle || null,
          bowlingStyle: player.bowlingstyle || null,
          imageUrl: player.image_path || null,
          dateOfBirth: player.dateofbirth || null,
        },
        create: {
          apiPlayerId: player.id,
          fullname: player.fullname,
          firstname: player.firstname,
          lastname: player.lastname,
          iplTeamId: team.id,
          iplTeamName: team.name,
          iplTeamCode: team.code,
          role: mapPositionToRole(player.position?.name),
          battingStyle: player.battingstyle || null,
          bowlingStyle: player.bowlingstyle || null,
          imageUrl: player.image_path || null,
          dateOfBirth: player.dateofbirth || null,
        },
      })
      totalPlayers++
    }
  }
  log.push(`Seeded ${totalPlayers} players`)

  // 3. Create admin user + simulation league
  const admin = await prisma.user.upsert({
    where: { email: SIM_ADMIN_EMAIL },
    update: { passwordHash, role: 'ADMIN' },
    create: {
      email: SIM_ADMIN_EMAIL,
      name: 'Sim Admin',
      passwordHash,
      role: 'ADMIN',
    },
  })
  log.push(`Admin user: ${admin.email}`)

  const league = await prisma.league.upsert({
    where: { inviteCode: SIM_INVITE_CODE },
    update: { name: SIM_LEAGUE_NAME, adminUserId: admin.id },
    create: {
      name: SIM_LEAGUE_NAME,
      inviteCode: SIM_INVITE_CODE,
      adminUserId: admin.id,
      maxManagers: 15,
      minSquadSize: 12,
      maxSquadSize: 15,
    },
  })
  log.push(`League: ${league.name} (${league.id})`)

  // 4. Create 10 test users, each with a team
  const allPlayers = await prisma.player.findMany({ select: { id: true } })
  const playerPool = [...allPlayers]
  // Shuffle for random assignment
  for (let i = playerPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[playerPool[i], playerPool[j]] = [playerPool[j], playerPool[i]]
  }

  let poolIndex = 0
  const PLAYERS_PER_TEAM = 15
  const NUM_USERS = 10

  for (let n = 1; n <= NUM_USERS; n++) {
    const email = simUserEmail(n)
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: {
        email,
        name: `Sim User ${n}`,
        passwordHash,
      },
    })

    const team = await prisma.team.upsert({
      where: {
        id: (
          await prisma.team.findFirst({
            where: { userId: user.id, leagueId: league.id },
          })
        )?.id ?? '',
      },
      update: {},
      create: {
        name: `Sim Team ${n}`,
        userId: user.id,
        leagueId: league.id,
      },
    })

    // 5. Assign 15 players (no duplicates across teams)
    const teamPlayerIds = playerPool.slice(
      poolIndex,
      poolIndex + PLAYERS_PER_TEAM
    )
    poolIndex += PLAYERS_PER_TEAM

    for (const p of teamPlayerIds) {
      await prisma.teamPlayer.upsert({
        where: {
          leagueId_playerId: { leagueId: league.id, playerId: p.id },
        },
        update: { teamId: team.id },
        create: {
          teamId: team.id,
          playerId: p.id,
          leagueId: league.id,
        },
      })
    }

    log.push(`User ${n}: ${email} -> ${team.name} (${teamPlayerIds.length} players)`)
  }

  // 6. Import fixtures and gameweeks
  const fixtureResult = await importFixturesAndGameweeks(
    prisma,
    IPL_2025_SEASON_ID
  )
  log.push(
    `Imported ${fixtureResult.gameweeks} gameweeks, ${fixtureResult.matches} matches`
  )

  // 7. Mark season as started
  await prisma.league.update({
    where: { id: league.id },
    data: { seasonStarted: true },
  })
  log.push('Season started')

  // Credential printout
  log.push('\n--- Simulation Credentials ---')
  log.push(`Admin: ${SIM_ADMIN_EMAIL} / ${SIM_PASSWORD}`)
  for (let n = 1; n <= NUM_USERS; n++) {
    log.push(`User ${n}: ${simUserEmail(n)} / ${SIM_PASSWORD}`)
  }
  log.push('--- End Credentials ---\n')

  // 8. Set up mid-season gameweek state
  await setupMidSeasonState(log)

  const updatedLeague = await prisma.league.findUnique({
    where: { id: league.id },
    include: { teams: { include: { user: true } } },
  })

  return { league: updatedLeague, log }
}

/**
 * Configures a mid-season state so the dashboard shows an active gameweek
 * with a mix of completed and upcoming matches.
 *
 * - GW1-5 → COMPLETED
 * - GW6   → ACTIVE, lockTime = tomorrow, matches near today
 * - GW7+  → UPCOMING
 */
async function setupMidSeasonState(log: string[]) {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86_400_000)
  const today = new Date(now.getTime())
  const tomorrow = new Date(now.getTime() + 86_400_000)
  const dayAfter = new Date(now.getTime() + 2 * 86_400_000)

  const allGws = await prisma.gameweek.findMany({ orderBy: { number: 'asc' } })
  if (allGws.length === 0) {
    log.push('Mid-season: no gameweeks found, skipping')
    return
  }

  // Mark GW1-5 as COMPLETED
  for (const gw of allGws.filter((g) => g.number <= 5)) {
    await prisma.gameweek.update({
      where: { id: gw.id },
      data: { status: 'COMPLETED' },
    })
  }

  // Find GW6 (or the 6th gameweek if numbering differs)
  const gw6 = allGws.find((g) => g.number === 6)
  if (!gw6) {
    log.push('Mid-season: GW6 not found, skipping')
    return
  }

  // Set GW6 to ACTIVE with lockTime tomorrow
  await prisma.gameweek.update({
    where: { id: gw6.id },
    data: { status: 'ACTIVE', lockTime: tomorrow },
  })

  // Mark GW7+ as UPCOMING
  for (const gw of allGws.filter((g) => g.number > 6)) {
    await prisma.gameweek.update({
      where: { id: gw.id },
      data: { status: 'UPCOMING' },
    })
  }

  // Update matches in GW6 to have realistic dates and team names
  const gw6Matches = await prisma.match.findMany({
    where: { gameweekId: gw6.id },
    orderBy: { startingAt: 'asc' },
  })

  // IPL matchups for realism
  const matchups = [
    { local: 'Mumbai Indians', visitor: 'Chennai Super Kings', localId: 62, visitorId: 58 },
    { local: 'Royal Challengers Bengaluru', visitor: 'Kolkata Knight Riders', localId: 60, visitorId: 61 },
    { local: 'Delhi Capitals', visitor: 'Rajasthan Royals', localId: 59, visitorId: 63 },
    { local: 'Sunrisers Hyderabad', visitor: 'Gujarat Titans', localId: 64, visitorId: 4038 },
    { local: 'Lucknow Super Giants', visitor: 'Punjab Kings', localId: 4037, visitorId: 57 },
  ]

  // Schedule: first 2-3 yesterday/today (scored), rest tomorrow/day-after (scheduled)
  const dates = [
    { date: yesterday, scored: true },
    { date: today, scored: true },
    { date: today, scored: true },
    { date: tomorrow, scored: false },
    { date: dayAfter, scored: false },
  ]

  for (let i = 0; i < Math.min(gw6Matches.length, matchups.length); i++) {
    const match = gw6Matches[i]
    const matchup = matchups[i]
    const schedule = dates[i] || dates[dates.length - 1]

    // Set match time to 7:30 PM IST (14:00 UTC) on the given day
    const matchDate = new Date(schedule.date)
    matchDate.setUTCHours(14, 0, 0, 0)

    await prisma.match.update({
      where: { id: match.id },
      data: {
        localTeamName: matchup.local,
        visitorTeamName: matchup.visitor,
        localTeamId: matchup.localId,
        visitorTeamId: matchup.visitorId,
        startingAt: matchDate,
        scoringStatus: schedule.scored ? 'SCORED' : 'SCHEDULED',
        apiStatus: schedule.scored ? 'Finished' : 'NS',
      },
    })
  }

  // --- GW6 Lineups, PlayerScores, GameweekScores ---

  // Get all teams with their squads
  const league = await prisma.league.findFirst({
    where: { name: SIM_LEAGUE_NAME },
    include: {
      teams: {
        include: {
          teamPlayers: {
            include: { player: { select: { id: true, role: true } } },
          },
        },
      },
    },
  })

  if (!league) {
    log.push('Mid-season: league not found for GW6 scores, skipping')
    return
  }

  // Deterministic but varied score generator (seeded per player index)
  const baseScores = [72, 48, 35, 22, 56, 14, 41, 63, 28, 19, 50, 33, 67, 26, 45]

  for (const team of league.teams) {
    const squad = team.teamPlayers.map((tp) => ({
      id: tp.player.id,
      role: tp.player.role,
    }))

    if (squad.length < 11) {
      log.push(`Mid-season: ${team.name} has only ${squad.length} players, skipping GW6 scores`)
      continue
    }

    // Create lineup for GW6
    const slots = generateLineup(squad)
    const lineup = await prisma.lineup.upsert({
      where: { teamId_gameweekId: { teamId: team.id, gameweekId: gw6.id } },
      update: {},
      create: {
        teamId: team.id,
        gameweekId: gw6.id,
        slots: {
          create: slots.map((s) => ({
            playerId: s.playerId,
            slotType: s.slotType,
            benchPriority: s.benchPriority,
            role: s.role,
          })),
        },
      },
    })

    // Create PlayerScore records for each squad member
    let gwTotal = 0
    for (let i = 0; i < squad.length; i++) {
      const rawPoints = baseScores[i % baseScores.length]
      // Captain (index 0) gets 2x multiplier
      const isCaptain = i === 0
      const totalPoints = isCaptain ? rawPoints * 2 : rawPoints

      await prisma.playerScore.upsert({
        where: {
          playerId_gameweekId: {
            playerId: squad[i].id,
            gameweekId: gw6.id,
          },
        },
        update: { totalPoints },
        create: {
          playerId: squad[i].id,
          gameweekId: gw6.id,
          totalPoints,
        },
      })

      // Only XI players count toward the GW total
      if (i < 11) {
        gwTotal += totalPoints
      }
    }

    // Create GameweekScore
    await prisma.gameweekScore.upsert({
      where: {
        teamId_gameweekId: { teamId: team.id, gameweekId: gw6.id },
      },
      update: { totalPoints: gwTotal },
      create: {
        teamId: team.id,
        gameweekId: gw6.id,
        totalPoints: gwTotal,
      },
    })

    // Update team totalPoints
    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints: { increment: gwTotal } },
    })

    log.push(`Mid-season: ${team.name} GW6 lineup + scores (total: ${gwTotal})`)
  }

  log.push(
    `Mid-season: GW6 ACTIVE (${gw6Matches.length} matches), GW1-5 COMPLETED, GW7+ UPCOMING`
  )
}
