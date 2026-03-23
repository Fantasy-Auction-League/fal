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
}

/* ─── Helpers ─── */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function seededRandom(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeGwTab, setActiveGwTab] = useState('GW7')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Open / close player detail sheet */
  const openPlayerSheet = (player: Player) => {
    setSelectedPlayer(player)
    setActiveGwTab('GW7')
    // Trigger open on next frame for animation
    requestAnimationFrame(() => setSheetOpen(true))
  }
  const closePlayerSheet = () => {
    setSheetOpen(false)
    setTimeout(() => setSelectedPlayer(null), 300) // wait for exit anim
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

  /* ─── Mock data for player detail sheet ─── */
  const roleIconGradients: Record<string, { bg: string; color: string; label: string }> = {
    BAT:  { bg: 'linear-gradient(135deg, #F9CD05, #e0b800)', color: '#1a1a1a', label: 'BA' },
    BOWL: { bg: 'linear-gradient(135deg, #004BA0, #0066cc)', color: '#fff', label: 'BO' },
    ALL:  { bg: 'linear-gradient(135deg, #0EB1A2, #089e90)', color: '#fff', label: 'AR' },
    WK:   { bg: 'linear-gradient(135deg, #EA1A85, #c4166e)', color: '#fff', label: 'WK' },
  }

  const roleFullName: Record<string, string> = {
    BAT: 'Batsman', BOWL: 'Bowler', ALL: 'All-Rounder', WK: 'Wicket-keeper',
  }

  function getMockStats(role: string, seed: number) {
    const r = (base: number, range: number) => base + (seed % range)
    if (role === 'BAT') return {
      section: 'Batting',
      stats: [
        { val: String(r(20, 80)), label: 'Runs' },
        { val: String(r(1, 7)), label: '4s' },
        { val: String(r(0, 4)), label: '6s' },
        { val: (r(100, 80)).toFixed(1), label: 'SR' },
        { val: String(r(12, 30)), label: 'Balls' },
      ],
      points: [
        { event: `Runs (${r(20, 80)})`, val: `+${r(20, 80)}` },
        { event: `Fours (${r(1, 7)} × 4)`, val: `+${r(1, 7) * 4}` },
        { event: `Sixes (${r(0, 4)} × 6)`, val: `+${r(0, 4) * 6}` },
        { event: '50 Bonus', val: '+8', accent: true },
        { event: 'SR Bonus', val: '+4', accent: true },
      ],
    }
    if (role === 'BOWL') return {
      section: 'Bowling',
      stats: [
        { val: String(r(1, 4)), label: 'Wkts' },
        { val: (r(2, 3)).toFixed(1), label: 'Overs' },
        { val: String(r(18, 20)), label: 'Runs' },
        { val: String(r(0, 2)), label: 'Maiden' },
        { val: (r(5, 4)).toFixed(1), label: 'Econ' },
      ],
      points: [
        { event: `Wickets (${r(1, 4)} × 25)`, val: `+${r(1, 4) * 25}` },
        { event: `Dot Balls (${r(8, 14)} × 1)`, val: `+${r(8, 14)}` },
        { event: 'Economy Rate', val: '+6', accent: true },
        { event: 'Maiden Over', val: r(0, 2) > 0 ? '+8' : '+0', accent: true },
      ],
    }
    if (role === 'WK') return {
      section: 'Wicket-keeping',
      stats: [
        { val: String(r(15, 50)), label: 'Runs' },
        { val: String(r(1, 5)), label: '4s' },
        { val: String(r(0, 3)), label: 'Catches' },
        { val: String(r(0, 2)), label: 'Stumpings' },
        { val: (r(100, 60)).toFixed(1), label: 'SR' },
      ],
      points: [
        { event: `Runs (${r(15, 50)})`, val: `+${r(15, 50)}` },
        { event: `Catches (${r(0, 3)} × 8)`, val: `+${r(0, 3) * 8}` },
        { event: `Stumpings (${r(0, 2)} × 12)`, val: `+${r(0, 2) * 12}` },
        { event: 'SR Bonus', val: '+4', accent: true },
      ],
    }
    // ALL
    return {
      section: 'All-Round',
      stats: [
        { val: String(r(15, 45)), label: 'Runs' },
        { val: String(r(0, 3)), label: 'Wkts' },
        { val: (r(100, 60)).toFixed(1), label: 'SR' },
        { val: (r(5, 5)).toFixed(1), label: 'Econ' },
        { val: String(r(0, 2)), label: 'Catches' },
      ],
      points: [
        { event: `Runs (${r(15, 45)})`, val: `+${r(15, 45)}` },
        { event: `Wickets (${r(0, 3)} × 25)`, val: `+${r(0, 3) * 25}` },
        { event: `Catches (${r(0, 2)} × 8)`, val: `+${r(0, 2) * 8}` },
        { event: 'SR Bonus', val: '+4', accent: true },
      ],
    }
  }

  function getMockForm(seed: number): number[] {
    return [
      30 + (seed % 50),
      40 + ((seed * 3) % 45),
      20 + ((seed * 7) % 55),
      35 + ((seed * 11) % 50),
      45 + ((seed * 13) % 60),
    ]
  }

  function getMockPrice(seed: number): string {
    return `$${(5 + (seed % 60) / 10).toFixed(1)}M`
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
          const pts = 100 + (seededRandom(player.id) % 400)

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
              </div>
            </div>
          )
        })}

        {/* Spacer for bottom nav */}
        <div style={{ height: 40 }} />
      </div>

      {/* ── Player Detail Bottom Sheet ── */}
      {selectedPlayer && (() => {
        const seed = seededRandom(selectedPlayer.id)
        const pts = 100 + (seed % 400)
        const mockStats = getMockStats(selectedPlayer.role, seed)
        const mockForm = getMockForm(seed)
        const maxForm = Math.max(...mockForm)
        const totalPts = mockStats.points.reduce((sum, p) => sum + parseInt(p.val.replace('+', '')), 0)
        const iconInfo = roleIconGradients[selectedPlayer.role] || roleIconGradients.BAT
        const gwTabs = ['GW7', 'GW6', 'GW5', 'Season']
        const trendUp = mockForm[4] > mockForm[3] && mockForm[3] > mockForm[2]

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
              maxHeight: '82vh',
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
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{selectedPlayer.fullname}</div>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>
                    {selectedPlayer.iplTeamCode || ''} · {roleFullName[selectedPlayer.role] || selectedPlayer.role} · {getMockPrice(seed)}
                  </div>
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 800, color: '#004BA0',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: -1,
                }}>
                  {pts}
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

              {/* GW Tabs */}
              <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #f0f0f4' }}>
                {gwTabs.map((tab) => (
                  <div
                    key={tab}
                    onClick={() => setActiveGwTab(tab)}
                    style={{
                      padding: '7px 12px', fontSize: 10, fontWeight: 600,
                      color: activeGwTab === tab ? '#004BA0' : '#aaa',
                      cursor: 'pointer',
                      borderBottom: `2px solid ${activeGwTab === tab ? '#004BA0' : 'transparent'}`,
                    }}
                  >
                    {tab}
                  </div>
                ))}
              </div>

              {/* Scrollable content */}
              <div style={{
                overflowY: 'auto', maxHeight: 'calc(82vh - 130px)', padding: '4px 0 24px',
                scrollbarWidth: 'none',
              } as React.CSSProperties}>

                {/* Stat section */}
                <div style={{ padding: '8px 16px' }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: '#aaa',
                    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
                  }}>
                    {mockStats.section}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {mockStats.stats.map((s, i) => (
                      <div key={i} style={{
                        flex: 1, textAlign: 'center', padding: '6px 3px',
                        background: '#f7f8fb', borderRadius: 8,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#222', fontVariantNumeric: 'tabular-nums' }}>
                          {s.val}
                        </div>
                        <div style={{ fontSize: 8, color: '#aaa', fontWeight: 500, marginTop: 1 }}>
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fielding section (always show) */}
                <div style={{ padding: '8px 16px', borderTop: '1px solid #f5f5f8' }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: '#aaa',
                    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
                  }}>
                    Fielding
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { val: String(seed % 3), label: 'Catches' },
                      { val: String(seed % 2), label: 'Runouts' },
                    ].map((s, i) => (
                      <div key={i} style={{
                        flex: 1, textAlign: 'center', padding: '6px 3px',
                        background: '#f7f8fb', borderRadius: 8, maxWidth: 80,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#222', fontVariantNumeric: 'tabular-nums' }}>
                          {s.val}
                        </div>
                        <div style={{ fontSize: 8, color: '#aaa', fontWeight: 500, marginTop: 1 }}>
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fantasy Points Breakdown */}
                <div style={{ padding: '8px 16px', borderTop: '1px solid #f5f5f8' }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: '#aaa',
                    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
                  }}>
                    Fantasy Points
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {mockStats.points.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                        <span style={{ color: '#666', fontWeight: 500 }}>{p.event}</span>
                        <span style={{ color: p.accent ? '#0d9e5f' : '#333', fontWeight: 700 }}>{p.val}</span>
                      </div>
                    ))}
                    {/* Total row */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', padding: '6px 0 4px',
                      borderTop: '2px solid #1a1a2e', marginTop: 4,
                    }}>
                      <span style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 11 }}>Total</span>
                      <span style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14 }}>{totalPts}</span>
                    </div>
                  </div>
                </div>

                {/* Recent Form */}
                <div style={{ padding: '8px 16px', borderTop: '1px solid #f5f5f8', textAlign: 'center' }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: '#aaa',
                    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
                    textAlign: 'left',
                  }}>
                    Recent Form
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60, padding: '0 8px' }}>
                    {mockForm.map((val, i) => {
                      const isLast = i === mockForm.length - 1
                      const isHot = i === mockForm.length - 2
                      const pct = maxForm > 0 ? (val / maxForm) * 100 : 10
                      return (
                        <div key={i} style={{
                          flex: 1,
                          background: isLast ? '#004BA0' : isHot ? 'rgba(0,75,160,0.2)' : '#e8eaf0',
                          borderRadius: '5px 5px 0 0',
                          height: `${pct}%`,
                          minHeight: 6,
                          position: 'relative',
                        }}>
                          <span style={{
                            position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                            fontSize: isLast ? 9 : 8, fontWeight: 700,
                            color: isLast ? '#004BA0' : '#999',
                          }}>
                            {val}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-around', padding: '3px 8px 0',
                    fontSize: 8, color: '#bbb', fontWeight: 500,
                  }}>
                    {['GW3', 'GW4', 'GW5', 'GW6', 'GW7'].map((gw) => (
                      <span key={gw}>{gw}</span>
                    ))}
                  </div>
                  <div style={{
                    display: 'inline-block', marginTop: 6,
                    fontSize: 10, fontWeight: 700,
                    color: trendUp ? '#0d9e5f' : '#004BA0',
                    background: trendUp ? 'rgba(13,158,95,0.08)' : 'rgba(0,75,160,0.08)',
                    padding: '3px 10px', borderRadius: 6,
                  }}>
                    {trendUp ? '▲ Trending Up' : '● Consistent'}
                  </div>
                </div>
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
          { href: '#', label: 'Board', icon: <IconBoard />, active: false },
          { href: '/players', label: 'Players', icon: <IconPlayers />, active: true },
          { href: '/admin', label: 'League', icon: <IconLeague />, active: false },
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
