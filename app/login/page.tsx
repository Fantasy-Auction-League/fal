'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    try {
      // Ensure user exists in DB
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create user')
      }

      // Sign in via Auth.js credentials provider
      const result = await signIn('credentials', {
        email,
        redirect: false,
      })

      if (result?.error) {
        setError('Sign-in failed. Try again.')
        setLoading(false)
        return
      }

      window.location.href = '/'
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0c0c10' }}>
      <div className="w-full max-w-sm">
        <div className="border border-white/10 rounded-2xl p-8 bg-white/[0.02] backdrop-blur">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white tracking-tight">FAL</h1>
            <p className="text-sm text-white/40 mt-1">Fantasy Cricket League</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-white/50 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="name" className="block text-xs font-medium text-white/50 mb-1.5">
                Name <span className="text-white/20">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all mt-2"
            >
              {loading ? 'Signing in...' : 'Enter League'}
            </button>
          </form>

          <p className="text-[10px] text-white/20 text-center mt-6">
            Dev mode — no password required
          </p>
        </div>
      </div>
    </div>
  )
}
