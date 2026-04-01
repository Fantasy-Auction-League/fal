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
  chipUsed: string | null
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

/* ─── Helpers ─── */
function getInitials(name: string | null): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/* ─── Avatar gradients ─── */
const avatarStyles: Record<number, { bg: string; shadow: string; color: string }> = {
  0: { bg: 'linear-gradient(135deg, #F9CD05, #FF822A)', shadow: '0 4px 16px rgba(249,205,5,0.3)', color: '#F9CD05' },
  1: { bg: 'linear-gradient(135deg, #a0c4ff, #004BA0)', shadow: '0 4px 12px rgba(0,75,160,0.25)', color: '#a0c4ff' },
  2: { bg: 'linear-gradient(135deg, #0EB1A2, #088a7e)', shadow: '0 4px 12px rgba(14,177,162,0.25)', color: '#a8f0d0' },
}

const rankAvatarGradients = [
  'linear-gradient(135deg, #F9CD05, #FF822A)',
  'linear-gradient(135deg, #004BA0, #004C93)',
  'linear-gradient(135deg, #0EB1A2, #088a7e)',
  'linear-gradient(135deg, #3A225D, #5a3a8a)',
  'linear-gradient(135deg, #EA1A85, #c4157a)',
  'linear-gradient(135deg, #00AEEF, #009acc)',
]

/* ─── Icons ─── */
const IconHome = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
)
const IconLineup = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
)
const IconBoard = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
)
const IconPlayers = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
)
const IconLeague = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
)

