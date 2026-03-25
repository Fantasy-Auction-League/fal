'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { AppFrame } from '@/app/components/AppFrame'

/* ─── Types ─── */
interface Standing {
  rank: number
  teamId: string
  teamName: string
  manager: string | null
  managerId: string
  totalPoints: number
  bestGwScore: number
  lastGwPoints: number
  lastGwNumber: number | null
}

interface HistoryGW {
  gameweekId: string
  gameweekNumber: number
  scores: {
    teamId: string
    teamName: string
    manager: string | null
    totalPoints: number
    chipUsed: string | null
  }[]
}

interface GameweekInfo {
  id: string
  number: number
  status: string
}

/* ─── Icons ─── */
const IconHome = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
)
const IconLineup = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
)
const IconPlayers = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
)
const IconLeague = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
)

export default function StandingsPage() {
  const { data: session } = useSession()
  const [standings, setStandings] = useState<Standing[]>([])
  const [history, setHistory] = useState<HistoryGW[]>([])
  const [gameweeks, setGameweeks] = useState<GameweekInfo[]>([])
  const [activeGW, setActiveGW] = useState<number | null>(null)
  const [leagueName, setLeagueName] = useState('')
  const [loading, setLoading] = useState(true)

  const userId = session?.user?.id
  const activeLeagueId = session?.user?.activeLeagueId

  useEffect(() => {
    async function fetchData() {
      try {
        const [leaguesRes, gwRes] = await Promise.all([
          fetch('/api/leagues'),
          fetch('/api/gameweeks'),
        ])

        if (gwRes.ok) {
          const gwData: GameweekInfo[] = await gwRes.json()
          setGameweeks(gwData)
          if (gwData.length > 0) {
            setActiveGW(gwData[gwData.length - 1].number)
          }
        }

        if (!leaguesRes.ok) return
        const leagues = await leaguesRes.json()
        if (leagues.length === 0) return

        const targetLeague = leagues.find((l: any) => l.id === activeLeagueId) || leagues[0]
        const leagueId = targetLeague.id
        setLeagueName(targetLeague.name || '')

        const [standingsRes, historyRes] = await Promise.all([
          fetch(`/api/leaderboard/${leagueId}`),
          fetch(`/api/leaderboard/${leagueId}/history`),
        ])

        if (standingsRes.ok) {
          const data = await standingsRes.json()
          setStandings(data.standings || [])
        }
        if (historyRes.ok) {
          const data = await historyRes.json()
          setHistory(data.history || [])
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [activeLeagueId])

  // Build standings for active GW from history
  const gwHistory = activeGW ? history.find(h => h.gameweekNumber === activeGW) : null

  // Merge: use GW-specific scores if available, otherwise fall back to season standings
  const displayStandings = standings.map(s => {
    const gwScore = gwHistory?.scores.find(sc => sc.teamId === s.teamId)
    return {
      ...s,
      gwPoints: gwScore?.totalPoints ?? 0,
    }
  })

  if (loading) {
    return (
      <AppFrame>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888', fontSize: 14 }}>Loading...</p>
        </div>
      </AppFrame>
    )
  }

  return (
    <AppFrame>
    <div style={{
      position: 'relative',
      paddingBottom: 80,
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* ── Hero Header ── */}
      <div style={{
        background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
        padding: '40px 18px 20px',
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

        {/* Top row: back arrow + page label */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Link href="/" style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, color: '#fff',
            textDecoration: 'none',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}>
            &#8592;
          </Link>
          <div style={{
            fontSize: 18, fontWeight: 900, letterSpacing: -0.5,
            background: 'linear-gradient(135deg, #F9CD05, #FF822A)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>Fantasy</div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
            League Standings
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginTop: 4 }}>
            {leagueName}
          </div>
        </div>
      </div>

      {/* ── GW Tab Selector ── */}
      <div style={{
        padding: '6px 14px 10px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
          {gameweeks.length === 0 ? (
            <div style={{ fontSize: 12, color: '#999', padding: '6px 14px' }}>No gameweeks yet</div>
          ) : (
            [...gameweeks].reverse().map((gw) => (
              <button
                key={gw.number}
                onClick={() => setActiveGW(gw.number)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  color: activeGW === gw.number ? '#fff' : '#888',
                  background: activeGW === gw.number ? '#004BA0' : '#fff',
                  border: activeGW === gw.number ? '1px solid #004BA0' : '1px solid rgba(0,0,0,0.06)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: activeGW === gw.number ? '0 2px 8px rgba(0,75,160,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                GW{gw.number}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Standings Table ── */}
      <div style={{ padding: '0 14px' }}>
        <div style={{
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 16,
          padding: 14,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'flex',
            padding: '0 10px 8px',
            fontSize: 9,
            fontWeight: 600,
            color: '#aaa',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            gap: 8,
            borderBottom: '1px solid #f0f0f4',
            marginBottom: 4,
          }}>
            <div style={{ width: 22 }}>#</div>
            <div style={{ flex: 1 }}>Team</div>
            <div style={{ width: 24, textAlign: 'center' }}>{'\u0394'}</div>
            <div style={{ width: 36, textAlign: 'right' }}>GW</div>
            <div style={{ width: 46, textAlign: 'right' }}>Total</div>
          </div>

          {/* Rows */}
          {displayStandings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 13 }}>No standings data yet</div>
          ) : displayStandings.map((team, i) => {
            const rank = team.rank
            const isYou = team.managerId === userId

            // Rank badge
            let rankBg = '#f2f3f8'
            let rankColor = '#999'
            if (rank === 1) { rankBg = 'rgba(249,205,5,0.12)'; rankColor = '#b58800' }
            else if (rank === 2 && isYou) { rankBg = 'rgba(0,75,160,0.1)'; rankColor = '#004BA0' }
            else if (rank === 3) { rankBg = 'rgba(192,199,208,0.15)'; rankColor = '#777' }
            else if (rank === 4) { rankBg = 'rgba(205,127,50,0.1)'; rankColor = '#a0724a' }

            // Points color
            let ptsColor = '#333'
            if (isYou) { ptsColor = '#004BA0' }
            else if (rank === 1) { ptsColor = '#b58800' }

            const rowContent = (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 10px',
                borderRadius: 10,
                gap: 8,
                fontSize: 12.5,
                cursor: isYou ? 'default' : 'pointer',
                position: 'relative',
                background: isYou ? 'rgba(0,75,160,0.04)' : 'transparent',
                border: isYou ? '1.5px solid rgba(0,75,160,0.1)' : '1.5px solid transparent',
                marginTop: i > 0 ? 1 : 0,
              }}>
                {/* Rank badge */}
                <div style={{
                  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 7, fontSize: 10, fontWeight: 700,
                  background: rankBg, color: rankColor,
                }}>{rank}</div>
                {/* Manager name */}
                <div style={{
                  flex: 1,
                  fontWeight: isYou ? 700 : 500,
                  color: isYou ? '#111' : rank === 1 ? '#222' : '#555',
                }}>{isYou ? 'You' : (team.teamName ?? 'Team')}</div>
                {/* Delta placeholder */}
                <div style={{
                  fontSize: 10, fontWeight: 700, width: 24, textAlign: 'center',
                  color: '#ccc',
                }}>{'\u2014'}</div>
                {/* GW score */}
                <div style={{
                  fontSize: 11, color: '#999', fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  width: 36, textAlign: 'right',
                }}>{team.gwPoints}</div>
                {/* Total */}
                <div style={{
                  fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: ptsColor,
                  width: 46, textAlign: 'right',
                }}>{team.totalPoints.toLocaleString()}</div>
              </div>
            )

            if (isYou) {
              return <div key={team.teamId}>{rowContent}</div>
            }

            return (
              <Link
                key={team.teamId}
                href={`/view-lineup/${team.teamId}`}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                {rowContent}
              </Link>
            )
          })}
        </div>
      </div>

      <div style={{ height: 30 }} />

      {/* ── Bottom Navigation ── */}
      <nav className="bottom-nav-fixed" style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: '#fff',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 8px env(safe-area-inset-bottom, 24px)',
        zIndex: 100,
      }}>
        <NavItem href="/" icon={<IconHome />} label="Home" active={false} />
        <NavItem href="/lineup" icon={<IconLineup />} label="Lineup" active={false} />
        <NavItem href="/players" icon={<IconPlayers />} label="Players" active={false} />
        <NavItem href="/admin" icon={<IconLeague />} label="League" active={false} />
      </nav>
    </div>
    </AppFrame>
  )
}

/* ─── Nav Item ─── */
function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} style={{
      textAlign: 'center',
      fontSize: 10,
      color: active ? '#004BA0' : '#8e8e93',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      fontWeight: active ? 600 : 500,
      textDecoration: 'none',
    }}>
      <div style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
        background: active ? 'rgba(0,75,160,0.08)' : 'transparent',
        borderRadius: 7,
      }}>{icon}</div>
      {label}
    </Link>
  )
}
