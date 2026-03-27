import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth to return app admin
const mockAuthAppAdmin = vi.fn(async () => ({
  user: {
    id: 'app-admin-user-id',
    email: 'appadmin@test.vitest.scoringapi',
    isAppAdmin: true,
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// Mock the scoring dependencies
vi.mock('@/lib/sportmonks/match-sync', () => ({
  syncMatchStatuses: vi.fn(),
}))

vi.mock('@/lib/scoring/pipeline', () => ({
  runScoringPipeline: vi.fn(),
}))

// Mock environment variable for cron secret
vi.stubEnv('CRON_SECRET', 'test-cron-secret')

describe('Scoring Import API Response (AC2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC2.3: API response includes matchesTransitioned field', async () => {
    // Mock auth() to return an app-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthAppAdmin as any)

    // Mock syncMatchStatuses to return controlled values
    const { syncMatchStatuses } = await import(
      '@/lib/sportmonks/match-sync'
    )
    vi.mocked(syncMatchStatuses).mockResolvedValueOnce({
      checked: 10,
      transitioned: 3,
      changes: [
        {
          apiMatchId: 123,
          oldStatus: 'SCHEDULED',
          newStatus: 'COMPLETED',
          teams: 'Team A vs Team B',
        },
      ],
    })

    // Mock runScoringPipeline to return controlled values
    const { runScoringPipeline } = await import('@/lib/scoring/pipeline')
    vi.mocked(runScoringPipeline).mockResolvedValueOnce({
      matchesScored: 2,
      matchesFailed: 0,
      gwAggregated: false,
      errors: [],
    })

    const { POST } = await import('@/app/api/scoring/import/route')

    // Call POST handler
    const response = await POST()

    // Verify 200 status (app admin is allowed)
    expect(response.status).toBe(200)

    const json = await response.json()

    // Verify matchesTransitioned field is present
    expect(json).toHaveProperty('matchesTransitioned')
    expect(json.matchesTransitioned).toBe(3)

    // Also verify other expected fields from PipelineResult
    expect(json).toHaveProperty('matchesScored')
    expect(json.matchesScored).toBe(2)

    expect(json).toHaveProperty('matchesFailed')
    expect(json.matchesFailed).toBe(0)

    expect(json).toHaveProperty('gwAggregated')
    expect(json.gwAggregated).toBe(false)

    expect(json).toHaveProperty('statusChanges')
    expect(Array.isArray(json.statusChanges)).toBe(true)
  })

  it('AC2.3: API response includes all response fields from both sync and pipeline', async () => {
    // Mock auth() to return an app-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthAppAdmin as any)

    // Mock syncMatchStatuses with empty changes
    const { syncMatchStatuses } = await import(
      '@/lib/sportmonks/match-sync'
    )
    vi.mocked(syncMatchStatuses).mockResolvedValueOnce({
      checked: 5,
      transitioned: 0,
      changes: [],
    })

    // Mock runScoringPipeline with actual results
    const { runScoringPipeline } = await import('@/lib/scoring/pipeline')
    vi.mocked(runScoringPipeline).mockResolvedValueOnce({
      matchesScored: 5,
      matchesFailed: 1,
      gwAggregated: true,
      errors: ['Match 456: some error'],
    })

    const { POST } = await import('@/app/api/scoring/import/route')

    // Call POST handler
    const response = await POST()

    expect(response.status).toBe(200)

    const json = await response.json()

    // Verify all fields are merged correctly
    expect(json.matchesScored).toBe(5)
    expect(json.matchesFailed).toBe(1)
    expect(json.gwAggregated).toBe(true)
    expect(json.errors).toEqual(['Match 456: some error'])
    expect(json.matchesTransitioned).toBe(0)
    expect(json.statusChanges).toEqual([])
  })
})

describe('Scoring Cron API Response (AC2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC2.3 partial: Cron route response includes matchesTransitioned', async () => {
    // Mock syncMatchStatuses
    const { syncMatchStatuses } = await import(
      '@/lib/sportmonks/match-sync'
    )
    vi.mocked(syncMatchStatuses).mockResolvedValueOnce({
      checked: 10,
      transitioned: 4,
      changes: [
        {
          apiMatchId: 123,
          oldStatus: 'SCHEDULED',
          newStatus: 'COMPLETED',
          teams: 'Team A vs Team B',
        },
      ],
    })

    // Mock runScoringPipeline
    const { runScoringPipeline } = await import('@/lib/scoring/pipeline')
    vi.mocked(runScoringPipeline).mockResolvedValueOnce({
      matchesScored: 2,
      matchesFailed: 0,
      gwAggregated: false,
      errors: [],
    })

    const { GET } = await import('@/app/api/scoring/cron/route')

    // Call GET handler with proper authorization header
    const response = await GET(
      new Request('http://localhost:3000/api/scoring/cron', {
        method: 'GET',
        headers: {
          authorization: `Bearer test-cron-secret`,
        },
      })
    )

    // Verify 200 status
    expect(response.status).toBe(200)

    const json = await response.json()

    // Verify matchesTransitioned field is present and correct
    expect(json).toHaveProperty('matchesTransitioned')
    expect(json.matchesTransitioned).toBe(4)

    // Verify pipeline results are also included
    expect(json).toHaveProperty('matchesScored')
    expect(json.matchesScored).toBe(2)

    expect(json).toHaveProperty('matchesFailed')
    expect(json.matchesFailed).toBe(0)

    expect(json).toHaveProperty('gwAggregated')
    expect(json.gwAggregated).toBe(false)
  })
})
