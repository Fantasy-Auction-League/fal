const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0'

export class SportMonksClient {
  private token: string

  constructor(token?: string) {
    this.token = token || process.env.SPORTMONKS_API_TOKEN || ''
    if (!this.token) throw new Error('SPORTMONKS_API_TOKEN not set')
  }

  async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    url.searchParams.set('api_token', this.token)
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

    try {
      const res = await fetch(url.toString(), { signal: controller.signal })
      if (!res.ok) throw new Error(`SportMonks ${res.status}: ${res.statusText}`)
      const json = await res.json()
      return json.data as T
    } finally {
      clearTimeout(timeout)
    }
  }
}

// Lazy singleton — only throws when actually used without a token
let _instance: SportMonksClient | null = null
export function getSportMonksClient(): SportMonksClient {
  if (!_instance) _instance = new SportMonksClient()
  return _instance
}

// Convenience alias (kept for backward compat)
export const sportmonks = new Proxy({} as SportMonksClient, {
  get(_, prop) {
    return (getSportMonksClient() as any)[prop]
  },
})
