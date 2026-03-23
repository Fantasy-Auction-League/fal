'use client'

import { useSession } from 'next-auth/react'
import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { AppFrame } from '@/app/components/AppFrame'

/* ─── IPL team colors ─── */
const teamColors: Record<string, string> = {
  MI: '#004BA0', CSK: '#F9CD05', RCB: '#EC1C24', KKR: '#3A225D',
  DC: '#004C93', RR: '#EA1A85', SRH: '#FF822A', GT: '#0EB1A2',
  LSG: '#00AEEF', PBKS: '#ED1B24',
}

/* ─── IPL team name → code mapping ─── */
const teamNameToCode: Record<string, string> = {
  'Mumbai Indians': 'MI',
  'Chennai Super Kings': 'CSK',
  'Royal Challengers Bengaluru': 'RCB',
  'Royal Challengers Bangalore': 'RCB',
  'Kolkata Knight Riders': 'KKR',
  'Delhi Capitals': 'DC',
  'Rajasthan Royals': 'RR',
  'Sunrisers Hyderabad': 'SRH',
  'Gujarat Titans': 'GT',
  'Lucknow Super Giants': 'LSG',
  'Punjab Kings': 'PBKS',
}

function getTeamCode(name: string): string {
  return teamNameToCode[name] || name.split(' ').map(w => w[0]).join('').toUpperCase()
}

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

interface GameweekMatch {
  id: string
  localTeamName: string
  visitorTeamName: string
  startingAt: string
  apiStatus: string
  scoringStatus: string
}

interface CurrentGameweek {
  id: string
  number: number
  lockTime: string | null
  status: string
  matches: GameweekMatch[]
}

interface Standing {
  rank: number
  teamId: string
  teamName: string
  manager: string
  managerId: string
  totalPoints: number
  bestGwScore: number
  lastGwPoints: number
  lastGwNumber: number | null
  chipUsed: string | null
}

/* ─── Icons ─── */
const IconHome = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)
const IconLineup = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
)
const IconPlayers = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const IconLeague = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/* ─── Helpers ─── */
function formatNumber(n: number): string {
  return n.toLocaleString('en-IN')
}