export default function LeaderboardPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<'season' | 'gw' | 'history'>('season')
  const [standings, setStandings] = useState<Standing[]>([])
  const [history, setHistory] = useState<HistoryGW[]>([])
  const [leagueName, setLeagueName] = useState('')
  const [loading, setLoading] = useState(true)

  const userId = session?.user?.id
  const activeLeagueId = session?.user?.activeLeagueId

  useEffect(() => {
    async function fetchData() {
      try {
        const leaguesRes = await fetch('/api/leagues')
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

  // Derive data
  const first = standings[0]
  const second = standings[1]
  const third = standings[2]
  const hasPodium = standings.length >= 3

  // Find current user's GW history scores
  const yourScores: { gw: number; pts: number }[] = []
  if (userId && history.length > 0) {
    for (const gw of history) {
      const mine = gw.scores.find(s => {
        const standing = standings.find(st => st.teamId === s.teamId)
        return standing?.managerId === userId
      })
      if (mine) yourScores.push({ gw: gw.gameweekNumber, pts: mine.totalPoints })
    }
  }
  const yourAvg = yourScores.length > 0 ? Math.round(yourScores.reduce((a, b) => a + b.pts, 0) / yourScores.length) : 0
  const yourBest = yourScores.length > 0 ? Math.max(...yourScores.map(s => s.pts)) : 0
  const yourBestGW = yourScores.find(s => s.pts === yourBest)
  const yourTotal = standings.find(s => s.managerId === userId)?.totalPoints ?? 0
  const maxGW = yourScores.length > 0 ? Math.max(...yourScores.map(s => s.pts)) : 1
  const lastGwNumber = standings[0]?.lastGwNumber ?? null

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
      {/* ── Gradient Hero Header ── */}
      <div style={{
        background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
        padding: '40px 0 20px',
        color: '#fff',
      }}>
        {/* App bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 20px 10px',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: -0.5,
            background: 'linear-gradient(135deg, #F9CD05, #FF822A)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>FAL</div>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: -0.3,
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
          }}>Leaderboard</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{leagueName}</div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 4,
          margin: '8px 14px 2px',
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 12,
          padding: 3,
        }}>
          {(['season', 'gw', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: 8,
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.55)',
                background: activeTab === tab ? 'rgba(255,255,255,0.22)' : 'transparent',
                boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tab === 'season' ? 'Season' : tab === 'gw' ? `GW ${lastGwNumber ?? '-'}` : 'History'}
            </button>
          ))}
        </div>

        {/* Podium */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 8,
          padding: '16px 14px 0',
        }}>
          {hasPodium ? (
            <>
              {/* 2nd place (left) */}
              <PodiumItem
                rank={2}
                initials={getInitials(second.teamName)}
                name={second.managerId === userId ? 'You' : (second.teamName ?? 'Team')}
                points={second.totalPoints}
                avatarStyle={avatarStyles[1]}
                barHeight={60}
              />
              {/* 1st place (center) */}
              <PodiumItem
                rank={1}
                initials={getInitials(first.teamName)}
                name={first.managerId === userId ? 'You' : (first.teamName ?? 'Team')}
                points={first.totalPoints}
                avatarStyle={avatarStyles[0]}
                barHeight={80}
                showCrown
              />
              {/* 3rd place (right) */}
              <PodiumItem
                rank={3}
                initials={getInitials(third.teamName)}
                name={third.managerId === userId ? 'You' : (third.teamName ?? 'Team')}
                points={third.totalPoints}
                avatarStyle={avatarStyles[2]}
                barHeight={44}
              />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600 }}>
              {standings.length === 0 ? 'No scores yet' : 'Need at least 3 teams for podium'}
            </div>
          )}
        </div>
      </div>

      {/* ── Content Area ── */}
      <div style={{ padding: '12px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Full Rankings Card */}
        <div style={{
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          {standings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 13 }}>No scores yet</div>
          ) : standings.map((team, i) => {
            const rank = team.rank
            const isYou = team.managerId === userId

            // Rank badge style
            let rankBg = 'rgba(0,0,0,0.04)'
            let rankColor = '#999'
            if (rank === 1) { rankBg = 'rgba(249,205,5,0.15)'; rankColor = '#b8960a' }
            else if (rank === 2 && isYou) { rankBg = 'rgba(0,75,160,0.1)'; rankColor = '#004BA0' }
            else if (rank === 3) { rankBg = 'rgba(14,177,162,0.1)'; rankColor = '#0EB1A2' }

            return (
              <div
                key={team.teamId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 14,
                  gap: 10,
                  position: 'relative',
                  background: isYou ? 'rgba(0,75,160,0.05)' : '#f7f8fb',
                  border: isYou ? '1px solid rgba(0,75,160,0.08)' : '1px solid rgba(0,0,0,0.04)',
                  marginTop: i > 0 ? 4 : 0,
                }}
              >
                {/* Rank */}
                <div style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: rankBg, color: rankColor,
                }}>{rank}</div>
                {/* Avatar */}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff',
                  background: rankAvatarGradients[i % rankAvatarGradients.length],
                }}>{getInitials(team.teamName)}</div>
                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: isYou || rank === 1 ? 700 : 600, color: '#1a1a2e' }}>
                    {isYou ? 'You' : (team.teamName ?? 'Team')}
                  </div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>Best GW: {team.bestGwScore}</div>
                </div>
                {/* Stats */}
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#1a1a2e' }}>
                    {team.totalPoints.toLocaleString()}
                  </div>
                  {team.lastGwNumber && (
                    <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>GW{team.lastGwNumber}: {team.lastGwPoints}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* GW History Card */}
        <div style={{
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#1a1a2e' }}>Your GW History</div>
          {yourScores.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 12 }}>Season not started</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60, padding: '0 4px' }}>
                {yourScores.map((entry, i) => {
                  const pct = maxGW > 0 ? (entry.pts / maxGW) * 100 : 0
                  const isHighest = entry.pts === maxGW
                  const isLast = i === yourScores.length - 1

                  let barBg = 'linear-gradient(to top, rgba(0,75,160,0.08), rgba(0,75,160,0.3))'
                  let extraStyle: React.CSSProperties = {}
                  if (isHighest) {
                    barBg = 'linear-gradient(to top, rgba(0,75,160,0.15), rgba(0,75,160,0.5))'
                    extraStyle = { boxShadow: '0 0 8px rgba(0,75,160,0.15)' }
                  } else if (isLast) {
                    barBg = 'linear-gradient(to top, rgba(0,75,160,0.06), rgba(0,75,160,0.2))'
                    extraStyle = { border: '1px solid rgba(0,75,160,0.12)', borderBottom: 'none' }
                  }

                  return (
                    <div
                      key={entry.gw}
                      style={{
                        flex: 1,
                        borderRadius: '4px 4px 0 0',
                        minWidth: 0,
                        position: 'relative',
                        height: `${pct}%`,
                        background: barBg,
                        cursor: 'pointer',
                        ...extraStyle,
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        bottom: -16,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: 8,
                        color: (isHighest || isLast) ? '#004BA0' : '#999',
                        fontWeight: 600,
                      }}>{entry.gw}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 22,
                fontSize: 10,
                color: '#999',
              }}>
                <span>Avg: {yourAvg}</span>
                <span>Best: {yourBest} (GW{yourBestGW?.gw ?? '-'})</span>
                <span>Total: {yourTotal.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ height: 40 }} />
      </div>

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
        padding: '6px 0 env(safe-area-inset-bottom, 24px)',
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

/* ─── Podium Item ─── */
function PodiumItem({ rank, initials, name, points, avatarStyle, barHeight, showCrown }: {
  rank: number
  initials: string
  name: string
  points: number
  avatarStyle: { bg: string; shadow: string; color: string }
  barHeight: number
  showCrown?: boolean
}) {
  const avatarSize = rank === 1 ? 54 : 44
  const fontSize = rank === 1 ? 16 : 14

  const barAlpha = rank === 1 ? 0.1 : rank === 2 ? 0.06 : 0.04
  const borderAlpha = rank === 1 ? 0.15 : rank === 2 ? 0.1 : 0.08

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{
        width: avatarSize, height: avatarSize, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize, fontWeight: 800, color: '#fff', position: 'relative',
        background: avatarStyle.bg, boxShadow: avatarStyle.shadow,
      }}>
        {showCrown && (
          <div style={{ position: 'absolute', top: -14, fontSize: 16 }}>&#128081;</div>
        )}
        {initials}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: rank === 1 ? '#fff' : 'rgba(255,255,255,0.8)' }}>{name}</div>
      <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 1, color: avatarStyle.color }}>
        {points.toLocaleString()}
      </div>
      <div style={{
        width: 80,
        borderRadius: '10px 10px 0 0',
        marginTop: 8,
        height: barHeight,
        background: `rgba(255,255,255,${barAlpha})`,
        border: `1px solid rgba(255,255,255,${borderAlpha})`,
        borderBottom: 'none',
      }} />
    </div>
  )
}

/* ─── Nav Item ─── */
function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} style={{
      textAlign: 'center',
      fontSize: 11,
      color: active ? '#004BA0' : '#8e8e93',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      fontWeight: active ? 600 : 500,
      textDecoration: 'none',
      position: 'relative',
    }}>
      {active && (
        <div style={{
          position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)',
          width: 48, height: 28, borderRadius: 14,
          background: 'rgba(0,75,160,0.08)', zIndex: 0,
        }} />
      )}
      <div style={{ width: 22, height: 22, position: 'relative', zIndex: 1 }}>{icon}</div>
      <div style={{ position: 'relative', zIndex: 1 }}>{label}</div>
    </Link>
  )
}
