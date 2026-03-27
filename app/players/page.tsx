'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { AppFrame } from '@/app/components/AppFrame'

/* ─── IPL teams ─── */
const teams = [
  { code: 'MI', name: 'Mumbai Indians', color: '#004BA0' },
  { code: 'CSK', name: 'Chennai Super Kings', color: '#F9CD05' },
  { code: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24' },
  { code: 'KKR', name: 'Kolkata Knight Riders', color: '#3A225D' },
  { code: 'DC', name: 'Delhi Capitals', color: '#004C93' },
  { code: 'RR', name: 'Rajasthan Royals', color: '#EA1A85' },
  { code: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A' },
  { code: 'GT', name: 'Gujarat Titans', color: '#0EB1A2' },
  { code: 'LSG', name: 'Lucknow Super Giants', color: '#00AEEF' },
  { code: 'PBKS', name: 'Punjab Kings', color: '#ED1B24' },
]

const teamColorMap: Record<string, string> = {}
teams.forEach((t) => { teamColorMap[t.code] = t.color })

const teamNameMap: Record<string, string> = {}
teams.forEach((t) => { teamNameMap[t.code] = t.name })

/* Role badge styles matching mockup */
const roleBadgeStyles: Record<string, { bg: string; color: string }> = {
  BAT:  { bg: 'rgba(249,205,5,0.12)', color: '#9a7d00' },
  BOWL: { bg: 'rgba(0,75,160,0.1)',   color: '#004BA0' },
  ALL:  { bg: 'rgba(14,177,162,0.1)', color: '#0a7a65' },
  WK:   { bg: 'rgba(234,26,133,0.08)', color: '#c0186e' },
}

const roles = ['All', 'BAT', 'BOWL', 'ALL', 'WK'] as const

/* ─── Types ─── */
interface Player {
  id: string
  fullname: string
  role: string
  iplTeamCode: string | null
  iplTeamName: string | null
  imageUrl: string | null
  seasonPoints: number
  matchesPlayed: number
}

interface Performance {
  id: string
  runs: number | null
  balls: number | null
  fours: number | null
  sixes: number | null
  strikeRate: number | null
  overs: number | null
  maidens: number | null
  runsConceded: number | null
  wickets: number | null
  economyRate: number | null
  dotBalls: number | null
  catches: number
  stumpings: number
  runoutsDirect: number
  runoutsAssisted: number
  fantasyPoints: number
  match: {
    startingAt: string
    localTeamName: string
    visitorTeamName: string
    gameweek: { number: number } | null
  }
}

interface CareerBatting {
  matches: number
  innings: number
  runs: number
  balls: number
  fours: number
  sixes: number
  strikeRate: number
  average: number
  highestScore: number | null
  hundreds: number
  fifties: number
  notOuts: number
}

interface CareerBowling {
  matches: number
  innings: number
  overs: number
  runs: number
  wickets: number
  economyRate: number
  average: number
  bestInnings: string | null
  fourWickets: number
  fiveWickets: number
}

interface SeasonBattingStat {
  runs: number
  matches: number
  innings: number
  balls: number
  fours: number
  sixes: number
  strikeRate: number
  average: number
  highestScore: number | null
}

interface SeasonBowlingStat {
  wickets: number
  matches: number
  overs: number
  runs: number
  economyRate: number
  average: number
}

interface SeasonEntry {
  seasonId: number
  seasonName: string
  batting?: SeasonBattingStat
  bowling?: SeasonBowlingStat
}

interface PlayerDetailData {
  player: {
    id: string
    fullname: string
    firstname: string
    lastname: string
    role: string
    iplTeamName: string | null
    iplTeamCode: string | null
    battingStyle: string | null
    bowlingStyle: string | null
    imageUrl: string | null
  }
  stats: {
    totalPoints: number
    matches: number
    runs: number
    wickets: number
    catches: number
    avgPointsPerMatch: number
  }
  performances: Performance[]
  teams: { teamName: string; leagueName: string }[]
  dataSource?: 'local' | 'sportmonks' | 'none'
  careerStats?: {
    batting: CareerBatting | null
    bowling: CareerBowling | null
    isIplSpecific?: boolean
  } | null
  seasonStats?: {
    seasons: SeasonEntry[]
  } | null
}

/* ─── Helpers ─── */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

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
const IconShield = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
)
const SearchIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
)

