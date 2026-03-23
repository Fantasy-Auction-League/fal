import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_SUFFIX = '@test.vitest'
const adminEmail = `roster-admin${TEST_SUFFIX}`
const manager1Email = `roster-mgr1${TEST_SUFFIX}`
const manager2Email = `roster-mgr2${TEST_SUFFIX}`
const manager3Email = `roster-mgr3${TEST_SUFFIX}`

let adminUser: { id: string }
let league: { id: string; adminUserId: string }
let testPlayers: { id: string; fullname: string }[] = []

beforeAll(async () => {
  // Clean any leftover test data
  await cleanup()

  // Create admin user
  adminUser = await prisma.user.create({
    data: { email: adminEmail, name: 'Roster Admin' },
  })

  // Create league
  league = await prisma.league.create({
    data: {
      name: 'Roster Test League',
      inviteCode: 'ROSTER-TEST-VITEST',
      adminUserId: adminUser.id,
      minSquadSize: 12,
      maxSquadSize: 15,
    },
  })

  // Create 30 test players (enough for 2 teams x 15)
  const playerData = Array.from({ length: 30 }, (_, i) => ({
    apiPlayerId: 900000 + i,
    fullname: `Test Player ${i + 1}`,
    iplTeamId: i < 15 ? 99901 : 99902,
    iplTeamName: i < 15 ? 'Test Team A' : 'Test Team B',
    role: (['BAT', 'BOWL', 'ALL', 'WK'] as const)[i % 4],
  }))

  for (const p of playerData) {
    const created = await prisma.player.create({ data: p })
    testPlayers.push({ id: created.id, fullname: created.fullname })
  }
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

async function cleanup() {
  // Delete in FK order
  const testEmails = [adminEmail, manager1Email, manager2Email, manager3Email]

  // Find leagues created by test admin
  const testUsers = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  })
  const testUserIds = testUsers.map((u) => u.id)

  if (testUserIds.length > 0) {
    const leagues = await prisma.league.findMany({
      where: { adminUserId: { in: testUserIds } },
      select: { id: true },
    })
    const leagueIds = leagues.map((l) => l.id)

    if (leagueIds.length > 0) {
      await prisma.teamPlayer.deleteMany({ where: { leagueId: { in: leagueIds } } })
      await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } })
      await prisma.league.deleteMany({ where: { id: { in: leagueIds } } })
    }
  }

  // Delete test users
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } })

  // Delete test players
  await prisma.player.deleteMany({
    where: { apiPlayerId: { gte: 900000, lt: 900100 } },
  })
}

/**
 * Simulate the roster upload logic (source-of-truth behavior) extracted
 * from the API route. We test the DB layer directly, not HTTP.
 */
async function simulateRosterUpload(
  leagueId: string,
  teams: Array<{
    managerEmail: string
    teamName: string
    playerNames: string[]
    purchasePrice?: number
  }>
): Promise<{ errors: string[]; teamsCreated: number }> {
  const errors: string[] = []
  const globalPlayerSet = new Set<string>()

  type TeamInsertData = {
    userId: string
    teamName: string
    players: { playerId: string; price: number }[]
  }
  const teamsToInsert: TeamInsertData[] = []

  const leagueRecord = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!leagueRecord) throw new Error('League not found')

  // Resolve all players
  const allNames = teams.flatMap((t) => t.playerNames)
  const dbPlayers = await prisma.player.findMany({
    where: { fullname: { in: allNames, mode: 'insensitive' } },
  })
  const playerLookup = new Map(dbPlayers.map((p) => [p.fullname.toLowerCase(), p]))

  for (const team of teams) {
    let user = await prisma.user.findUnique({
      where: { email: team.managerEmail },
    })
    if (!user) {
      user = await prisma.user.create({
        data: { email: team.managerEmail, name: team.managerEmail.split('@')[0] },
      })
    }

    const resolvedPlayers: { playerId: string; price: number }[] = []

    for (const name of team.playerNames) {
      const dbPlayer = playerLookup.get(name.toLowerCase())
      if (!dbPlayer) {
        errors.push(`Player not found: "${name}" (team: ${team.teamName})`)
        continue
      }
      if (globalPlayerSet.has(dbPlayer.id)) {
        errors.push(`Duplicate player across teams: "${name}"`)
        continue
      }
      globalPlayerSet.add(dbPlayer.id)
      resolvedPlayers.push({ playerId: dbPlayer.id, price: team.purchasePrice ?? 0 })
    }

    if (resolvedPlayers.length < leagueRecord.minSquadSize) {
      errors.push(
        `${team.teamName}: squad size ${resolvedPlayers.length} is below minimum ${leagueRecord.minSquadSize}`
      )
      continue
    }
    if (resolvedPlayers.length > leagueRecord.maxSquadSize) {
      errors.push(
        `${team.teamName}: squad size ${resolvedPlayers.length} exceeds maximum ${leagueRecord.maxSquadSize}`
      )
      continue
    }

    teamsToInsert.push({
      userId: user.id,
      teamName: team.teamName,
      players: resolvedPlayers,
    })
  }

  if (errors.length > 0) {
    return { errors, teamsCreated: 0 }
  }

  // Source of truth: wipe and rebuild
  await prisma.$transaction(async (tx) => {
    await tx.teamPlayer.deleteMany({ where: { leagueId } })
    await tx.team.deleteMany({ where: { leagueId } })

    for (const teamData of teamsToInsert) {
      const team = await tx.team.create({
        data: {
          name: teamData.teamName,
          userId: teamData.userId,
          leagueId,
        },
      })

      await tx.teamPlayer.createMany({
        data: teamData.players.map((p) => ({
          teamId: team.id,
          playerId: p.playerId,
          leagueId,
          purchasePrice: p.price,
        })),
      })
    }
  })

  return { errors: [], teamsCreated: teamsToInsert.length }
}

