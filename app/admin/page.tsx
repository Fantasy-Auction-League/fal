'use client'

import { useSession, signOut } from 'next-auth/react'
import { useState, useCallback, useRef, useEffect } from 'react'
import { AppFrame } from '@/app/components/AppFrame'

/* ─── IPL team colors ─── */
const teamColors: Record<string, string> = {
  MI: '#004BA0', CSK: '#F9CD05', RCB: '#EC1C24', KKR: '#3A225D',
  DC: '#004C93', RR: '#EA1A85', SRH: '#FF822A', GT: '#0EB1A2',
  LSG: '#00AEEF', PBKS: '#ED1B24',
}

const roleColors: Record<string, { bg: string; text: string }> = {
  BAT: { bg: '#F9CD05', text: '#1a1a2e' },
  BOWL: { bg: '#004BA0', text: '#fff' },
  ALL: { bg: '#0EB1A2', text: '#fff' },
  WK: { bg: '#EA1A85', text: '#fff' },
}

const avatarGradients = [
  'linear-gradient(135deg, #004BA0, #00AEEF)',
  'linear-gradient(135deg, #3A225D, #EA1A85)',
  'linear-gradient(135deg, #0EB1A2, #00AEEF)',
  'linear-gradient(135deg, #F9CD05, #FF822A)',
  'linear-gradient(135deg, #EC1C24, #FF822A)',
  'linear-gradient(135deg, #004C93, #0EB1A2)',
]

/* ─── Types ─── */
interface Team {
  id: string
  name: string
  userId: string
  user: { id: string; name: string | null; email: string | null; image: string | null }
}

interface League {
  id: string
  name: string
  inviteCode: string
  seasonStarted: boolean
  adminUserId: string
  minSquadSize: number
  maxSquadSize: number
  teams: Team[]
  _count: { teams: number }
}

interface TeamSummary {
  email: string
  teamName: string
  playerCount: number
  status: 'ok' | 'error'
}

interface RosterResult {
  teams: TeamSummary[]
  errors: string[]
}

interface SquadPlayer {
  id: string
  fullname: string
  role: string
  iplTeamName: string | null
  iplTeamCode: string | null
  imageUrl: string | null
  purchasePrice: number
}

interface SquadData {
  teamId: string
  teamName: string
  players: SquadPlayer[]
}

/* ─── Helpers ─── */
function getInitials(name: string | null | undefined): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/* ─── Icons (inline SVG) ─── */
const IconHome = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
  </svg>
)
const IconLineup = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
)
const IconPlayers = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const IconLeague = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
)
const IconShield = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const IconCopy = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)
const IconUpload = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
)
const IconClose = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