export default function PlayersPage() {
  const { data: session, status: sessionStatus } = useSession()

  const [players, setPlayers] = useState<Player[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeRole, setActiveRole] = useState<string>('All')
  const [activeTeam, setActiveTeam] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [playerDetail, setPlayerDetail] = useState<PlayerDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeGwTab, setActiveGwTab] = useState('Season')
  const [activeSeasonTab, setActiveSeasonTab] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoOpenRef = useRef(false)

  /* Auto-open player profile if ?playerId=xxx in URL */
  useEffect(() => {
    if (autoOpenRef.current) return
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('playerId')
    if (!pid) return
    autoOpenRef.current = true
    const stub: Player = { id: pid, fullname: '', role: '', iplTeamCode: null, iplTeamName: null, imageUrl: null, seasonPoints: 0, matchesPlayed: 0 }
    openPlayerSheet(stub)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Open / close player detail sheet */
  const openPlayerSheet = async (player: Player) => {
    setSelectedPlayer(player)
    setPlayerDetail(null)
    setDetailLoading(true)
    setActiveGwTab('Season')
    setActiveSeasonTab(null)
    // Trigger open on next frame for animation
    requestAnimationFrame(() => setSheetOpen(true))
    try {
      const res = await fetch(`/api/players/${player.id}`)
      if (res.ok) {
        const data: PlayerDetailData = await res.json()
        setPlayerDetail(data)
        // Default to most recent GW if available
        if (data.performances.length > 0) {
          const gwNumbers = data.performances
            .map((p) => p.match.gameweek?.number)
            .filter((n): n is number => n != null)
          if (gwNumbers.length > 0) {
            setActiveGwTab(`GW${Math.max(...gwNumbers)}`)
          }
        }
      }
    } catch { /* silent */ }
    finally { setDetailLoading(false) }
  }
  const closePlayerSheet = () => {
    setSheetOpen(false)
    setTimeout(() => { setSelectedPlayer(null); setPlayerDetail(null) }, 300)
  }

  /* Debounce search */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  /* Fetch players */
  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeRole !== 'All') params.set('role', activeRole)
      if (activeTeam !== 'ALL') params.set('team', activeTeam)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('limit', '50')

      const res = await fetch(`/api/players?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setPlayers(data.players)
        setTotal(data.total)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [activeRole, activeTeam, debouncedSearch])

  useEffect(() => {
    if (sessionStatus === 'authenticated') fetchPlayers()
  }, [sessionStatus, fetchPlayers])

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
          <p style={{ color: '#888', fontSize: 14 }}>Please log in to browse players.</p>
          <a href="/login" style={{
            background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
            color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}>Go to Login</a>
        </div>
      </AppFrame>
    )
  }

  /* ─── Player detail sheet constants ─── */
  const roleIconGradients: Record<string, { bg: string; color: string; label: string }> = {
    BAT:  { bg: 'linear-gradient(135deg, #F9CD05, #e0b800)', color: '#1a1a1a', label: 'BA' },
    BOWL: { bg: 'linear-gradient(135deg, #004BA0, #0066cc)', color: '#fff', label: 'BO' },
    ALL:  { bg: 'linear-gradient(135deg, #0EB1A2, #089e90)', color: '#fff', label: 'AR' },
    WK:   { bg: 'linear-gradient(135deg, #EA1A85, #c4166e)', color: '#fff', label: 'WK' },
  }

  const roleFullName: Record<string, string> = {
    BAT: 'Batsman', BOWL: 'Bowler', ALL: 'All-Rounder', WK: 'Wicket-keeper',
  }

  return (
    <AppFrame>
    <div style={{
      position: 'relative',
      paddingBottom: 80,
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
      WebkitFontSmoothing: 'antialiased',
    } as React.CSSProperties}>

      {/* ── Hero Header ── */}
      <div style={{
        background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
        padding: '40px 0 16px',
      }}>
        {/* App bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 12px' }}>
          <div style={{
            fontSize: 15, fontWeight: 900, letterSpacing: -0.5,
            background: 'linear-gradient(135deg, #F9CD05, #FF822A)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          } as React.CSSProperties}>FAL</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>Players</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{total} total</div>
        </div>

        {/* Search bar */}
        <div style={{ margin: '0 16px 10px', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.5)' }}>
            <SearchIcon />
          </div>
          <input
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px 11px 38px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
            } as React.CSSProperties}
          />
        </div>

        {/* Role filter pills */}
        <div style={{
          display: 'flex', gap: 6, margin: '0 16px', overflowX: 'auto',
          scrollbarWidth: 'none', paddingBottom: 2,
        } as React.CSSProperties}>
          {roles.map((role) => {
            const isActive = activeRole === role
            return (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: isActive ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.15)',
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
              >
                {role}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Team filter chips ── */}
      <div style={{
        display: 'flex', gap: 4, padding: '12px 16px 4px',
        overflowX: 'auto', scrollbarWidth: 'none',
      } as React.CSSProperties}>
        <button
          onClick={() => setActiveTeam('ALL')}
          style={{
            padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
            whiteSpace: 'nowrap', cursor: 'pointer', letterSpacing: 0.3,
            fontFamily: 'inherit',
            border: activeTeam === 'ALL' ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(0,0,0,0.06)',
            background: activeTeam === 'ALL' ? '#f0f0f4' : '#fff',
            color: '#555',
            transition: 'all 0.2s',
          }}
        >
          ALL
        </button>
        {teams.map((t) => {
          const isActive = activeTeam === t.code
          return (
            <button
              key={t.code}
              onClick={() => setActiveTeam(t.code)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                whiteSpace: 'nowrap', cursor: 'pointer', letterSpacing: 0.3,
                fontFamily: 'inherit',
                border: isActive ? `1px solid ${t.color}40` : '1px solid rgba(0,0,0,0.06)',
                background: isActive ? `${t.color}14` : '#fff',
                color: isActive ? t.color : '#999',
                transition: 'all 0.2s',
              }}
            >
              {t.code}
            </button>
          )
        })}
      </div>

      {/* ── Player list ── */}
      <div style={{ padding: '8px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && players.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 14 }}>Loading players...</div>
        )}

        {!loading && players.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 14 }}>No players found.</div>
        )}

        {players.map((player) => {
          const teamColor = teamColorMap[player.iplTeamCode || ''] || '#888'
          const badge = roleBadgeStyles[player.role] || roleBadgeStyles.BAT
          const initials = getInitials(player.fullname)
          const pts = player.seasonPoints

          return (
            <div
              key={player.id}
              onClick={() => openPlayerSheet(player)}
              style={{
                display: 'flex', alignItems: 'center', padding: 12,
                borderRadius: 16, gap: 10, position: 'relative',
                background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                overflow: 'hidden', cursor: 'pointer',
              }}
            >
              {/* Team accent bar */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                background: teamColor,
              }} />

              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
                background: `linear-gradient(135deg, ${teamColor}, ${teamColor}cc)`,
              }}>
                {initials}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0, paddingLeft: 2 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: '#1a1a2e', letterSpacing: -0.2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {player.fullname}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    background: badge.bg, color: badge.color,
                  }}>
                    {player.role}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: teamColor }}>
                    {player.iplTeamCode || ''}
                  </span>
                </div>
              </div>

              {/* Points */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: '#1a1a2e',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {pts}
                </div>
                <div style={{ fontSize: 9, color: '#999', marginTop: 1 }}>season pts</div>
                <div style={{ fontSize: 9, color: '#bbb', marginTop: 1 }}>{player.matchesPlayed} {player.matchesPlayed === 1 ? 'match' : 'matches'}</div>
              </div>
            </div>
          )
        })}

        {/* Spacer for bottom nav */}
        <div style={{ height: 40 }} />
      </div>

      {/* ── Player Detail Bottom Sheet ── */}
      {selectedPlayer && (() => {
        const iconInfo = roleIconGradients[selectedPlayer.role] || roleIconGradients.BAT
        const detail = playerDetail

        // Build GW tabs from real data
        const gwNumbers = detail
          ? [...new Set(detail.performances.map((p) => p.match.gameweek?.number).filter((n): n is number => n != null))].sort((a, b) => b - a).slice(0, 3)
          : []
        const gwTabs = [...gwNumbers.map((n) => `GW${n}`), 'Season']

        // Get performances for the active tab
        const getActivePerformances = (): Performance[] => {
          if (!detail) return []
          if (activeGwTab === 'Season') return detail.performances
          const gwNum = parseInt(activeGwTab.replace('GW', ''))
          return detail.performances.filter((p) => p.match.gameweek?.number === gwNum)
        }

        const activePerfs = getActivePerformances()

        // Aggregate stats for active performances
        const aggregateStats = (perfs: Performance[]) => ({
          runs: perfs.reduce((s, p) => s + (p.runs ?? 0), 0),
          balls: perfs.reduce((s, p) => s + (p.balls ?? 0), 0),
          fours: perfs.reduce((s, p) => s + (p.fours ?? 0), 0),
          sixes: perfs.reduce((s, p) => s + (p.sixes ?? 0), 0),
          wickets: perfs.reduce((s, p) => s + (p.wickets ?? 0), 0),
          overs: perfs.reduce((s, p) => s + (p.overs ?? 0), 0),
          maidens: perfs.reduce((s, p) => s + (p.maidens ?? 0), 0),
          runsConceded: perfs.reduce((s, p) => s + (p.runsConceded ?? 0), 0),
          dotBalls: perfs.reduce((s, p) => s + (p.dotBalls ?? 0), 0),
          catches: perfs.reduce((s, p) => s + p.catches, 0),
          stumpings: perfs.reduce((s, p) => s + p.stumpings, 0),
          runouts: perfs.reduce((s, p) => s + p.runoutsDirect + p.runoutsAssisted, 0),
          fantasyPoints: perfs.reduce((s, p) => s + p.fantasyPoints, 0),
          matches: perfs.length,
        })

        const agg = aggregateStats(activePerfs)

        // Build stats grid based on role
        const buildStatsGrid = () => {
          const role = selectedPlayer.role
          if (role === 'BAT') return {
            section: 'Batting',
            stats: [
              { val: String(agg.runs), label: 'Runs' },
              { val: String(agg.fours), label: '4s' },
              { val: String(agg.sixes), label: '6s' },
              { val: agg.balls > 0 ? ((agg.runs / agg.balls) * 100).toFixed(1) : '0.0', label: 'SR' },
              { val: String(agg.balls), label: 'Balls' },
            ],
          }
          if (role === 'BOWL') return {
            section: 'Bowling',
            stats: [
              { val: String(agg.wickets), label: 'Wkts' },
              { val: agg.overs.toFixed(1), label: 'Overs' },
              { val: String(agg.runsConceded), label: 'Runs' },
              { val: String(agg.maidens), label: 'Maiden' },
              { val: agg.overs > 0 ? (agg.runsConceded / agg.overs).toFixed(1) : '0.0', label: 'Econ' },
            ],
          }
          if (role === 'WK') return {
            section: 'Wicket-keeping',
            stats: [
              { val: String(agg.runs), label: 'Runs' },
              { val: String(agg.fours), label: '4s' },
              { val: String(agg.catches), label: 'Catches' },
              { val: String(agg.stumpings), label: 'Stumpings' },
              { val: agg.balls > 0 ? ((agg.runs / agg.balls) * 100).toFixed(1) : '0.0', label: 'SR' },
            ],
          }
          // ALL
          return {
            section: 'All-Round',
            stats: [
              { val: String(agg.runs), label: 'Runs' },
              { val: String(agg.wickets), label: 'Wkts' },
              { val: agg.balls > 0 ? ((agg.runs / agg.balls) * 100).toFixed(1) : '0.0', label: 'SR' },
              { val: agg.overs > 0 ? (agg.runsConceded / agg.overs).toFixed(1) : '0.0', label: 'Econ' },
              { val: String(agg.catches), label: 'Catches' },
            ],
          }
        }

        const statsGrid = buildStatsGrid()
        const hasData = activePerfs.length > 0

        return (
          <>
            {/* Overlay */}
            <div
              onClick={closePlayerSheet}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                zIndex: 200,
                opacity: sheetOpen ? 1 : 0,
                pointerEvents: sheetOpen ? 'all' : 'none',
                transition: 'opacity 0.25s ease',
              } as React.CSSProperties}
            />

            {/* Sheet */}
            <div style={{
              position: 'fixed', bottom: 0, left: '50%',
              transform: sheetOpen ? 'translate(-50%, 0)' : 'translate(-50%, 100%)',
              width: '100%', maxWidth: 480,
              background: '#fff',
              borderRadius: '22px 22px 0 0',
              zIndex: 201,
              transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
              maxHeight: '80vh',
              overflow: 'hidden',
              boxShadow: '0 -6px 30px rgba(0,0,0,0.15)',
            }}>
              {/* Handle */}
              <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '10px auto 0' }} />

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 8px', position: 'relative' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: iconInfo.bg, color: iconInfo.color,
                  flexShrink: 0,
                }}>
                  {iconInfo.label}
                </div>
                <div style={{ flex: 1, paddingRight: 30 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{selectedPlayer.fullname}</div>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>
                    {selectedPlayer.iplTeamCode || ''} · {roleFullName[selectedPlayer.role] || selectedPlayer.role}{detail ? (detail.stats.matches > 0 ? ` · ${detail.stats.matches} matches` : detail.careerStats?.batting?.matches ? ` · ${detail.careerStats.batting.matches} ${detail.careerStats.isIplSpecific ? 'IPL' : 'T20'} matches` : '') : ''}
                  </div>
                </div>
                <button
                  onClick={closePlayerSheet}
                  style={{
                    position: 'absolute', top: 12, right: 14,
                    width: 28, height: 28, borderRadius: '50%', background: '#f2f3f8',
                    border: 'none', cursor: 'pointer', fontSize: 14, color: '#999',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ borderBottom: '1px solid #f0f0f4' }} />

              {/* Scrollable content */}
              <div style={{
                overflowY: 'auto', maxHeight: 'calc(80vh - 130px)', padding: '4px 0 24px',
                scrollbarWidth: 'none',
              } as React.CSSProperties}>

                {/* Loading state */}
                {detailLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                    <div style={{
                      width: 24, height: 24, border: '3px solid #e8eaf0', borderTopColor: '#004BA0',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                  </div>
                )}

                {/* Batting/bowling tables */}
                {!detailLoading && detail && (() => {
                  const apiSeasons = detail.seasonStats?.seasons ?? []
                  const cs = detail.careerStats
                  const hasBatting = (cs?.batting && cs.batting.matches > 0) || apiSeasons.some(s => s.batting && s.batting.matches > 0)
                  const hasBowling = (cs?.bowling && cs.bowling.wickets > 0) || apiSeasons.some(s => s.bowling && s.bowling.wickets > 0)

                  if (!hasBatting && !hasBowling) {
                    return (
                      <div style={{ textAlign: 'center', padding: '32px 16px', color: '#aaa', fontSize: 12, fontWeight: 500 }}>
                        No match data available yet
                      </div>
                    )
                  }

                  // Build batting rows: T20 Career first, then seasons descending
                  type BatRow = { label: string; isCareer: boolean; isMostRecent: boolean; mat: number; runs: number; avg: string; sr: string; fiftyHundred: string; foursSixes: string }
                  const batRows: BatRow[] = []
                  if (cs?.batting && cs.batting.matches > 0) {
                    const b = cs.batting
                    batRows.push({
                      label: 'T20', isCareer: true, isMostRecent: false,
                      mat: b.matches, runs: b.runs,
                      avg: b.average > 0 ? b.average.toFixed(1) : '—',
                      sr: b.strikeRate > 0 ? b.strikeRate.toFixed(1) : '—',
                      fiftyHundred: `${b.fifties}/${b.hundreds}`,
                      foursSixes: `${b.fours}/${b.sixes}`,
                    })
                  }
                  const sortedBatSeasons = [...apiSeasons].filter(s => s.batting && s.batting.matches > 0).sort((a, b) => b.seasonId - a.seasonId)
                  sortedBatSeasons.forEach((s, idx) => {
                    const b = s.batting!
                    batRows.push({
                      label: s.seasonName.replace('IPL ', ''), isCareer: false, isMostRecent: idx === 0,
                      mat: b.matches, runs: b.runs,
                      avg: b.average > 0 ? b.average.toFixed(1) : '—',
                      sr: b.strikeRate > 0 ? b.strikeRate.toFixed(1) : '—',
                      fiftyHundred: '—',
                      foursSixes: `${b.fours}/${b.sixes}`,
                    })
                  })

                  // Build bowling rows: T20 Career first, then seasons descending
                  type BowlRow = { label: string; isCareer: boolean; isMostRecent: boolean; mat: number; wkts: number; avg: string; econ: string; sr: string; fourFive: string }
                  const bowlRows: BowlRow[] = []
                  if (cs?.bowling && cs.bowling.wickets > 0) {
                    const bw = cs.bowling
                    const balls = Math.floor(bw.overs) * 6 + Math.round((bw.overs % 1) * 10)
                    const bowlSR = bw.wickets > 0 ? (balls / bw.wickets).toFixed(1) : '—'
                    bowlRows.push({
                      label: 'T20', isCareer: true, isMostRecent: false,
                      mat: bw.matches, wkts: bw.wickets,
                      avg: bw.average > 0 ? bw.average.toFixed(1) : '—',
                      econ: bw.economyRate > 0 ? bw.economyRate.toFixed(1) : '—',
                      sr: bowlSR,
                      fourFive: `${bw.fourWickets}/${bw.fiveWickets}`,
                    })
                  }
                  const sortedBowlSeasons = [...apiSeasons].filter(s => s.bowling && s.bowling.wickets > 0).sort((a, b) => b.seasonId - a.seasonId)
                  sortedBowlSeasons.forEach((s, idx) => {
                    const bw = s.bowling!
                    const balls = Math.floor(bw.overs) * 6 + Math.round((bw.overs % 1) * 10)
                    const bowlSR = bw.wickets > 0 ? (balls / bw.wickets).toFixed(1) : '—'
                    bowlRows.push({
                      label: s.seasonName.replace('IPL ', ''), isCareer: false, isMostRecent: idx === 0,
                      mat: bw.matches, wkts: bw.wickets,
                      avg: bw.average > 0 ? bw.average.toFixed(1) : '—',
                      econ: bw.economyRate > 0 ? bw.economyRate.toFixed(1) : '—',
                      sr: bowlSR,
                      fourFive: '—',
                    })
                  })

                  const thStyle: React.CSSProperties = {
                    padding: '6px 4px', fontSize: 9, fontWeight: 600, color: '#888',
                    textTransform: 'uppercase', textAlign: 'right', whiteSpace: 'nowrap',
                  }
                  const tdStyle: React.CSSProperties = {
                    padding: '6px 4px', fontSize: 11, fontVariantNumeric: 'tabular-nums',
                    color: '#1a1a2e', textAlign: 'right', whiteSpace: 'nowrap',
                  }

                  return (
                    <>
                      {/* Batting table */}
                      {batRows.length > 0 && (
                        <div style={{ padding: '10px 16px 4px' }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                            Batting
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '1px solid #eef0f5', borderRadius: 10, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: '#fafbfd' }}>
                                <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 8 }}></th>
                                <th style={thStyle}>Mat</th>
                                <th style={thStyle}>Runs</th>
                                <th style={thStyle}>Avg</th>
                                <th style={thStyle}>SR</th>
                                <th style={thStyle}>50/100</th>
                                <th style={thStyle}>4s/6s</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batRows.map((r, i) => (
                                <tr key={i} style={{
                                  background: r.isCareer ? 'rgba(0,75,160,0.04)' : i % 2 === 0 ? '#fff' : '#fafbfd',
                                }}>
                                  <td style={{ padding: '6px 4px 6px 8px', fontSize: 10, fontWeight: r.isMostRecent ? 700 : 600, color: r.isCareer ? '#004BA0' : '#1a1a2e', whiteSpace: 'nowrap' }}>
                                    {r.label}
                                  </td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400 }}>{r.mat}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400 }}>{r.runs}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.avg}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.sr}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.fiftyHundred}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.foursSixes}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Bowling table */}
                      {bowlRows.length > 0 && (
                        <div style={{ padding: '10px 16px 4px' }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                            Bowling
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '1px solid #eef0f5', borderRadius: 10, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: '#fafbfd' }}>
                                <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 8 }}></th>
                                <th style={thStyle}>Mat</th>
                                <th style={thStyle}>Wkts</th>
                                <th style={thStyle}>Avg</th>
                                <th style={thStyle}>Econ</th>
                                <th style={thStyle}>SR</th>
                                <th style={thStyle}>4W/5W</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bowlRows.map((r, i) => (
                                <tr key={i} style={{
                                  background: r.isCareer ? 'rgba(0,75,160,0.04)' : i % 2 === 0 ? '#fff' : '#fafbfd',
                                }}>
                                  <td style={{ padding: '6px 4px 6px 8px', fontSize: 10, fontWeight: r.isMostRecent ? 700 : 600, color: r.isCareer ? '#004BA0' : '#1a1a2e', whiteSpace: 'nowrap' }}>
                                    {r.label}
                                  </td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400 }}>{r.mat}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400 }}>{r.wkts}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.avg}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.econ}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.sr}</td>
                                  <td style={{ ...tdStyle, fontWeight: r.isMostRecent ? 700 : 400, color: '#444' }}>{r.fourFive}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Note about data source */}
                      {detail.performances.length === 0 && (
                        <div style={{
                          padding: '12px 16px 4px', textAlign: 'center',
                          fontSize: 9, color: '#bbb', fontWeight: 500,
                        }}>
                          FAL season stats will appear once matches are scored
                        </div>
                      )}
                    </>
                  )
                })()}

              </div>
            </div>
          </>
        )
      })()}

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
        padding: '8px 0 env(safe-area-inset-bottom, 8px)',
        zIndex: 100,
      }}>
        {[
          { href: '/', label: 'Home', icon: <IconHome />, active: false },
          { href: '/lineup', label: 'Lineup', icon: <IconLineup />, active: false },

          { href: '/players', label: 'Players', icon: <IconPlayers />, active: true },
          { href: '/admin', label: 'League', icon: <IconLeague />, active: false },
          ...(session?.user?.isAppAdmin ? [{ href: '/app-admin', label: 'Admin', icon: <IconShield />, active: false }] : []),
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: item.active ? '#004BA0' : '#8e8e93',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              fontWeight: item.active ? 700 : 500,
              position: 'relative',
              textDecoration: 'none',
              padding: '0 8px',
            }}
          >
            {item.active && (
              <div style={{
                position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                width: 36, height: 3, borderRadius: 2, background: '#004BA0',
              }} />
            )}
            <div style={{ lineHeight: 1 }}>{item.icon}</div>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
    </AppFrame>
  )
}
