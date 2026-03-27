import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Setup mock state for Prisma methods
const mockState = {
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  teamPlayerFindMany: vi.fn(),
}

// Mock Prisma before any imports
vi.mock('@/lib/db', () => {
  const queryRawMock = vi.fn(async function(this: any, ...args: any[]) {
    const queryStr = args[0]?.[0] || ''
    if (queryStr.includes('pg_try_advisory_lock')) {
      return [{ pg_try_advisory_lock: true }]
    } else if (queryStr.includes('pg_advisory_unlock')) {
      return []
    }
    return []
  })

  return {
    prisma: {
      player: {
        findMany: (...args: any[]) => mockState.findMany(...args),
        create: (...args: any[]) => mockState.create(...args),
        update: (...args: any[]) => mockState.update(...args),
      },
      teamPlayer: {
        findMany: (...args: any[]) => mockState.teamPlayerFindMany(...args),
      },
      $queryRaw: queryRawMock,
    },
  }
})

// Mock SportMonks client
const mockFetch = vi.fn()
vi.mock('@/lib/sportmonks/client', () => ({
  sportmonks: {
    fetch: (...args: any[]) => mockFetch(...args),
  },
}))

// Import after mocks are set up
import { syncPlayerTeams } from '@/lib/sync-players'

describe('Sync Players - Unit Tests (AC4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('AC4.1: Dry-run returns team changes without modifying DB', async () => {
    const existingPlayer = {
      id: 'player-1',
      apiPlayerId: 100,
      fullname: 'Virat Kohli',
      iplTeamId: 8,
      iplTeamName: 'Royal Challengers Bengaluru',
      iplTeamCode: 'RCB',
      role: 'BAT',
    }

    mockState.findMany.mockResolvedValueOnce([existingPlayer])

    mockFetch.mockImplementation(async (path: string) => {
      if (path.includes('/teams/6/squad/')) {
        // Player now plays for MI (team.id = 6), previously RCB (iplTeamId = 8)
        return {
          squad: [
            {
              id: 100,
              fullname: 'Virat Kohli',
              firstname: 'Virat',
              lastname: 'Kohli',
              position: { name: 'batsman' },
              battingstyle: 'right-hand bat',
              bowlingstyle: null,
              image_path: 'image.jpg',
              dateofbirth: '1988-11-05',
            },
          ],
        }
      }
      // Other teams have no players
      return { squad: [] }
    })

    mockState.teamPlayerFindMany.mockResolvedValueOnce([
      { team: { name: 'Team A' }, playerId: 'player-1' },
      { team: { name: 'Team B' }, playerId: 'player-1' },
    ])

    const result = await syncPlayerTeams({ apply: false })

    // Should have team change
    expect(result.teamChanges).toHaveLength(1)
    expect(result.teamChanges[0]).toEqual({
      playerName: 'Virat Kohli',
      apiPlayerId: 100,
      oldTeam: 'RCB',
      newTeam: 'MI',
      fantasyTeams: ['Team A', 'Team B'],
    })

    // No players created or updated in dry-run
    expect(result.applied).toBe(false)
    expect(result.createdCount).toBe(0)
    expect(result.updatedCount).toBe(0)

    // Verify Prisma create/update were NOT called
    expect(mockState.create).not.toHaveBeenCalled()
    expect(mockState.update).not.toHaveBeenCalled()
  })

  it('AC4.2: Apply mode writes team changes to Player table', async () => {
    const existingPlayer = {
      id: 'player-1',
      apiPlayerId: 101,
      fullname: 'Rohit Sharma',
      iplTeamId: 8, // RCB
      iplTeamName: 'Royal Challengers Bengaluru',
      iplTeamCode: 'RCB',
      role: 'BAT',
    }

    mockState.findMany.mockResolvedValueOnce([existingPlayer])

    mockFetch.mockImplementation(async (path: string) => {
      if (path.includes('/teams/6/squad/')) {
        // Player moved to MI
        return {
          squad: [
            {
              id: 101,
              fullname: 'Rohit Sharma',
              firstname: 'Rohit',
              lastname: 'Sharma',
              position: { name: 'batsman' },
              battingstyle: 'right-hand bat',
              bowlingstyle: null,
              image_path: 'image.jpg',
              dateofbirth: '1987-04-30',
            },
          ],
        }
      }
      return { squad: [] }
    })

    mockState.teamPlayerFindMany.mockResolvedValueOnce([])
    mockState.update.mockResolvedValueOnce({ ...existingPlayer, iplTeamId: 6 })

    const result = await syncPlayerTeams({ apply: true })

    expect(result.applied).toBe(true)
    expect(result.updatedCount).toBe(1)
    expect(mockState.update).toHaveBeenCalledOnce()
    expect(mockState.update).toHaveBeenCalledWith({
      where: { apiPlayerId: 101 },
      data: expect.objectContaining({
        iplTeamId: 6,
        iplTeamName: 'Mumbai Indians',
        iplTeamCode: 'MI',
      }),
    })
  })

  it('AC4.3: Response includes fantasy teams affected by player changes', async () => {
    const existingPlayer = {
      id: 'player-1',
      apiPlayerId: 102,
      fullname: 'MS Dhoni',
      iplTeamId: 2, // CSK
      iplTeamName: 'Chennai Super Kings',
      iplTeamCode: 'CSK',
      role: 'WK',
    }

    mockState.findMany.mockResolvedValueOnce([existingPlayer])

    mockFetch.mockImplementation(async (path: string) => {
      if (path.includes('/teams/3/squad/')) {
        // Player moved to DC (id: 3)
        return {
          squad: [
            {
              id: 102,
              fullname: 'MS Dhoni',
              firstname: 'Mahendra Singh',
              lastname: 'Dhoni',
              position: { name: 'wicketkeeper' },
              battingstyle: 'right-hand bat',
              bowlingstyle: null,
              image_path: 'image.jpg',
              dateofbirth: '1981-07-07',
            },
          ],
        }
      }
      return { squad: [] }
    })

    mockState.teamPlayerFindMany.mockResolvedValueOnce([
      { team: { name: 'Fantasy Squad 1' }, playerId: 'player-1' },
      { team: { name: 'Fantasy Squad 2' }, playerId: 'player-1' },
      { team: { name: 'Fantasy Squad 3' }, playerId: 'player-1' },
    ])

    const result = await syncPlayerTeams({ apply: false })

    expect(result.teamChanges).toHaveLength(1)
    expect(result.teamChanges[0].fantasyTeams).toEqual([
      'Fantasy Squad 1',
      'Fantasy Squad 2',
      'Fantasy Squad 3',
    ])
  })

  it('AC4.5: Advisory lock prevents concurrent execution', async () => {
    // Override the default queryRaw mock to return false for lock
    const { prisma } = await import('@/lib/db')
    const originalQueryRaw = prisma.$queryRaw
    ;(prisma.$queryRaw as any) = vi.fn(async function(...args: any[]) {
      const queryStr = args[0]?.[0] || ''
      if (queryStr.includes('pg_try_advisory_lock')) {
        return [{ pg_try_advisory_lock: false }] // Lock failed
      }
      return []
    })

    mockState.findMany.mockResolvedValueOnce([])

    try {
      await expect(syncPlayerTeams({ apply: true })).rejects.toThrow('Sync already in progress')
    } finally {
      ;(prisma.$queryRaw as any) = originalQueryRaw
    }
  })

  it('detects new players not in DB', async () => {
    mockState.findMany.mockResolvedValueOnce([]) // No existing players

    mockFetch.mockImplementation(async (path: string) => {
      if (path.includes('/teams/6/squad/')) {
        return {
          squad: [
            {
              id: 200,
              fullname: 'New Player',
              firstname: 'New',
              lastname: 'Player',
              position: { name: 'bowler' },
              battingstyle: null,
              bowlingstyle: 'right-arm fast',
              image_path: null,
              dateofbirth: null,
            },
          ],
        }
      }
      return { squad: [] }
    })

    const result = await syncPlayerTeams({ apply: false })

    expect(result.newPlayers).toHaveLength(1)
    expect(result.newPlayers[0]).toEqual({
      playerName: 'New Player',
      iplTeamCode: 'MI',
    })
  })

  it('processes all 10 IPL teams without errors', async () => {
    // Verify the function loops through all teams and handles them gracefully
    mockState.findMany.mockResolvedValueOnce([])

    let fetchCallCount = 0
    mockFetch.mockImplementation(async (path: string) => {
      fetchCallCount++
      // Return empty squad for all teams
      return { squad: [] }
    })

    const result = await syncPlayerTeams({ apply: false })

    // Should call fetch 10 times (once for each IPL team)
    expect(fetchCallCount).toBe(10)
    // Should return empty lists when no players found
    expect(result.teamChanges).toHaveLength(0)
    expect(result.newPlayers).toHaveLength(0)
    expect(result.roleChanges).toHaveLength(0)
  })

  it('handles SportMonks API errors gracefully', async () => {
    mockState.findMany.mockResolvedValueOnce([])

    mockFetch.mockImplementation(async (path: string) => {
      throw new Error('API Error')
    })

    // Should not throw, but log warnings
    const result = await syncPlayerTeams({ apply: false })

    expect(result.teamChanges).toHaveLength(0)
    expect(result.newPlayers).toHaveLength(0)
  })
})