function getRankStyle(rank: number, isYou: boolean): React.CSSProperties {
  if (isYou) return { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(0,75,160,0.1)', color: '#004BA0' }
  if (rank === 1) return { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(249,205,5,0.12)', color: '#b58800' }
  if (rank === 2) return { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(192,199,208,0.15)', color: '#777' }
  if (rank === 3) return { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(192,199,208,0.15)', color: '#777' }
  if (rank === 4) return { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(205,127,50,0.1)', color: '#a0724a' }
  return { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 10, fontWeight: 700, background: '#f2f3f8', color: '#999' }
}

function formatDeadline(lockTime: string | null): { label: string; time: string } {
  if (!lockTime) return { label: 'Deadline', time: 'TBD' }
  const d = new Date(lockTime)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return {
    label: 'Deadline',
    time: `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}, ${h12}:${m} ${ampm}`,
  }
}

function formatMatchTime(startingAt: string): { display: string; day: string } {
  const d = new Date(startingAt)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dayName = days[d.getDay()]
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return {
    display: `${dayName}, ${months[d.getMonth()]} ${d.getDate()} \u00B7 ${h12}:${m} ${ampm}`,
    day: dayName.toUpperCase(),
  }
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession()

  const [league, setLeague] = useState<League | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const [showAllStandings, setShowAllStandings] = useState(false)
  const [currentGw, setCurrentGw] = useState<CurrentGameweek | null>(null)
  const [gwNotFound, setGwNotFound] = useState(false)
  const [standings, setStandings] = useState<Standing[]>([])

  /* ─── Fetch league on mount ─── */
  const fetchLeague = useCallback(async () => {
    try {
      const res = await fetch('/api/leagues')
      if (!res.ok) return
      const leagues: League[] = await res.json()
      if (leagues.length > 0) {
        const detail = await fetch(`/api/leagues/${leagues[0].id}`)
        if (detail.ok) {
          const full = await detail.json()
          setLeague(full)
          return full as League
        }
      }
      return null
    } catch {
      return null
    }
  }, [])

  const fetchCurrentGw = useCallback(async () => {
    try {
      const res = await fetch('/api/gameweeks/current')
      if (res.status === 404) {
        setGwNotFound(true)
        return
      }
      if (!res.ok) return
      const data = await res.json()
      setCurrentGw(data)
    } catch {
      // silent
    }
  }, [])

  const fetchStandings = useCallback(async (leagueId: string) => {
    try {
      const res = await fetch(`/api/leaderboard/${leagueId}`)
      if (!res.ok) return
      const data = await res.json()
      setStandings(data.standings || [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      Promise.all([
        fetchLeague(),
        fetchCurrentGw(),
      ]).then(([leagueData]) => {
        if (leagueData) {
          fetchStandings(leagueData.id)
        }
      }).finally(() => setInitialLoad(false))
    }
  }, [sessionStatus, fetchLeague, fetchCurrentGw, fetchStandings])

  /* ─── Auth guard ─── */
  if (sessionStatus === 'loading' || initialLoad) {
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
          <p style={{ color: '#888', fontSize: 14 }}>Please log in to continue.</p>
          <a href="/login" style={{
            background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
            color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}>Go to Login</a>
        </div>
      </AppFrame>
    )
  }

  /* ─── Computed values ─── */
  const leagueName = league?.name || 'Weekend Warriors'
  const seasonStarted = !gwNotFound && currentGw !== null

  // Gameweek label
  const gwLabel = seasonStarted ? `Gameweek ${currentGw!.number}` : 'Season not started'

  // Score trio
  const userId = session.user?.id
  const myStanding = standings.find(s => s.managerId === userId)
  const yourPoints = myStanding?.totalPoints ?? 0
  const avgPoints = standings.length > 0
    ? Math.round(standings.reduce((sum, s) => sum + s.totalPoints, 0) / standings.length)
    : 0
  const highestPoints = standings.length > 0 ? standings[0]?.totalPoints ?? 0 : 0
  const hasScores = standings.some(s => s.totalPoints > 0)

  // Deadline
  const nextGwNumber = currentGw ? currentGw.number + 1 : null
  const deadline = currentGw
    ? formatDeadline(currentGw.lockTime)
    : { label: 'Deadline', time: 'Season starts soon' }
  const deadlineLabel = nextGwNumber ? `GW${nextGwNumber} Deadline` : deadline.label

  // Matches
  const matches = currentGw?.matches ?? []

  // Standings for display
  const visibleStandings = showAllStandings ? standings : standings.slice(0, 7)

  return (
    <AppFrame>
    <div style={{
      position: 'relative',
      paddingBottom: 80,
    }}>
      {/* HERO */}
      <div style={{
        background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
        padding: '40px 18px 14px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Radial glow */}
        <div style={{
          position: 'absolute', top: '-30%', right: '-20%',
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(249,205,5,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Header row: logo + league tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{
            fontSize: 18, fontWeight: 900, letterSpacing: -0.5,
            background: 'linear-gradient(135deg, #F9CD05, #FF822A)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>Fantasy</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Dashboard</div>
        </div>

        {/* League full name */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
            {leagueName}
          </div>
        </div>

        {/* Gameweek label */}
        <div style={{
          textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.6)',
          fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' as const, marginBottom: 2,
        }}>
          {gwLabel}
        </div>

        {/* Score Trio */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 8 }}>
          {/* Average */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
              {hasScores ? formatNumber(avgPoints) : '\u2014'}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginTop: 1 }}>Average</div>
          </div>

          {/* Your Points (center) */}
          <div style={{ flex: 1.3, textAlign: 'center', position: 'relative' }}>
            {/* Left divider */}
            <div style={{ position: 'absolute', top: '10%', bottom: '20%', left: 0, width: 1, background: 'rgba(255,255,255,0.1)' }} />
            {/* Right divider */}
            <div style={{ position: 'absolute', top: '10%', bottom: '20%', right: 0, width: 1, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {hasScores ? formatNumber(yourPoints) : '\u2014'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginTop: 2 }}>Your Points</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 1, fontWeight: 500 }}>tap for detail</div>
          </div>

          {/* Highest */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
              {hasScores ? formatNumber(highestPoints) : '\u2014'}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginTop: 1 }}>Highest</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

        {/* Bottom row: deadline + edit lineup */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{deadlineLabel}</div>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 800 }}>{deadline.time}</div>
          </div>
          <Link href="/lineup" style={{
            padding: '7px 14px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600,
            textDecoration: 'none',
            fontFamily: 'inherit',
          }}>
            Edit Lineup
          </Link>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* League Standings Card */}
        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 16, padding: 14,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          {/* Section header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.2 }}>League Standings</div>
          </div>

          {standings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#999', fontSize: 13 }}>
              No teams in this league yet
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{
                display: 'flex', padding: '0 10px 4px', fontSize: 9, fontWeight: 600,
                color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: 0.5, gap: 8,
              }}>
                <div style={{ width: 22 }}>#</div>
                <div style={{ flex: 1 }}>Manager</div>
                <div style={{ width: 36, textAlign: 'right' }}>GW</div>
                <div style={{ width: 42, textAlign: 'right' }}>Total</div>
              </div>

              {/* Standings rows */}
              {visibleStandings.map((s) => {
                const isYou = s.managerId === userId
                const isFirst = s.rank === 1
                const rowStyle: React.CSSProperties = {
                  display: 'flex', alignItems: 'center', padding: '9px 10px',
                  borderRadius: 10, gap: 8, fontSize: 12.5,
                  cursor: 'pointer',
                  marginTop: s.rank > 1 ? 2 : 0,
                  ...(isYou ? { background: 'rgba(0,75,160,0.04)', border: '1.5px solid rgba(0,75,160,0.1)' } : {}),
                  ...(isFirst && !isYou ? { background: 'rgba(249,205,5,0.05)' } : {}),
                  textDecoration: 'none',
                }

                const ptsColor = isYou ? '#004BA0' : isFirst ? '#b58800' : '#333'
                const nameColor = isYou ? '#111' : isFirst ? '#222' : '#555'
                const nameWeight = isYou ? 700 : isFirst ? 600 : 500

                return (
                  <div key={s.teamId} style={rowStyle}>
                    <div style={getRankStyle(s.rank, isYou)}>{s.rank}</div>
                    <div style={{ flex: 1, fontWeight: nameWeight, color: nameColor }}>
                      {s.manager}{isYou ? ' (You)' : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', fontWeight: 500, fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>{s.lastGwPoints}</div>
                    <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ptsColor, width: 42, textAlign: 'right' }}>{formatNumber(s.totalPoints)}</div>
                  </div>
                )
              })}

              {/* Expand/collapse button */}
              {standings.length > 7 && (
                <button
                  onClick={() => setShowAllStandings(!showAllStandings)}
                  style={{
                    width: '100%', padding: 8, marginTop: 6,
                    border: 'none', borderRadius: 8,
                    background: '#f2f3f8', color: '#004BA0',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {showAllStandings ? 'Show less \u25B2' : `Show all ${standings.length} \u25BC`}
                </button>
              )}

              {/* Hint */}
              <div style={{ fontSize: 9, color: '#bbb', textAlign: 'center', marginTop: 6, fontWeight: 500 }}>
                Tap a manager to view their lineup
              </div>
            </>
          )}
        </div>

        {/* This Week's Matches Card */}
        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 16, padding: 14,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.2, marginBottom: 10 }}>This Week</div>

          {matches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 13 }}>
              No matches scheduled
            </div>
          ) : (
            matches.map((m, i) => {
              const code1 = getTeamCode(m.localTeamName)
              const code2 = getTeamCode(m.visitorTeamName)
              const c1 = teamColors[code1] || '#888'
              const c2 = teamColors[code2] || '#888'
              const t1Color = code1 === 'CSK' ? '#b58800' : c1
              const t2Color = code2 === 'CSK' ? '#b58800' : c2
              const { display, day } = formatMatchTime(m.startingAt)

              return (
                <div key={m.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', background: '#f7f8fb',
                  borderRadius: 12, border: '1px solid rgba(0,0,0,0.04)',
                  position: 'relative', overflow: 'hidden',
                  marginTop: i > 0 ? 4 : 0,
                }}>
                  {/* Left gradient bar */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
                    borderRadius: '3px 0 0 3px',
                    background: `linear-gradient(to bottom, ${c1}, ${c2})`,
                  }} />
                  {/* Match info */}
                  <div style={{ paddingLeft: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: c1, boxShadow: `0 0 4px ${c1}`, flexShrink: 0 }} />
                      <span style={{ color: t1Color }}>{code1}</span>
                      <span style={{ fontSize: 9, color: '#aaa', fontWeight: 500 }}>vs</span>
                      <span style={{ color: t2Color }}>{code2}</span>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: c2, boxShadow: `0 0 4px ${c2}`, flexShrink: 0 }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{display}</div>
                  </div>
                  {/* Day badge */}
                  <div style={{
                    fontSize: 9, fontWeight: 600, padding: '3px 8px',
                    borderRadius: 6, background: '#eef0f5', color: '#777',
                  }}>
                    {day}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Spacer for scroll */}
        <div style={{ height: 30 }} />
      </div>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav-fixed" style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        display: 'flex', justifyContent: 'space-around',
        padding: '8px 8px env(safe-area-inset-bottom, 30px)',
        background: '#fff',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        zIndex: 100,
      }}>
        <Link href="/" style={{ textDecoration: 'none', textAlign: 'center', fontSize: 10, color: '#004BA0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontWeight: 600 }}>
          <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,75,160,0.08)', borderRadius: 7 }}>
            <IconHome />
          </div>
          Home
        </Link>
        <Link href="/lineup" style={{ textDecoration: 'none', textAlign: 'center', fontSize: 10, color: '#8e8e93', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontWeight: 500 }}>
          <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconLineup />
          </div>
          Lineup
        </Link>
        <Link href="/players" style={{ textDecoration: 'none', textAlign: 'center', fontSize: 10, color: '#8e8e93', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontWeight: 500 }}>
          <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconPlayers />
          </div>
          Players
        </Link>
        <Link href="/admin" style={{ textDecoration: 'none', textAlign: 'center', fontSize: 10, color: '#8e8e93', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontWeight: 500 }}>
          <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconLeague />
          </div>
          League
        </Link>
      </nav>
    </div>
    </AppFrame>
  )
}
