import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SportMonksFixture } from '@/lib/sportmonks/types'

// Create a shared object that will be populated with mocks
const mockState = {
  findMany: vi.fn(),
  update: vi.fn(),
}

// Before any imports, set up module mocks - they will use the mockState object
vi.mock('@/lib/db', () => ({
  prisma: {
    match: {
      findMany: (...args: any[]) => mockState.findMany(...args),
      update: (...args: any[]) => mockState.update(...args),
    },
  },
}))

// Stub global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after all mocks are set up
import { syncMatchStatuses } from '@/lib/sportmonks/match-sync'

describe('Match Status Sync - Unit Tests (AC2 Status Mapping)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.findMany.mockClear()
    mockState.update.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('AC2.1: SCHEDULED match with SportMonks status "Finished" transitions to COMPLETED', async () => {
    const mockMatches = [
      {
        id: 'match-1',
        apiMatchId: 1001,
        localTeamName: 'Team A',
        visitorTeamName: 'Team B',
      },
    ]

    mockState.findMany.mockResolvedValueOnce(mockMatches)

    const mockFixture: SportMonksFixture = {
      id: 1001,
      league_id: 4652,
      season_id: 23453,
      stage_id: 77083360,
      round: '1',
      localteam_id: 113,
      visitorteam_id: 116,
      starting_at: '2025-03-22T14:00:00Z',
      type: 'T20',
      status: 'Finished',
      note: 'Team A won by 5 wickets',
      winner_team_id: 113,
      toss_won_team_id: 116,
      elected: 'bat',
      man_of_match_id: 5678,
      super_over: false,
      total_overs_played: 20,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockFixture }),
    })

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(1)
    expect(result.transitioned).toBe(1)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({
      apiMatchId: 1001,
      oldStatus: 'SCHEDULED',
      newStatus: 'COMPLETED',
      teams: 'Team A vs Team B',
    })

    expect(mockState.update).toHaveBeenCalledOnce()
    expect(mockState.update).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: {
        scoringStatus: 'COMPLETED',
        apiStatus: 'Finished',
        note: 'Team A won by 5 wickets',
        winnerTeamId: 113,
        superOver: false,
      },
    })
  })

  it('AC2.2: SCHEDULED match with SportMonks status "Cancl." transitions to CANCELLED', async () => {
    const mockMatches = [
      {
        id: 'match-2',
        apiMatchId: 1002,
        localTeamName: 'Team C',
        visitorTeamName: 'Team D',
      },
    ]

    mockState.findMany.mockResolvedValueOnce(mockMatches)

    const mockFixture: SportMonksFixture = {
      id: 1002,
      league_id: 4652,
      season_id: 23453,
      stage_id: 77083360,
      round: '2',
      localteam_id: 113,
      visitorteam_id: 116,
      starting_at: '2025-03-23T14:00:00Z',
      type: 'T20',
      status: 'Cancl.',
      note: 'Match cancelled due to weather',
      winner_team_id: null,
      toss_won_team_id: null,
      elected: null,
      man_of_match_id: null,
      super_over: false,
      total_overs_played: null,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockFixture }),
    })

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(1)
    expect(result.transitioned).toBe(1)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({
      apiMatchId: 1002,
      oldStatus: 'SCHEDULED',
      newStatus: 'CANCELLED',
      teams: 'Team C vs Team D',
    })

    expect(mockState.update).toHaveBeenCalledOnce()
  })

  it('AC2.2: SCHEDULED match with SportMonks status "Aban." transitions to CANCELLED', async () => {
    const mockMatches = [
      {
        id: 'match-3',
        apiMatchId: 1003,
        localTeamName: 'Team E',
        visitorTeamName: 'Team F',
      },
    ]

    mockState.findMany.mockResolvedValueOnce(mockMatches)

    const mockFixture: SportMonksFixture = {
      id: 1003,
      league_id: 4652,
      season_id: 23453,
      stage_id: 77083360,
      round: '3',
      localteam_id: 113,
      visitorteam_id: 116,
      starting_at: '2025-03-24T14:00:00Z',
      type: 'T20',
      status: 'Aban.',
      note: 'Match abandoned',
      winner_team_id: null,
      toss_won_team_id: null,
      elected: null,
      man_of_match_id: null,
      super_over: false,
      total_overs_played: null,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockFixture }),
    })

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(1)
    expect(result.transitioned).toBe(1)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({
      apiMatchId: 1003,
      oldStatus: 'SCHEDULED',
      newStatus: 'CANCELLED',
      teams: 'Team E vs Team F',
    })

    expect(mockState.update).toHaveBeenCalledOnce()
  })

  it('SCHEDULED match with SportMonks status "NS" remains SCHEDULED (no update)', async () => {
    const mockMatches = [
      {
        id: 'match-4',
        apiMatchId: 1004,
        localTeamName: 'Team G',
        visitorTeamName: 'Team H',
      },
    ]

    mockState.findMany.mockResolvedValueOnce(mockMatches)

    const mockFixture: SportMonksFixture = {
      id: 1004,
      league_id: 4652,
      season_id: 23453,
      stage_id: 77083360,
      round: '4',
      localteam_id: 113,
      visitorteam_id: 116,
      starting_at: '2025-03-25T14:00:00Z',
      type: 'T20',
      status: 'NS',
      note: null,
      winner_team_id: null,
      toss_won_team_id: null,
      elected: null,
      man_of_match_id: null,
      super_over: false,
      total_overs_played: null,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockFixture }),
    })

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(1)
    expect(result.transitioned).toBe(0)
    expect(result.changes).toHaveLength(0)
    expect(mockState.update).not.toHaveBeenCalled()
  })

  it('handles multiple SCHEDULED matches with mixed status transitions', async () => {
    const mockMatches = [
      {
        id: 'match-5',
        apiMatchId: 1005,
        localTeamName: 'Team I',
        visitorTeamName: 'Team J',
      },
      {
        id: 'match-6',
        apiMatchId: 1006,
        localTeamName: 'Team K',
        visitorTeamName: 'Team L',
      },
      {
        id: 'match-7',
        apiMatchId: 1007,
        localTeamName: 'Team M',
        visitorTeamName: 'Team N',
      },
    ]

    mockState.findMany.mockResolvedValueOnce(mockMatches)

    const fixtures: Record<number, SportMonksFixture> = {
      1005: {
        id: 1005,
        league_id: 4652,
        season_id: 23453,
        stage_id: 77083360,
        round: '5',
        localteam_id: 113,
        visitorteam_id: 116,
        starting_at: '2025-03-26T14:00:00Z',
        type: 'T20',
        status: 'Finished',
        note: 'Team I won by 3 runs',
        winner_team_id: 113,
        toss_won_team_id: 116,
        elected: 'bat',
        man_of_match_id: 5678,
        super_over: false,
        total_overs_played: 40,
      },
      1006: {
        id: 1006,
        league_id: 4652,
        season_id: 23453,
        stage_id: 77083360,
        round: '6',
        localteam_id: 113,
        visitorteam_id: 116,
        starting_at: '2025-03-27T14:00:00Z',
        type: 'T20',
        status: 'Cancl.',
        note: 'Match cancelled',
        winner_team_id: null,
        toss_won_team_id: null,
        elected: null,
        man_of_match_id: null,
        super_over: false,
        total_overs_played: null,
      },
      1007: {
        id: 1007,
        league_id: 4652,
        season_id: 23453,
        stage_id: 77083360,
        round: '7',
        localteam_id: 113,
        visitorteam_id: 116,
        starting_at: '2025-03-28T14:00:00Z',
        type: 'T20',
        status: 'InProgress',
        note: null,
        winner_team_id: null,
        toss_won_team_id: null,
        elected: null,
        man_of_match_id: null,
        super_over: false,
        total_overs_played: null,
      },
    }

    mockFetch.mockImplementation(async () => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      if (!lastCall || !lastCall[0]) return { ok: false }

      const url = new URL(lastCall[0])
      const pathMatch = url.pathname.match(/\/fixtures\/(\d+)/)
      if (!pathMatch) return { ok: false }

      const matchId = parseInt(pathMatch[1], 10)
      const fixture = fixtures[matchId]

      if (!fixture) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }
      }

      return {
        ok: true,
        json: async () => ({ data: fixture }),
      }
    })

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(3)
    expect(result.transitioned).toBe(2)
    expect(result.changes).toHaveLength(2)

    expect(result.changes[0]).toEqual({
      apiMatchId: 1005,
      oldStatus: 'SCHEDULED',
      newStatus: 'COMPLETED',
      teams: 'Team I vs Team J',
    })

    expect(result.changes[1]).toEqual({
      apiMatchId: 1006,
      oldStatus: 'SCHEDULED',
      newStatus: 'CANCELLED',
      teams: 'Team K vs Team L',
    })

    expect(mockState.update).toHaveBeenCalledTimes(2)
  })

  it('handles SportMonks API errors gracefully', async () => {
    const mockMatches = [
      {
        id: 'match-8',
        apiMatchId: 1008,
        localTeamName: 'Team O',
        visitorTeamName: 'Team P',
      },
      {
        id: 'match-9',
        apiMatchId: 1009,
        localTeamName: 'Team Q',
        visitorTeamName: 'Team R',
      },
    ]

    mockState.findMany.mockResolvedValueOnce(mockMatches)

    mockFetch.mockImplementation(async () => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      if (!lastCall || !lastCall[0]) return { ok: false }

      const url = new URL(lastCall[0])
      const pathMatch = url.pathname.match(/\/fixtures\/(\d+)/)
      if (!pathMatch) return { ok: false }

      const matchId = parseInt(pathMatch[1], 10)

      if (matchId === 1008) {
        // Simulate API error
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }
      }

      // 1009 succeeds
      if (matchId === 1009) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: 1009,
              league_id: 4652,
              season_id: 23453,
              stage_id: 77083360,
              round: '8',
              localteam_id: 113,
              visitorteam_id: 116,
              starting_at: '2025-03-29T14:00:00Z',
              type: 'T20',
              status: 'Finished',
              note: 'Team Q won by 2 wickets',
              winner_team_id: 117,
              toss_won_team_id: 116,
              elected: 'bowl',
              man_of_match_id: 1234,
              super_over: false,
              total_overs_played: 40,
            } as SportMonksFixture,
          }),
        }
      }

      return { ok: false }
    })

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(2)
    expect(result.transitioned).toBe(1)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].apiMatchId).toBe(1009)
    expect(mockState.update).toHaveBeenCalledOnce()
  })

  it('returns empty result when no SCHEDULED matches exist', async () => {
    mockState.findMany.mockResolvedValueOnce([])

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(0)
    expect(result.transitioned).toBe(0)
    expect(result.changes).toHaveLength(0)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockState.update).not.toHaveBeenCalled()
  })
})
