import { describe, it, expect } from 'vitest'
import { getCacheHeaders } from '@/lib/cache-headers'

describe('Cache Headers', () => {
  describe('AC9.1: LIVE mode cache headers', () => {
    it('should return Cache-Control header with LIVE mode values', () => {
      const headers = getCacheHeaders('LIVE')

      expect(headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300')
    })

    it('should have s-maxage=60 for LIVE mode (short cache duration)', () => {
      const headers = getCacheHeaders('LIVE')
      const cacheControl = headers.get('Cache-Control') || ''

      expect(cacheControl).toContain('s-maxage=60')
    })

    it('should have stale-while-revalidate=300 for LIVE mode (5 minute revalidation window)', () => {
      const headers = getCacheHeaders('LIVE')
      const cacheControl = headers.get('Cache-Control') || ''

      expect(cacheControl).toContain('stale-while-revalidate=300')
    })

    it('should be marked as public for LIVE mode', () => {
      const headers = getCacheHeaders('LIVE')
      const cacheControl = headers.get('Cache-Control') || ''

      expect(cacheControl).toContain('public')
    })
  })

  describe('AC9.2: FINAL mode cache headers', () => {
    it('should return Cache-Control header with FINAL mode values', () => {
      const headers = getCacheHeaders('FINAL')

      expect(headers.get('Cache-Control')).toBe(
        'public, s-maxage=3600, stale-while-revalidate=86400'
      )
    })

    it('should have s-maxage=3600 for FINAL mode (1 hour cache duration)', () => {
      const headers = getCacheHeaders('FINAL')
      const cacheControl = headers.get('Cache-Control') || ''

      expect(cacheControl).toContain('s-maxage=3600')
    })

    it('should have stale-while-revalidate=86400 for FINAL mode (24 hour revalidation window)', () => {
      const headers = getCacheHeaders('FINAL')
      const cacheControl = headers.get('Cache-Control') || ''

      expect(cacheControl).toContain('stale-while-revalidate=86400')
    })

    it('should be marked as public for FINAL mode', () => {
      const headers = getCacheHeaders('FINAL')
      const cacheControl = headers.get('Cache-Control') || ''

      expect(cacheControl).toContain('public')
    })
  })

  describe('Cache Header Structure', () => {
    it('should return a Headers instance', () => {
      const liveHeaders = getCacheHeaders('LIVE')
      const finalHeaders = getCacheHeaders('FINAL')

      expect(liveHeaders).toBeInstanceOf(Headers)
      expect(finalHeaders).toBeInstanceOf(Headers)
    })

    it('should have exactly one Cache-Control header', () => {
      const headers = getCacheHeaders('LIVE')
      const cacheControlValues = []
      headers.forEach((value, key) => {
        if (key.toLowerCase() === 'cache-control') {
          cacheControlValues.push(value)
        }
      })

      expect(cacheControlValues.length).toBe(1)
    })
  })

  describe('Cache Duration Comparison', () => {
    it('FINAL mode should have longer cache duration than LIVE mode', () => {
      const liveHeaders = getCacheHeaders('LIVE')
      const finalHeaders = getCacheHeaders('FINAL')

      const liveMaxAge = 60
      const finalMaxAge = 3600

      expect(finalMaxAge).toBeGreaterThan(liveMaxAge)

      // Verify the headers contain these values
      expect(liveHeaders.get('Cache-Control')).toContain(`s-maxage=${liveMaxAge}`)
      expect(finalHeaders.get('Cache-Control')).toContain(`s-maxage=${finalMaxAge}`)
    })

    it('FINAL mode should have longer stale-while-revalidate than LIVE mode', () => {
      const liveHeaders = getCacheHeaders('LIVE')
      const finalHeaders = getCacheHeaders('FINAL')

      const liveSwr = 300
      const finalSwr = 86400

      expect(finalSwr).toBeGreaterThan(liveSwr)

      // Verify the headers contain these values
      expect(liveHeaders.get('Cache-Control')).toContain(`stale-while-revalidate=${liveSwr}`)
      expect(finalHeaders.get('Cache-Control')).toContain(`stale-while-revalidate=${finalSwr}`)
    })
  })
})
