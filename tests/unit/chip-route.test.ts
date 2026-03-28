import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock state — must be declared before vi.mock() calls
const mockState = {
  auth: vi.fn(),
  team: {
    findUnique: vi.fn(),
  },
  gameweek: {
    findUnique: vi.fn(),
  },
  chipUsage: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}

vi.mock('@/lib/auth', () => ({
  auth: (...args: any[]) => mockState.auth(...args),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    team: {
      findUnique: (...args: any[]) => mockState.team.findUnique(...args),
    },
    gameweek: {
      findUnique: (...args: any[]) => mockState.gameweek.findUnique(...args),
    },
    chipUsage: {
      findUnique: (...args: any[]) => mockState.chipUsage.findUnique(...args),
      findFirst: (...args: any[]) => mockState.chipUsage.findFirst(...args),
      create: (...args: any[]) => mockState.chipUsage.create(...args),
      delete: (...args: any[]) => mockState.chipUsage.delete(...args),
    },
  },
}))

vi.mock('@/lib/lineup/lock', () => ({
  isGameweekLocked: vi.fn().mockReturnValue(false),
}))

import { POST } from '@/app/api/teams/[teamId]/lineups/[gameweekId]/chip/route'

// Helper to create a mock Request with JSON body
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/teams/t1/lineups/gw1/chip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Helper to build route params (Next.js 15 style: Promise)
function makeParams(teamId: string, gameweekId: string) {
  return { params: Promise.resolve({ teamId, gameweekId }) }
}

const TEAM_ID = 'team-1'
const GW_ID = 'gw-1'
const USER_ID = 'user-1'

describe('POST /api/teams/[teamId]/lineups/[gameweekId]/chip', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default happy-path mocks
    mockState.auth.mockResolvedValue({ user: { id: USER_ID } })
    mockState.team.findUnique.mockResolvedValue({ id: TEAM_ID, userId: USER_ID })
    mockState.gameweek.findUnique.mockResolvedValue({ id: GW_ID, lockTime: null })
    mockState.chipUsage.findUnique.mockResolvedValue(null) // chip not yet used this season
    mockState.chipUsage.findFirst.mockResolvedValue(null)  // no pending chip for this GW
    mockState.chipUsage.create.mockResolvedValue({
      id: 'cu-1',
      teamId: TEAM_ID,
      chipType: 'POWER_PLAY_BAT',
      gameweekId: GW_ID,
      status: 'PENDING',
    })
  })

  it('returns 409 when a different chip is already PENDING for the same gameweek', async () => {
    // BOWLING_BOOST is already pending for this GW
    mockState.chipUsage.findFirst.mockResolvedValue({
      id: 'cu-existing',
      teamId: TEAM_ID,
      chipType: 'BOWLING_BOOST',
      gameweekId: GW_ID,
      status: 'PENDING',
    })

    const req = makeRequest({ chipType: 'POWER_PLAY_BAT' })
    const res = await POST(req, makeParams(TEAM_ID, GW_ID))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('BOWLING_BOOST')
    expect(body.error).toContain('Deactivate it first')
  })

  it('error message mentions the existing chip type', async () => {
    mockState.chipUsage.findFirst.mockResolvedValue({
      id: 'cu-existing',
      teamId: TEAM_ID,
      chipType: 'POWER_PLAY_BAT',
      gameweekId: GW_ID,
      status: 'PENDING',
    })

    const req = makeRequest({ chipType: 'BOWLING_BOOST' })
    const res = await POST(req, makeParams(TEAM_ID, GW_ID))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/POWER_PLAY_BAT/)
  })

  it('returns 200 when activating after the previous chip has been deleted (swap scenario)', async () => {
    // findFirst returns null — previous chip was deleted
    mockState.chipUsage.findFirst.mockResolvedValue(null)

    const req = makeRequest({ chipType: 'BOWLING_BOOST' })
    const res = await POST(req, makeParams(TEAM_ID, GW_ID))

    expect(res.status).toBe(200)
    expect(mockState.chipUsage.create).toHaveBeenCalledOnce()
  })

  it('returns 409 when the same chip type was already used this season (existing check)', async () => {
    // findUnique returns a record — chip already used in a different GW
    mockState.chipUsage.findUnique.mockResolvedValue({
      id: 'cu-old',
      teamId: TEAM_ID,
      chipType: 'POWER_PLAY_BAT',
      gameweekId: 'gw-prev',
      status: 'USED',
    })

    const req = makeRequest({ chipType: 'POWER_PLAY_BAT' })
    const res = await POST(req, makeParams(TEAM_ID, GW_ID))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('already been used this season')
    // The concurrent-chip check should NOT have been reached
    expect(mockState.chipUsage.findFirst).not.toHaveBeenCalled()
  })

  it('creates the chip usage record when all checks pass', async () => {
    const req = makeRequest({ chipType: 'POWER_PLAY_BAT' })
    const res = await POST(req, makeParams(TEAM_ID, GW_ID))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.chipUsage).toBeDefined()
    expect(body.chipUsage.chipType).toBe('POWER_PLAY_BAT')
  })
})
