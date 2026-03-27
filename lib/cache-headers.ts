/**
 * Cache header utilities for score API responses
 */

type ScoringMode = 'LIVE' | 'FINAL'

/**
 * Get Cache-Control headers based on scoring mode
 * - LIVE mode: short-lived cache (60s), stale-while-revalidate for 5 minutes
 * - FINAL mode: longer cache (1 hour), stale-while-revalidate for 24 hours
 */
export function getCacheHeaders(mode: ScoringMode): Headers {
  const headers = new Headers()

  if (mode === 'LIVE') {
    headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  } else if (mode === 'FINAL') {
    headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  }

  return headers
}