export default function AdminPage() {
  const { data: session, status: sessionStatus } = useSession()

  /* ─── State ─── */
  const [league, setLeague] = useState<League | null>(null)
  const [leagueName, setLeagueName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rosterResult, setRosterResult] = useState<RosterResult | null>(null)
  const [squads, setSquads] = useState<Record<string, SquadData>>({})
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  /* ─── Join league state ─── */
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinMsg, setJoinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  /* ─── All leagues for switcher ─── */
  const [allLeagues, setAllLeagues] = useState<{ id: string; name: string }[]>([])
  const [switchingLeague, setSwitchingLeague] = useState(false)
  const activeLeagueId = session?.user?.activeLeagueId

  /* ─── Fetch existing league on mount ─── */
  const fetchLeagues = useCallback(async () => {
    try {
      const res = await fetch('/api/leagues')
      if (!res.ok) return
      const leagues: League[] = await res.json()
      setAllLeagues(leagues.map(l => ({ id: l.id, name: l.name })))
      if (leagues.length > 0) {
        const targetLeague = leagues.find(l => l.id === activeLeagueId) || leagues[0]
        const detail = await fetch(`/api/leagues/${targetLeague.id}`)
        if (detail.ok) {
          const full = await detail.json()
          setLeague(full)
        }
      }
    } catch {
      // silent
    } finally {
      setInitialLoad(false)
    }
  }, [activeLeagueId])

  useEffect(() => {
    if (sessionStatus === 'authenticated') fetchLeagues()
  }, [sessionStatus, fetchLeagues])

  // Fetch all team squads whenever league data changes
  useEffect(() => {
    if (!league) return
    const loadSquads = async () => {
      const result: Record<string, SquadData> = {}
      for (const team of league.teams) {
        try {
          const res = await fetch(`/api/teams/${team.id}/squad`)
          if (res.ok) result[team.id] = await res.json()
        } catch { /* skip */ }
      }
      setSquads(result)
    }
    loadSquads()
  }, [league])

  /* ─── Auth guard ─── */
  if (sessionStatus === 'loading') {
    return (
      <AppFrame>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888', fontSize: 14 }}>Loading...</p>
        </div>
      </AppFrame>
    )
  }

  if (!session) {
    return (
      <AppFrame>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: '#888', fontSize: 14 }}>Please log in to access the admin dashboard.</p>
          <a href="/login" style={{
            background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
            color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none'
          }}>Go to Login</a>
        </div>
      </AppFrame>
    )
  }

  /* ─── Helpers ─── */
  const clearMessages = () => { setError(''); setSuccess('') }

  const createLeague = async () => {
    if (!leagueName.trim()) return
    clearMessages()
    setLoading(true)
    try {
      const res = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: leagueName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create league'); return }
      const detail = await fetch(`/api/leagues/${data.id}`)
      if (detail.ok) setLeague(await detail.json())
      else setLeague(data)
      setSuccess('League created!')
      setLeagueName('')
      setShowCreateForm(false)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const copyInviteCode = async () => {
    if (!league) return
    try {
      await navigator.clipboard.writeText(league.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback */ }
  }

  const uploadRoster = async () => {
    if (!league || !fileRef.current?.files?.[0]) return
    clearMessages()
    setLoading(true)
    try {
      const csvText = await fileRef.current.files[0].text()
      const res = await fetch(`/api/leagues/${league.id}/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText,
      })
      const data = await res.json()
      setRosterResult(data)
      if (!res.ok && data.error) setError(data.error)
      if (res.ok) {
        setSuccess('Roster uploaded successfully!')
        const detail = await fetch(`/api/leagues/${league.id}`)
        if (detail.ok) setLeague(await detail.json())
        await fetchAllSquads()
      }
    } catch { setError('Network error during upload') }
    finally { setLoading(false) }
  }

  const fetchAllSquads = async () => {
    if (!league) return
    const result: Record<string, SquadData> = {}
    for (const team of league.teams) {
      try {
        const res = await fetch(`/api/teams/${team.id}/squad`)
        if (res.ok) result[team.id] = await res.json()
      } catch { /* skip */ }
    }
    setSquads(result)
  }

  const startSeason = async () => {
    if (!league) return
    clearMessages()
    setLoading(true)
    try {
      const res = await fetch('/api/admin/season/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId: league.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to start season')
        return
      }
      setSuccess('Season started!')
      setLeague((prev) => prev ? { ...prev, seasonStarted: true } : prev)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const joinLeague = async () => {
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinMsg(null)
    try {
      const res = await fetch('/api/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setJoinMsg({ type: 'error', text: data.error || 'Failed to join league' })
        return
      }
      setJoinMsg({ type: 'success', text: `Joined ${data.name}!` })
      setJoinCode('')
      setTimeout(() => window.location.reload(), 1000)
    } catch {
      setJoinMsg({ type: 'error', text: 'Network error' })
    } finally {
      setJoinLoading(false)
    }
  }

  const openSquadSheet = async (teamId: string) => {
    setExpandedTeam(teamId)
    setSheetOpen(true)
    if (!squads[teamId]) {
      try {
        const res = await fetch(`/api/teams/${teamId}/squad`)
        if (res.ok) {
          const data = await res.json()
          setSquads((prev) => ({ ...prev, [teamId]: data }))
        }
      } catch { /* skip */ }
    }
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setTimeout(() => setExpandedTeam(null), 300)
  }

  const groupByRole = (players: SquadPlayer[]) => {
    const groups: Record<string, SquadPlayer[]> = { WK: [], BAT: [], ALL: [], BOWL: [] }
    for (const p of players) {
      const role = p.role?.toUpperCase() || 'BAT'
      const key = role.includes('WK') ? 'WK'
        : role.includes('ALL') ? 'ALL'
        : role.includes('BOWL') ? 'BOWL'
        : 'BAT'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return groups
  }

  const managerCount = league?._count?.teams ?? league?.teams.length ?? 0
  const maxSquad = league?.maxSquadSize || 15

  /* ─── Styles ─── */
  const styles = {
    wrapper: {
      position: 'relative' as const,
      paddingBottom: 80,
    },
    hero: {
      background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
      padding: '40px 20px 28px',
      borderRadius: '0 0 24px 24px',
    },
    logo: {
      fontSize: 28,
      fontWeight: 900,
      background: 'linear-gradient(135deg, #F9CD05, #FF822A)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      letterSpacing: -1,
    } as React.CSSProperties,
    badge: {
      display: 'inline-block',
      background: 'rgba(255,255,255,0.15)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      color: 'rgba(255,255,255,0.9)',
      fontSize: 11,
      fontWeight: 600,
      padding: '4px 12px',
      borderRadius: 20,
      marginLeft: 10,
    } as React.CSSProperties,
    statusBadge: (active: boolean) => ({
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 600,
      padding: '3px 10px',
      borderRadius: 12,
      background: active ? 'rgba(77,222,128,0.2)' : 'rgba(251,191,36,0.2)',
      color: active ? '#4ade80' : '#fbbf24',
      marginTop: 6,
    }),
    card: {
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: 14,
      padding: '16px 18px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: 700,
      color: '#1a1a2e',
      marginBottom: 12,
    },
    content: {
      padding: '16px 16px 0',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 14,
    },
    bottomNav: {
      position: 'fixed' as const,
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 480,
      background: '#fff',
      borderTop: '1px solid rgba(0,0,0,0.08)',
      display: 'flex',
      justifyContent: 'space-around' as const,
      alignItems: 'center',
      padding: '8px 0 env(safe-area-inset-bottom, 8px)',
      zIndex: 100,
    },
    navItem: (active: boolean) => ({
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap: 2,
      color: active ? '#004BA0' : '#aaa',
      fontSize: 10,
      fontWeight: active ? 700 : 500,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '4px 12px',
    }),
  }

  /* ─── Render ─── */
  return (
    <AppFrame>
    <div style={styles.wrapper}>
      {/* ── Hero Section ── */}
      <div style={styles.hero}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={styles.logo}>FAL</span>
          <span style={styles.badge}>League Admin</span>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 10px', color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Sign Out</button>
        </div>

        {league ? (
          <>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 14, lineHeight: 1.2 }}>
              {league.name}
            </h1>
            <div style={styles.statusBadge(league.seasonStarted)}>
              {league.seasonStarted ? 'Active' : 'Not Started'}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {managerCount} managers
              </span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                {league.inviteCode}
              </span>
            </div>
          </>
        ) : !initialLoad ? (
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 14 }}>
            No League Yet
          </h1>
        ) : (
          <h1 style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: 600, marginTop: 14 }}>
            Loading...
          </h1>
        )}
      </div>

      {/* ── Content Area ── */}
      <div style={styles.content}>

        {/* ── League Switcher ── */}
        {allLeagues.length > 1 && (
          <div style={styles.card}>
            <div style={styles.cardTitle}>Your Leagues</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allLeagues.map((l) => {
                const isActive = league?.id === l.id
                return (
                  <button
                    key={l.id}
                    disabled={switchingLeague}
                    onClick={async () => {
                      if (isActive) return
                      setSwitchingLeague(true)
                      try {
                        const res = await fetch('/api/user/preferences', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ activeLeagueId: l.id }),
                        })
                        if (res.ok) {
                          window.location.reload()
                        }
                      } catch {
                        // silent
                      } finally {
                        setSwitchingLeague(false)
                      }
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: isActive ? 'rgba(0,75,160,0.06)' : '#f8f9fc',
                      border: isActive ? '2px solid #004BA0' : '1px solid rgba(0,0,0,0.04)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left' as const,
                      opacity: switchingLeague ? 0.6 : 1,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? '#004BA0' : '#1a1a2e' }}>
                        {l.name}
                      </div>
                    </div>
                    {isActive && (
                      <div style={{
                        fontSize: 16,
                        color: '#004BA0',
                        fontWeight: 700,
                      }}>&#10003;</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Join a League ── */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Join a League</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Enter invite code"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value); setJoinMsg(null) }}
              onKeyDown={(e) => e.key === 'Enter' && joinLeague()}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: 14,
                outline: 'none',
                background: '#f8f9fc',
                color: '#1a1a2e',
              }}
            />
            <button
              onClick={joinLeague}
              disabled={joinLoading || !joinCode.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: joinLoading || !joinCode.trim() ? 'not-allowed' : 'pointer',
                opacity: joinLoading || !joinCode.trim() ? 0.4 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {joinLoading ? 'Joining...' : 'Join'}
            </button>
          </div>
          {joinMsg && (
            <div style={{
              marginTop: 8,
              fontSize: 13,
              fontWeight: 500,
              color: joinMsg.type === 'success' ? '#0d9e5f' : '#d63060',
            }}>
              {joinMsg.text}
            </div>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#d63060', fontSize: 13, fontWeight: 500 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', color: '#0d9e5f', fontSize: 13, fontWeight: 500 }}>
            {success}
          </div>
        )}

        {/* ── Create League (no league) ── */}
        {!initialLoad && (!league || showCreateForm) && (
          <div style={styles.card}>
            <div style={styles.cardTitle}>Create League</div>
            <input
              placeholder="League name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createLeague()}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: 14,
                outline: 'none',
                marginBottom: 10,
                background: '#f8f9fc',
                color: '#1a1a2e',
              }}
            />
            <button
              onClick={createLeague}
              disabled={loading || !leagueName.trim()}
              style={{
                width: '100%',
                padding: '12px 0',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: loading || !leagueName.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !leagueName.trim() ? 0.4 : 1,
              }}
            >
              {loading ? 'Creating...' : 'Create League'}
            </button>
          </div>
        )}

        {/* ── Invite Code Card ── */}
        {league && (
          <div style={styles.card}>
            <div style={{
              background: 'rgba(0,75,160,0.06)',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>Invite Code</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#004BA0', letterSpacing: 2 }}>
                  {league.inviteCode}
                </div>
              </div>
              <button
                onClick={copyInviteCode}
                style={{
                  background: copied ? '#0d9e5f' : '#004BA0',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'background 0.2s',
                }}
              >
                <IconCopy />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {league && !showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.08)',
              background: '#f8f9fc',
              color: '#666',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            + Create New League
          </button>
        )}

        {/* ── Managers Card ── */}
        {league && league.teams.length > 0 && (
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={styles.cardTitle as React.CSSProperties}>Managers</div>
              <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>{managerCount} / 15</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {league.teams.map((team, i) => {
                const squad = squads[team.id]
                const count = squad?.players?.length ?? 0
                const isComplete = count >= (league.minSquadSize || 15)
                const isAdmin = team.userId === league.adminUserId
                const initials = getInitials(team.user?.name || team.user?.email)
                const gradient = avatarGradients[i % avatarGradients.length]

                let rosterColor = '#d63060'
                let rosterBg = 'rgba(214,48,96,0.08)'
                let rosterIcon = '\u2717'
                if (count > 0 && isComplete) {
                  rosterColor = '#0d9e5f'
                  rosterBg = 'rgba(13,158,95,0.08)'
                  rosterIcon = '\u2713'
                } else if (count > 0) {
                  rosterColor = '#e09000'
                  rosterBg = 'rgba(224,144,0,0.08)'
                  rosterIcon = '!'
                }

                return (
                  <button
                    key={team.id}
                    onClick={() => openSquadSheet(team.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: '#f8f9fc',
                      border: '1px solid rgba(0,0,0,0.04)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: gradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{team.user?.name || team.user?.email}</span>
                        {isAdmin && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            background: 'rgba(0,75,160,0.1)',
                            color: '#004BA0',
                            padding: '2px 6px',
                            borderRadius: 6,
                            textTransform: 'uppercase',
                          }}>Admin</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{team.name}</div>
                    </div>
                    {/* Roster badge */}
                    <div style={{
                      background: rosterBg,
                      color: rosterColor,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: 8,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      {count}/{maxSquad} {rosterIcon}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Roster Management Card ── */}
        {league && !league.seasonStarted && (
          <div style={styles.card}>
            <div style={styles.cardTitle}>Roster Management</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              id="roster-csv-input"
              style={{ display: 'none' }}
            />
            <button
              onClick={() => {
                if (fileRef.current?.files?.[0]) {
                  uploadRoster()
                } else {
                  fileRef.current?.click()
                }
              }}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 0',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #F9CD05, #FF822A)',
                color: '#1a1a2e',
                fontWeight: 700,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <IconUpload />
              {loading ? 'Uploading...' : 'Upload Roster CSV'}
            </button>
            <p style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'center' }}>
              Format: managerEmail, teamName, playerName, purchasePrice
            </p>

            {/* File selected indicator + upload trigger */}
            <FileSelectedIndicator fileRef={fileRef} onUpload={uploadRoster} loading={loading} />

            {/* Upload results */}
            {rosterResult && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {rosterResult.teams?.map((t) => {
                  const isOk = t.status === 'ok'
                  return (
                    <span key={t.email} style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 20,
                      background: isOk ? 'rgba(13,158,95,0.1)' : 'rgba(214,48,96,0.1)',
                      color: isOk ? '#0d9e5f' : '#d63060',
                    }}>
                      {t.teamName}: {t.playerCount}p {isOk ? '\u2713' : '\u2717'}
                    </span>
                  )
                })}
                {rosterResult.errors?.length > 0 && (
                  <div style={{ width: '100%', marginTop: 6 }}>
                    {rosterResult.errors.map((err, i) => (
                      <p key={i} style={{ fontSize: 11, color: '#d63060', marginTop: 2 }}>{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Start Season ── */}
        {league && !league.seasonStarted && (
          <button
            onClick={startSeason}
            disabled={loading || league.seasonStarted}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Starting...' : 'Start Season'}
          </button>
        )}

        {league && league.seasonStarted && (
          <div style={{ ...styles.card, textAlign: 'center' as const }}>
            <span style={{ color: '#0d9e5f', fontSize: 13, fontWeight: 600 }}>Season is active</span>
          </div>
        )}
      </div>

      {/* ── Squad Bottom Sheet ── */}
      {expandedTeam && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeSheet}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 200,
              opacity: sheetOpen ? 1 : 0,
              transition: 'opacity 0.3s',
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: '50%',
            transform: `translateX(-50%) translateY(${sheetOpen ? '0' : '100%'})`,
            width: '100%',
            maxWidth: 480,
            maxHeight: '80vh',
            background: '#fff',
            borderRadius: '20px 20px 0 0',
            zIndex: 210,
            transition: 'transform 0.3s ease-out',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
            </div>
            {/* Header */}
            <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>
                  {squads[expandedTeam]?.teamName || league?.teams.find(t => t.id === expandedTeam)?.name || 'Squad'}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {squads[expandedTeam]?.players?.length ?? 0} players
                </div>
              </div>
              <button onClick={closeSheet} style={{ background: '#f2f3f8', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <IconClose />
              </button>
            </div>
            {/* Player list */}
            <div style={{ overflowY: 'auto', padding: '12px 20px 24px', flex: 1 }}>
              {squads[expandedTeam] ? (
                (() => {
                  const groups = groupByRole(squads[expandedTeam].players)
                  return Object.entries(groups).map(([role, players]) =>
                    players.length > 0 ? (
                      <div key={role} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: roleColors[role]?.bg || '#888',
                            display: 'inline-block',
                          }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{role}</span>
                          <span style={{ fontSize: 11, color: '#888' }}>({players.length})</span>
                        </div>
                        {players.map((p) => (
                          <div key={p.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: '#f8f9fc',
                            marginBottom: 4,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a2e' }}>{p.fullname}</span>
                              {p.iplTeamCode && (
                                <span style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: '2px 5px',
                                  borderRadius: 4,
                                  color: teamColors[p.iplTeamCode] || '#888',
                                  background: `${teamColors[p.iplTeamCode] || '#888'}15`,
                                }}>
                                  {p.iplTeamCode}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                              {p.purchasePrice > 0 ? `$${p.purchasePrice}M` : '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null
                  )
                })()
              ) : (
                <p style={{ color: '#888', fontSize: 13 }}>Loading squad...</p>
              )}
              {squads[expandedTeam]?.players?.length === 0 && (
                <p style={{ color: '#aaa', fontSize: 13 }}>No players yet.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Bottom Navigation ── */}
      <nav className="bottom-nav-fixed" style={styles.bottomNav}>
        <a href="/" style={{ ...styles.navItem(false), textDecoration: 'none' }}>
          <IconHome />
          <span>Home</span>
        </a>
        <a href="/lineup" style={{ ...styles.navItem(false), textDecoration: 'none' }}>
          <IconLineup />
          <span>Lineup</span>
        </a>
        <a href="/players" style={{ ...styles.navItem(false), textDecoration: 'none' }}>
          <IconPlayers />
          <span>Players</span>
        </a>
        <a href="/admin" style={{ ...styles.navItem(true), textDecoration: 'none' }}>
          <IconLeague />
          <span>League</span>
        </a>
        {session?.user?.isAppAdmin && (
          <a href="/app-admin" style={{ ...styles.navItem(false), textDecoration: 'none' }}>
            <IconShield />
            <span>Admin</span>
          </a>
        )}
      </nav>
    </div>
    </AppFrame>
  )
}

/* ─── Sub-component: file selected indicator ─── */
function FileSelectedIndicator({ fileRef, onUpload, loading }: { fileRef: React.RefObject<HTMLInputElement | null>; onUpload: () => void; loading: boolean }) {
  const [fileName, setFileName] = useState<string | null>(null)

  useEffect(() => {
    const input = fileRef.current
    if (!input) return
    const handler = () => {
      const f = input.files?.[0]
      setFileName(f ? f.name : null)
    }
    input.addEventListener('change', handler)
    return () => input.removeEventListener('change', handler)
  }, [fileRef])

  if (!fileName) return null

  return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f9fc', borderRadius: 8, padding: '8px 12px' }}>
      <span style={{ fontSize: 12, color: '#1a1a2e', fontWeight: 500 }}>{fileName}</span>
      <button
        onClick={onUpload}
        disabled={loading}
        style={{
          background: '#004BA0',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  )
}
