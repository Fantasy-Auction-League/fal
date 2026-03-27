import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth at the top level
const mockAuthNonAdmin = vi.fn(async () => ({
  user: {
    id: 'non-admin-user-id',
    email: 'nonadmin@test.vitest.scoring',
    isAppAdmin: false,
  },
}))

const mockAuthLeagueAdmin = vi.fn(async () => ({
  user: {
    id: 'league-admin-user-id',
    email: 'leagueadmin@test.vitest.scoring',
    isAppAdmin: false,
    role: 'ADMIN',
  },
}))

const mockAuthAppAdmin = vi.fn(async () => ({
  user: {
    id: 'app-admin-user-id',
    email: 'appadmin@test.vitest.scoring',
    isAppAdmin: true,
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

describe('Scoring Import API - Access Control (AC1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC1.3: Non-app-admin user receives 403 on POST', async () => {
    // Mock auth() to return a non-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthNonAdmin as any)

    const { POST } = await import('@/app/api/scoring/import/route')

    // Call POST handler
    const response = await POST()

    // Verify 403 status
    expect(response.status).toBe(403)

    const json = await response.json()
    expect(json.error).toBe('Forbidden')
  })

  it('AC1.3: League admin user receives 403 on POST', async () => {
    // Mock auth() to return a league-admin session (not app admin)
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthLeagueAdmin as any)

    const { POST } = await import('@/app/api/scoring/import/route')

    // Call POST handler
    const response = await POST()

    // Verify 403 status (league admins cannot trigger scoring)
    expect(response.status).toBe(403)

    const json = await response.json()
    expect(json.error).toBe('Forbidden')
  })

  it('AC1.3: App-admin user does not receive 403 on POST', async () => {
    // Mock auth() to return an app-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthAppAdmin as any)

    const { POST } = await import('@/app/api/scoring/import/route')

    // Call POST handler
    const response = await POST()

    // Verify it doesn't return 403 (it may return 5xx due to mocked dependencies, but not 403)
    expect(response.status).not.toBe(403)
  })

  it('AC1.3 partial: Non-app-admin user receives 403 on recalculate POST', async () => {
    // Mock auth() to return a non-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthNonAdmin as any)

    const { POST } = await import(
      '@/app/api/scoring/recalculate/[matchId]/route'
    )

    // Call POST handler with params
    const response = await POST(
      new Request('http://localhost:3000/api/scoring/recalculate/match-123', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ matchId: 'match-123' }),
      }
    )

    // Verify 403 status
    expect(response.status).toBe(403)

    const json = await response.json()
    expect(json.error).toBe('Forbidden')
  })

  it('AC1.3 partial: Non-app-admin user receives 403 on cancel POST', async () => {
    // Mock auth() to return a non-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthNonAdmin as any)

    const { POST } = await import('@/app/api/scoring/cancel/[matchId]/route')

    // Call POST handler with params
    const response = await POST(
      new Request('http://localhost:3000/api/scoring/cancel/match-123', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ matchId: 'match-123' }),
      }
    )

    // Verify 403 status
    expect(response.status).toBe(403)

    const json = await response.json()
    expect(json.error).toBe('Forbidden')
  })
})
