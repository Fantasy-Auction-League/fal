'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { AppFrame } from '@/app/components/AppFrame'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [adminSecret, setAdminSecret] = useState('')
  const [adminMode, setAdminMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name,
          password,
          ...(adminMode
            ? { adminSecret: adminSecret.trim() || undefined }
            : { inviteCode: inviteCode.trim() || undefined }),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create user')
      }

      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
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

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: '1.5px solid rgba(0,0,0,0.08)',
    fontSize: 14,
    fontWeight: 500,
    color: '#1a1a2e',
    background: '#f8f9fc',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#888',
    marginBottom: 6,
  }

  return (
    <AppFrame>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Hero gradient — same as other screens */}
        <div style={{
          background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
          padding: '60px 24px 40px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative glow */}
          <div style={{
            position: 'absolute', top: '-30%', right: '-20%',
            width: 300, height: 300,
            background: 'radial-gradient(circle, rgba(249,205,5,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            fontSize: 42,
            fontWeight: 900,
            background: 'linear-gradient(135deg, #F9CD05, #FF822A)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: -2,
          }}>
            FAL
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 13,
            fontWeight: 500,
            marginTop: 4,
          }}>
            Fantasy Auction League
          </p>
          <p style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontWeight: 500,
            marginTop: 2,
          }}>
            IPL 2026
          </p>
        </div>

        {/* Form area — light theme matching rest of app */}
        <div style={{
          flex: 1,
          padding: '24px 20px',
          background: '#f2f3f8',
        }}>
          <div style={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 16,
            padding: '24px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>
              Sign In
            </h2>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
              Enter your email to join your league
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="email" style={labelStyle}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label htmlFor="name" style={labelStyle}>
                  Name <span style={{ color: '#bbb' }}>(optional)</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label htmlFor="password" style={labelStyle}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={!adminMode && inviteCode.trim() ? 'Create a password' : 'Enter your password'}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                {adminMode ? (
                  <>
                    <label htmlFor="adminSecret" style={labelStyle}>
                      Admin Secret
                    </label>
                    <input
                      id="adminSecret"
                      type="password"
                      value={adminSecret}
                      onChange={(e) => setAdminSecret(e.target.value)}
                      placeholder="Enter admin secret"
                      style={inputStyle}
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="inviteCode" style={labelStyle}>
                      Invite Code
                    </label>
                    <input
                      id="inviteCode"
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="Enter your league code"
                      style={inputStyle}
                    />
                  </>
                )}
              </div>

              {error && (
                <p style={{ color: '#d63060', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                style={{
                  width: '100%',
                  padding: '13px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loading || !email ? 'not-allowed' : 'pointer',
                  opacity: loading || !email ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Signing in...' : adminMode ? 'Admin Sign In' : 'Enter League'}
              </button>

              <p
                onClick={() => { setAdminMode(!adminMode); setError('') }}
                style={{
                  textAlign: 'center',
                  fontSize: 11,
                  color: '#bbb',
                  marginTop: 16,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {adminMode ? 'Back to league sign in' : 'Admin setup?'}
              </p>
            </form>
          </div>
        </div>
      </div>
    </AppFrame>
  )
}