describe('Roster Upload (source-of-truth)', () => {
  it('should upload 2 teams x 15 players', async () => {
    const team1Players = testPlayers.slice(0, 15).map((p) => p.fullname)
    const team2Players = testPlayers.slice(15, 30).map((p) => p.fullname)

    const result = await simulateRosterUpload(league.id, [
      { managerEmail: manager1Email, teamName: 'Team Alpha', playerNames: team1Players },
      { managerEmail: manager2Email, teamName: 'Team Beta', playerNames: team2Players },
    ])

    expect(result.errors).toHaveLength(0)
    expect(result.teamsCreated).toBe(2)

    const teams = await prisma.team.findMany({ where: { leagueId: league.id } })
    expect(teams).toHaveLength(2)

    const teamPlayers = await prisma.teamPlayer.findMany({ where: { leagueId: league.id } })
    expect(teamPlayers).toHaveLength(30)
  })

  it('should re-upload with different CSV: old teams deleted, new teams created', async () => {
    // First get existing team IDs
    const oldTeams = await prisma.team.findMany({ where: { leagueId: league.id } })
    const oldTeamIds = oldTeams.map((t) => t.id)

    // Re-upload with same players but different team names
    const team1Players = testPlayers.slice(0, 15).map((p) => p.fullname)
    const team2Players = testPlayers.slice(15, 30).map((p) => p.fullname)

    const result = await simulateRosterUpload(league.id, [
      { managerEmail: manager1Email, teamName: 'Team Alpha V2', playerNames: team1Players },
      { managerEmail: manager2Email, teamName: 'Team Beta V2', playerNames: team2Players },
    ])

    expect(result.errors).toHaveLength(0)

    const newTeams = await prisma.team.findMany({ where: { leagueId: league.id } })
    expect(newTeams).toHaveLength(2)

    // Old team IDs should no longer exist
    for (const oldId of oldTeamIds) {
      const found = newTeams.find((t) => t.id === oldId)
      expect(found).toBeUndefined()
    }

    // New names should be present
    const names = newTeams.map((t) => t.name).sort()
    expect(names).toEqual(['Team Alpha V2', 'Team Beta V2'])
  })

  it('should re-upload with fewer teams: only new teams exist, no ghosts', async () => {
    // Upload only 1 team
    const team1Players = testPlayers.slice(0, 15).map((p) => p.fullname)

    const result = await simulateRosterUpload(league.id, [
      { managerEmail: manager1Email, teamName: 'Solo Team', playerNames: team1Players },
    ])

    expect(result.errors).toHaveLength(0)
    expect(result.teamsCreated).toBe(1)

    const teams = await prisma.team.findMany({ where: { leagueId: league.id } })
    expect(teams).toHaveLength(1)
    expect(teams[0].name).toBe('Solo Team')

    const teamPlayers = await prisma.teamPlayer.findMany({ where: { leagueId: league.id } })
    expect(teamPlayers).toHaveLength(15)
  })

  it('should reject duplicate player across teams', async () => {
    const sharedPlayer = testPlayers[0].fullname
    const team1Players = [sharedPlayer, ...testPlayers.slice(1, 15).map((p) => p.fullname)]
    const team2Players = [sharedPlayer, ...testPlayers.slice(16, 30).map((p) => p.fullname)]

    const result = await simulateRosterUpload(league.id, [
      { managerEmail: manager1Email, teamName: 'Dup Team A', playerNames: team1Players },
      { managerEmail: manager2Email, teamName: 'Dup Team B', playerNames: team2Players },
    ])

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.includes('Duplicate player'))).toBe(true)
    expect(result.teamsCreated).toBe(0)
  })

  it('should reject player not found', async () => {
    const team1Players = [
      'Nonexistent Player XYZ',
      ...testPlayers.slice(1, 15).map((p) => p.fullname),
    ]

    const result = await simulateRosterUpload(league.id, [
      { managerEmail: manager1Email, teamName: 'Bad Team', playerNames: team1Players },
    ])

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.includes('Player not found'))).toBe(true)
  })

  it('should reject squad too small (< 12)', async () => {
    // Only 10 players
    const team1Players = testPlayers.slice(0, 10).map((p) => p.fullname)

    const result = await simulateRosterUpload(league.id, [
      { managerEmail: manager1Email, teamName: 'Small Team', playerNames: team1Players },
    ])

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.includes('below minimum'))).toBe(true)
    expect(result.teamsCreated).toBe(0)
  })

  it('should keep admin unchanged after upload', async () => {
    const team1Players = testPlayers.slice(0, 15).map((p) => p.fullname)

    await simulateRosterUpload(league.id, [
      { managerEmail: manager3Email, teamName: 'Manager3 Team', playerNames: team1Players },
    ])

    const updatedLeague = await prisma.league.findUnique({ where: { id: league.id } })
    expect(updatedLeague!.adminUserId).toBe(adminUser.id)
  })
})
