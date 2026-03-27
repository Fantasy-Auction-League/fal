import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth at the top level
const mockAuthNonAdmin = vi.fn(async () => ({
  user: {
    id: 'normal-user-id',
    email: 'normaluser@test.vitest.syncplayers',
    isAppAdmin: false,
  },
}))

const mockAuthAdmin = vi.fn(async () => ({
  user: {
    id: 'admin-user-id',
    email: 'appadmin@test.vitest.syncplayers',
    isAppAdmin: true,
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

describe('Sync Players API - Access Control (AC4.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC4.4: Non-app-admin user receives 403 on GET', async () => {
    // Mock auth() to return a non-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthNonAdmin as any)

    const { GET } = await import('@/app/api/admin/sync-players/route')

    // Call GET handler
    const response = await GET()

    // Verify 403 status
    expect(response.status).toBe(403)

    const json = await response.json()
    expect(json.error).toBe('Forbidden')
  })

  it('AC4.4: Non-app-admin user receives 403 on POST', async () => {
    // Mock auth() to return a non-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthNonAdmin as any)

    const { POST } = await import('@/app/api/admin/sync-players/route')

    // Call POST handler
    const response = await POST()

    // Verify 403 status
    expect(response.status).toBe(403)

    const json = await response.json()
    expect(json.error).toBe('Forbidden')
  })

  it('AC4.4: App-admin user does not receive 403 on GET', async () => {
    // Mock auth() to return an app-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthAdmin as any)

    const { GET } = await import('@/app/api/admin/sync-players/route')

    // Call GET handler
    const response = await GET()

    // Verify it doesn't return 403 (it should return 200 or 500, not 403)
    expect(response.status).not.toBe(403)
  })

  it('AC4.4: App-admin user does not receive 403 on POST', async () => {
    // Mock auth() to return an app-admin session
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockImplementation(mockAuthAdmin as any)

    const { POST } = await import('@/app/api/admin/sync-players/route')

    // Call POST handler
    const response = await POST()

    // Verify it doesn't return 403 (it should return 200 or 500, not 403)
    expect(response.status).not.toBe(403)
  })
})
