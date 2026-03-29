import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SportMonksFixture } from '@/lib/sportmonks/types'

// Create a shared object that will be populated with mocks
const mockState = {
  findMany: vi.fn(),
  update: vi.fn(),
  sportmonksFetch: vi.fn(),
}

// Before any imports, set up module mocks
vi.mock('@/lib/db', () => ({
  prisma: {
    match: {
      findMany: (...args: any[]) => mockState.findMany(...args),
      update: (...args: any[]) => mockState.update(...args),
    },
  },
}))

// Mock the sportmonks client to avoid SPORTMONKS_API_TOKEN requirement in CI
vi.mock('@/lib/sportmonks/client', () => ({
  sportmonks: {
    fetch: (...args: any[]) => mockState.sportmonksFetch(...args),
  },
  SportMonksClient: vi.fn(),
  getSportMonksClient: vi.fn(),
}))

// Import after all mocks are set up
import { syncMatchStatuses } from '@/lib/sportmonks/match-sync'

function makeFixture(overrides: Partial<SportMonksFixture> & { id: number; status: string }): SportMonksFixture {
  return {
    league_id: 4652,
    season_id: 23453,
    stage_id: 77083360,
    round: '1',
    localteam_id: 113,
    visitorteam_id: 116,
    starting_at: '2025-03-22T14:00:00Z',
    type: 'T20',
    note: null,
    winner_team_id: null,
    toss_won_team_id: null,
    elected: null,
    man_of_match_id: null,
    super_over: false,
    total_overs_played: null,
    ...overrides,
  }
}

describe('Match Status Sync - Unit Tests (AC2 Status Mapping)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('AC2.1: SCHEDULED match with SportMonks status "Finished" transitions to COMPLETED', async () => {
    mockState.findMany.mockResolvedValueOnce([
      { id: 'match-1', apiMatchId: 1001, localTeamName: 'Team A', visitorTeamName: 'Team B', scoringStatus: 'SCHEDULED' },
    ])

    mockState.sportmonksFetch.mockResolvedValueOnce(
      makeFixture({ id: 1001, status: 'Finished', note: 'Team A won by 5 wickets', winner_team_id: 113, super_over: false })
    )

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
    mockState.findMany.mockResolvedValueOnce([
      { id: 'match-2', apiMatchId: 1002, localTeamName: 'Team C', visitorTeamName: 'Team D', scoringStatus: 'SCHEDULED' },
    ])

    mockState.sportmonksFetch.mockResolvedValueOnce(
      makeFixture({ id: 1002, status: 'Cancl.', note: 'Match cancelled due to weather' })
    )

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
    mockState.findMany.mockResolvedValueOnce([
      { id: 'match-3', apiMatchId: 1003, localTeamName: 'Team E', visitorTeamName: 'Team F', scoringStatus: 'SCHEDULED' },
    ])

    mockState.sportmonksFetch.mockResolvedValueOnce(
      makeFixture({ id: 1003, status: 'Aban.', note: 'Match abandoned' })
    )

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
    mockState.findMany.mockResolvedValueOnce([
      { id: 'match-4', apiMatchId: 1004, localTeamName: 'Team G', visitorTeamName: 'Team H', scoringStatus: 'SCHEDULED' },
    ])

    mockState.sportmonksFetch.mockResolvedValueOnce(
      makeFixture({ id: 1004, status: 'NS' })
    )

    const result = await syncMatchStatuses()

    expect(result.checked).toBe(1)
    expect(result.transitioned).toBe(0)
    expect(result.changes).toHaveLength(0)
    expect(mockState.update).not.toHaveBeenCalled()
  })

  it('handles multiple SCHEDULED matches with mixed status transitions', async () => {
    mockState.findMany.mockResolvedValueOnce([
      { id: 'match-5', apiMatchId: 1005, localTeamName: 'Team I', visitorTeamName: 'Team J', scoringStatus: 'SCHEDULED' },
      { id: 'match-6', apiMatchId: 1006, localTeamName: 'Team K', visitorTeamName: 'Team L', scoringStatus: 'SCHEDULED' },
      { id: 'match-7', apiMatchId: 1007, localTeamName: 'Team M', visitorTeamName: 'Team N', scoringStatus: 'SCHEDULED' },
    ])

    // Return fixtures in order of calls
    mockState.sportmonksFetch
      .mockResolvedValueOnce(makeFixture({ id: 1005, status: 'Finished', note: 'Team I won by 3 runs', winner_team_id: 113, super_over: false }))
      .mockResolvedValueOnce(makeFixture({ id: 1006, status: 'Cancl.', note: 'Match cancelled' }))
      .mockResolvedValueOnce(makeFixture({ id: 1007, status: 'InProgress' }))

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
    mockState.findMany.mockResolvedValueOnce([
      { id: 'match-8', apiMatchId: 1008, localTeamName: 'Team O', visitorTeamName: 'Team P', scoringStatus: 'SCHEDULED' },
      { id: 'match-9', apiMatchId: 1009, localTeamName: 'Team Q', visitorTeamName: 'Team R', scoringStatus: 'SCHEDULED' },
    ])

    // First call throws, second succeeds
    mockState.sportmonksFetch
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce(makeFixture({ id: 1009, status: 'Finished', note: 'Team Q won by 2 wickets', winner_team_id: 117, super_over: false }))

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
    expect(mockState.sportmonksFetch).not.toHaveBeenCalled()
    expect(mockState.update).not.toHaveBeenCalled()
  })
})
