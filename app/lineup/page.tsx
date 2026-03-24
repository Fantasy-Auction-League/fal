'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import { AppFrame } from '@/app/components/AppFrame'

interface CurrentGameweek {
  id: string
  number: number
  lockTime: string | null
  status: string
}

/* ─── Types ─── */
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

interface League {
  id: string
  name: string
  teams: { id: string; name: string; userId: string }[]
}

/* ─── Helpers ─── */
function getShortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return parts[0][0] + ' ' + parts[parts.length - 1]
  return name
}

function normalizeRole(role: string): string {
  const r = role?.toUpperCase() || 'BAT'
  if (r.includes('WK')) return 'WK'
  if (r.includes('ALL')) return 'ALL'
  if (r.includes('BOWL')) return 'BOWL'
  return 'BAT'
}

function roleLabel(role: string): string {
  switch (role) {
    case 'BAT': return 'B'
    case 'BOWL': return 'B'
    case 'ALL': return 'A'
    case 'WK': return 'W'
    default: return 'B'
  }
}

function roleClass(role: string): { bg: string; color: string } {
  switch (role) {
    case 'BAT': return { bg: 'linear-gradient(135deg, #F9CD05, #e0b800)', color: '#1a1a1a' }
    case 'BOWL': return { bg: 'linear-gradient(135deg, #004BA0, #0060cc)', color: '#fff' }
    case 'ALL': return { bg: 'linear-gradient(135deg, #0EB1A2, #089e90)', color: '#fff' }
    case 'WK': return { bg: 'linear-gradient(135deg, #EA1A85, #c4166e)', color: '#fff' }
    default: return { bg: 'linear-gradient(135deg, #666, #444)', color: '#fff' }
  }
}

/* ─── Icons ─── */
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

/* ─── Bowling Boost SVG ─── */
const BowlingBoostIcon = ({ color }: { color: string }) => (
  <svg viewBox="0 0 36 36" width="26" height="26" fill="none">
    <circle cx="9" cy="9" r="6" fill={color === 'grey' ? '#bbb' : '#DC2020'} />
    <path d="M6 7.5 Q9 9.5 12 7.5" stroke="white" strokeWidth="0.9" fill="none" strokeLinecap="round" />
    <path d="M6 10.5 Q9 8.5 12 10.5" stroke="white" strokeWidth="0.9" fill="none" strokeLinecap="round" />
    <rect x="17" y="16" width="3" height="16" rx="1.5" fill={color === 'grey' ? '#bbb' : 'white'} />
    <rect x="23" y="16" width="3" height="16" rx="1.5" fill={color === 'grey' ? '#bbb' : 'white'} />
    <rect x="29" y="16" width="3" height="16" rx="1.5" fill={color === 'grey' ? '#bbb' : 'white'} />
    <rect x="17" y="13.5" width="9" height="2.2" rx="1.1" fill={color === 'grey' ? '#bbb' : 'rgba(255,255,255,0.9)'} />
    <rect x="25" y="11" width="8" height="2" rx="1" fill={color === 'grey' ? '#bbb' : 'rgba(255,255,255,0.55)'} transform="rotate(-22 25 11)" />
  </svg>
)

/* ─── Power Play Bat SVG ─── */
const PowerPlayBatIcon = ({ color }: { color: string }) => (
  <svg viewBox="0 0 36 36" width="26" height="26" fill="none">
    <rect x="16" y="4" width="5" height="22" rx="2.5" fill={color === 'grey' ? '#bbb' : '#fff'} transform="rotate(20 16 4)" />
    <ellipse cx="10" cy="28" rx="5" ry="3.5" fill={color === 'grey' ? '#bbb' : '#fff'} transform="rotate(20 10 28)" />
  </svg>
)

export default function LineupPage() {
  const { data: session, status: sessionStatus } = useSession()

  const [squad, setSquad] = useState<SquadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [xi, setXi] = useState<SquadPlayer[]>([])
  const [bench, setBench] = useState<SquadPlayer[]>([])
  const [captainId, setCaptainId] = useState<string | null>(null)
  const [vcId, setVcId] = useState<string | null>(null)
  const [activeChip, setActiveChip] = useState<'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null>(null)
  const [usedChips, setUsedChips] = useState<Record<string, number>>({}) // chipType -> GW number
  const [chipModalType, setChipModalType] = useState<'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null>(null)
  const [swapMode, setSwapMode] = useState<string | null>(null) // benchPlayerId being swapped
  const [dirty, setDirty] = useState(false)
  const [currentGW, setCurrentGW] = useState<CurrentGameweek | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const isLocked = currentGW?.lockTime ? new Date() >= new Date(currentGW.lockTime) : false

  /* ─── Fetch current gameweek ─── */
  useEffect(() => {
    fetch('/api/gameweeks/current')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.error) setCurrentGW(data) })
      .catch(() => {})
  }, [])

  const activeLeagueId = session?.user?.activeLeagueId

  /* ─── Fetch squad ─── */
  const fetchSquad = useCallback(async () => {
    try {
      // First get user's leagues
      const leaguesRes = await fetch('/api/leagues')
      if (!leaguesRes.ok) return
      const leagues: League[] = await leaguesRes.json()
      if (leagues.length === 0) return

      const targetLeague = leagues.find(l => l.id === activeLeagueId) || leagues[0]

      // Fetch full league detail to get teams with userId
      const detailRes = await fetch(`/api/leagues/${targetLeague.id}`)
      if (!detailRes.ok) return
      const leagueDetail = await detailRes.json()

      // Find user's team
      const userId = session?.user?.id
      let teamId: string | null = null
      const teams = leagueDetail.teams || []
      for (const team of teams) {
        if (team.userId === userId) { teamId = team.id; break }
      }
      if (!teamId) return

      const res = await fetch(`/api/teams/${teamId}/squad`)
      if (!res.ok) return
      const data: SquadData = await res.json()
      setSquad(data)

      // Fetch chip usage for this team (use any gameweekId — GET returns all usages)
      if (currentGW) {
        try {
          const chipRes = await fetch(`/api/teams/${teamId}/lineups/${currentGW.id}/chip`)
          if (chipRes.ok) {
            const chipData = await chipRes.json()
            const chips: Record<string, number> = {}
            let pendingChip: 'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null = null
            for (const cu of chipData.chipUsages || []) {
              if (cu.status === 'PENDING' && cu.gameweekId === currentGW.id) {
                pendingChip = cu.chipType
              }
              if (cu.status === 'USED' && cu.gameweekNumber) {
                chips[cu.chipType] = cu.gameweekNumber
              }
            }
            setUsedChips(chips)
            setActiveChip(pendingChip)
          }
        } catch { /* silent */ }
      }

      // Build initial lineup: first 11 = XI, rest = bench
      const players = data.players || []
      // Sort by role priority: WK first, then BAT, ALL, BOWL
      const rolePriority: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 }
      const sorted = [...players].sort((a, b) => {
        const ra = rolePriority[normalizeRole(a.role)] ?? 1
        const rb = rolePriority[normalizeRole(b.role)] ?? 1
        return ra - rb
      })
      const starting = sorted.slice(0, 11)
      const benchPlayers = sorted.slice(11)
      setXi(starting)
      setBench(benchPlayers)
      if (starting.length > 0) setCaptainId(starting[0].id)
      if (starting.length > 1) setVcId(starting[1].id)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [activeLeagueId, session?.user?.id, currentGW])

  useEffect(() => {
    if (sessionStatus === 'authenticated') fetchSquad()
    else if (sessionStatus === 'unauthenticated') setLoading(false)
  }, [sessionStatus, fetchSquad])

  /* ─── Save lineup ─── */
  const saveLineup = async () => {
    if (!squad || !currentGW || saving || isLocked) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const slots = [
        ...xi.map(p => ({
          playerId: p.id,
          slotType: 'XI' as const,
          benchPriority: null,
          role: captainId === p.id ? 'CAPTAIN' as const : vcId === p.id ? 'VC' as const : null,
        })),
        ...bench.map((p, i) => ({
          playerId: p.id,
          slotType: 'BENCH' as const,
          benchPriority: i + 1,
          role: captainId === p.id ? 'CAPTAIN' as const : vcId === p.id ? 'VC' as const : null,
        })),
      ]
      const res = await fetch(`/api/teams/${squad.teamId}/lineups/${currentGW.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save lineup' }))
        throw new Error(data.error || 'Failed to save lineup')
      }
      setDirty(false)
      setSaveMessage({ type: 'success', text: 'Lineup saved!' })
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save lineup' })
    } finally {
      setSaving(false)
    }
  }

  /* ─── Handlers ─── */
  const handlePlayerTap = (playerId: string) => {
    if (isLocked) return // lineup locked after deadline
    // If in swap mode, do the swap
    if (swapMode) {
      const benchPlayer = bench.find(p => p.id === swapMode)
      const xiPlayer = xi.find(p => p.id === playerId)
      if (benchPlayer && xiPlayer) {
        setXi(prev => prev.map(p => p.id === playerId ? benchPlayer : p))
        setBench(prev => prev.map(p => p.id === swapMode ? xiPlayer : p))
        // If swapped player was captain/vc, transfer to new player
        if (captainId === playerId) setCaptainId(benchPlayer.id)
        if (vcId === playerId) setVcId(benchPlayer.id)
        setDirty(true)
      }
      setSwapMode(null)
      return
    }

    // Toggle captain/vc
    if (captainId === playerId) {
      // Already captain, make VC (swap with current VC)
      setCaptainId(vcId)
      setVcId(playerId)
      setDirty(true)
    } else if (vcId === playerId) {
      // Already VC, make captain (swap with current captain)
      setVcId(captainId)
      setCaptainId(playerId)
      setDirty(true)
    } else {
      // Make this player VC, current VC becomes normal
      setVcId(playerId)
      setDirty(true)
    }
  }

  const handleBenchTap = (playerId: string) => {
    if (isLocked) return // lineup locked after deadline
    if (swapMode === playerId) {
      setSwapMode(null)
    } else {
      setSwapMode(playerId)
    }
  }

  const handleChipToggle = async (chipType: 'POWER_PLAY_BAT' | 'BOWLING_BOOST') => {
    if (isLocked || !squad || !currentGW) return
    // If this chip was already used in a previous GW, do nothing
    if (usedChips[chipType]) return
    // If the OTHER chip is active this GW, do nothing
    if (activeChip && activeChip !== chipType) return

    if (activeChip === chipType) {
      // Deactivate
      try {
        const res = await fetch(`/api/teams/${squad.teamId}/lineups/${currentGW.id}/chip`, { method: 'DELETE' })
        if (res.ok) {
          setActiveChip(null)
          setDirty(true)
        }
      } catch { /* silent */ }
    } else {
      // Show confirmation modal
      setChipModalType(chipType)
    }
  }

  const confirmChip = async () => {
    if (!chipModalType || !squad || !currentGW) return
    try {
      const res = await fetch(`/api/teams/${squad.teamId}/lineups/${currentGW.id}/chip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipType: chipModalType }),
      })
      if (res.ok) {
        setActiveChip(chipModalType)
        setChipModalType(null)
        setDirty(true)
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to activate chip' }))
        setSaveMessage({ type: 'error', text: data.error || 'Failed to activate chip' })
        setChipModalType(null)
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to activate chip' })
      setChipModalType(null)
    }
  }

  /* ─── Arrange XI into 2-3-5 formation matching view-lineup ─── */
  const wk = xi.filter(p => normalizeRole(p.role) === 'WK')
  const bat = xi.filter(p => normalizeRole(p.role) === 'BAT')
  const all = xi.filter(p => normalizeRole(p.role) === 'ALL')
  const bowl = xi.filter(p => normalizeRole(p.role) === 'BOWL')

  // Openers: first 2 batsmen (or WK + BAT)
  const openers = [...bat.slice(0, 2)]
  if (openers.length < 2 && wk.length > 0) openers.unshift(wk[0])

  // Middle order: remaining bat + WK + all-rounders
  const usedIds = new Set(openers.map(p => p.id))
  const middleOrder = [
    ...bat.filter(p => !usedIds.has(p.id)),
    ...wk.filter(p => !usedIds.has(p.id)),
    ...all,
  ]

  // Lower order: bowlers
  const lowerOrder = [...bowl]

  // Fallback: if grouping doesn't cover all 11, use simple 2-4-5 split
  const allGrouped = [...openers, ...middleOrder, ...lowerOrder]
  const hasAllPlayers = allGrouped.length === xi.length
  const row1 = hasAllPlayers ? openers : xi.slice(0, 2)
  const row2 = hasAllPlayers ? middleOrder : xi.slice(2, 6)
  const row3 = hasAllPlayers ? lowerOrder : xi.slice(6, 11)

  /* ─── Auth guard ─── */
  if (sessionStatus === 'loading' || loading) {
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
          <p style={{ color: '#888', fontSize: 14 }}>Please log in to view your lineup.</p>
          <a href="/login" style={{
            background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
            color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none'
          }}>Go to Login</a>
        </div>
      </AppFrame>
    )
  }

  /* ─── Pitch Player (matches view-lineup design) ─── */
  const PitchPlayer = ({ player, isCaptain, isVC }: {
    player: SquadPlayer; isCaptain: boolean; isVC: boolean
  }) => {
    const role = normalizeRole(player.role)
    const rc = roleClass(role)
    const code = player.iplTeamCode || ''

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: 66, textAlign: 'center',
      }}>
        {/* Role icon circle */}
        <div style={{
          position: 'relative',
          width: 36, height: 36, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: rc.color,
          marginBottom: 3,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          border: '2px solid rgba(255,255,255,0.2)',
          background: rc.bg,
        }}>
          {roleLabel(role)}
          {/* C / VC badge */}
          {isCaptain && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              width: 16, height: 16, borderRadius: '50%',
              fontSize: 7.5, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2, border: '2px solid rgba(255,255,255,0.9)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              background: '#F9CD05', color: '#1a1a1a',
            }}>C</div>
          )}
          {isVC && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              width: 16, height: 16, borderRadius: '50%',
              fontSize: 7.5, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2, border: '2px solid rgba(255,255,255,0.9)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              background: '#C0C7D0', color: '#1a1a1a',
            }}>V</div>
          )}
        </div>
        {/* Name pill */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          borderRadius: 6, padding: '2px 6px 1.5px',
          minWidth: 44,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 64, display: 'block', textAlign: 'center',
            letterSpacing: -0.1, lineHeight: '1.35',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}>
            {getShortName(player.fullname)}
            {isCaptain && (
              <span style={{
                display: 'inline-block', fontSize: 6.5, fontWeight: 800,
                padding: '0.5px 3px', borderRadius: 2.5,
                verticalAlign: 'middle', marginLeft: 2, letterSpacing: 0.2,
                background: '#F9CD05', color: '#1a1a1a',
              }}>C</span>
            )}
            {isVC && (
              <span style={{
                display: 'inline-block', fontSize: 6.5, fontWeight: 800,
                padding: '0.5px 3px', borderRadius: 2.5,
                verticalAlign: 'middle', marginLeft: 2, letterSpacing: 0.2,
                background: '#C0C7D0', color: '#1a1a1a',
              }}>VC</span>
            )}
            {role === 'WK' && (
              <span style={{
                display: 'inline-block', fontSize: 6.5, fontWeight: 800,
                padding: '0.5px 3px', borderRadius: 2.5,
                verticalAlign: 'middle', marginLeft: 2, letterSpacing: 0.2,
                background: '#00ff87', color: '#1a1a1a',
              }}>WK</span>
            )}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.5)',
            textAlign: 'center', display: 'block', letterSpacing: 0.3, lineHeight: '1.2',
          }}>{code || 'IPL'}</span>
        </div>
      </div>
    )
  }

  /* ─── Bench Player (matches view-lineup design) ─── */
  const BenchPlayer = ({ player }: { player: SquadPlayer }) => {
    const role = normalizeRole(player.role)
    const rc = roleClass(role)
    const code = player.iplTeamCode || ''

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: 80, textAlign: 'center',
        padding: '6px 4px', borderRadius: 10,
        background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 800, color: rc.color,
          marginBottom: 3,
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          background: rc.bg,
        }}>
          {roleLabel(role)}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#333',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 72, lineHeight: '1.3', letterSpacing: -0.1,
        }}>
          {getShortName(player.fullname)}
        </div>
        <div style={{ fontSize: 8, fontWeight: 500, color: '#aaa', letterSpacing: 0.3 }}>
          {code || 'IPL'}
        </div>
      </div>
    )
  }

  return (
    <AppFrame>
    <div style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh',
      paddingBottom: 60,
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* ── Top Bar ── */}
      <div style={{
        background: '#fff', padding: '16px 20px 8px',
        flexShrink: 0, textAlign: 'center',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', marginBottom: 4,
        }}>
          <a href="/" style={{
            position: 'absolute', left: 0,
            width: 30, height: 30, borderRadius: 8,
            background: '#f2f3f8', border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: '#333', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            &#8592;
          </a>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.3 }}>
            Pick Team
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#555', marginBottom: 10 }}>
          {currentGW ? (
            <>
              Gameweek {currentGW.number} &middot;{' '}
              {isLocked ? (
                <span style={{
                  fontWeight: 800, fontSize: 13, color: '#fff',
                  background: '#d63060', padding: '3px 10px', borderRadius: 8,
                  letterSpacing: 0.3,
                }}>
                  Lineup Locked
                </span>
              ) : (
                <strong style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 15 }}>
                  {currentGW.lockTime
                    ? `Deadline: ${new Date(currentGW.lockTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(currentGW.lockTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                    : 'Deadline TBD'}
                </strong>
              )}
            </>
          ) : (
            'Set your lineup for the season'
          )}
        </div>

        {/* ── Chips Bar ── */}
        <div style={{
          display: 'flex', flexDirection: 'row',
          borderBottom: '1px solid #efeff3',
          borderTop: '1px solid #efeff3',
          margin: '0 -20px',
        }}>
          {/* Bowling Boost */}
          {(() => {
            const bbUsedGW = usedChips['BOWLING_BOOST']
            const bbActive = activeChip === 'BOWLING_BOOST'
            const bbUnavailable = !!bbUsedGW || (!!activeChip && activeChip !== 'BOWLING_BOOST')
            const bbDisabled = bbUnavailable || isLocked
            return (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', textAlign: 'center',
                padding: '7px 10px 6px', gap: 4,
                borderRight: '1px solid #efeff3',
                opacity: bbUnavailable && !bbActive ? 0.45 : 1,
                transition: 'opacity 0.25s ease',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: bbUnavailable && !bbActive ? '#e8e8ee' : 'linear-gradient(135deg, #0d9e5f, #07c472)',
                }}>
                  <BowlingBoostIcon color={bbUnavailable && !bbActive ? 'grey' : 'white'} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: bbUnavailable && !bbActive ? '#bbb' : '#1a1a2e', lineHeight: 1.2 }}>Bowling Boost</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: bbUnavailable && !bbActive ? '#ccc' : '#888', lineHeight: 1.35 }}>Doubles all bowling points this GW</div>
                {bbUsedGW ? (
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    background: '#f0f0f5', color: '#999', padding: '4px 10px',
                    borderRadius: 8, whiteSpace: 'nowrap',
                  }}>
                    Used GW {bbUsedGW}
                  </div>
                ) : (
                  <div
                    onClick={() => { if (!bbDisabled) handleChipToggle('BOWLING_BOOST') }}
                    style={{
                      width: 48, height: 28, borderRadius: 14,
                      position: 'relative', cursor: bbDisabled ? 'not-allowed' : 'pointer',
                      transition: 'background 0.25s ease',
                      background: bbActive ? '#0d9e5f' : '#dde0e8',
                      flexShrink: 0,
                      opacity: bbDisabled && !bbActive ? 0.5 : 1,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 3,
                      left: bbActive ? 23 : 3,
                      width: 22, height: 22, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
                      transition: 'left 0.22s ease',
                    }} />
                  </div>
                )}
              </div>
            )
          })()}
          {/* Power Play Bat */}
          {(() => {
            const ppUsedGW = usedChips['POWER_PLAY_BAT']
            const ppActive = activeChip === 'POWER_PLAY_BAT'
            const ppUnavailable = !!ppUsedGW || (!!activeChip && activeChip !== 'POWER_PLAY_BAT')
            const ppDisabled = ppUnavailable || isLocked
            return (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', textAlign: 'center',
                padding: '7px 10px 6px', gap: 4,
                opacity: ppUnavailable && !ppActive ? 0.45 : 1,
                transition: 'opacity 0.25s ease',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: ppUnavailable && !ppActive ? '#e8e8ee' : 'linear-gradient(135deg, #d4340f, #f05a28)',
                }}>
                  <PowerPlayBatIcon color={ppUnavailable && !ppActive ? 'grey' : 'white'} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: ppUnavailable && !ppActive ? '#bbb' : '#1a1a2e', lineHeight: 1.2 }}>Power Play Bat</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: ppUnavailable && !ppActive ? '#ccc' : '#888', lineHeight: 1.35 }}>Doubles all batting points this GW</div>
                {ppUsedGW ? (
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    background: '#f0f0f5', color: '#999', padding: '4px 10px',
                    borderRadius: 8, whiteSpace: 'nowrap',
                  }}>
                    Used GW {ppUsedGW}
                  </div>
                ) : (
                  <div
                    onClick={() => { if (!ppDisabled) handleChipToggle('POWER_PLAY_BAT') }}
                    style={{
                      width: 48, height: 28, borderRadius: 14,
                      position: 'relative', cursor: ppDisabled ? 'not-allowed' : 'pointer',
                      transition: 'background 0.25s ease',
                      background: ppActive ? '#d4340f' : '#dde0e8',
                      flexShrink: 0,
                      opacity: ppDisabled && !ppActive ? 0.5 : 1,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 3,
                      left: ppActive ? 23 : 3,
                      width: 22, height: 22, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
                      transition: 'left 0.22s ease',
                    }} />
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Cricket Pitch (matches view-lineup) ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        background: `repeating-linear-gradient(180deg,
          rgba(255,255,255,0) 0px, rgba(255,255,255,0) 36px,
          rgba(255,255,255,0.04) 36px, rgba(255,255,255,0.04) 72px
        ), linear-gradient(180deg,
          #3aad5c 0%, #35a254 20%, #30964c 40%,
          #2b8a45 60%, #267f3e 80%, #217438 100%
        )`,
      }}>
        {/* Pitch markings */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* Center circle */}
          <div style={{
            position: 'absolute', top: '38%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 60, height: 60, border: '1.5px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
          }} />
          {/* Pitch strip */}
          <div style={{
            position: 'absolute', top: '38%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8, height: 44, background: '#c4a265', borderRadius: 2,
            boxShadow: '0 0 8px rgba(180,150,80,0.25)',
          }} />
          {/* Crease lines */}
          <div style={{
            position: 'absolute', top: '16%', left: '50%',
            transform: 'translateX(-50%)',
            width: 24, borderTop: '1px solid rgba(255,255,255,0.1)',
          }} />
          <div style={{
            position: 'absolute', top: '60%', left: '50%',
            transform: 'translateX(-50%)',
            width: 24, borderTop: '1px solid rgba(255,255,255,0.1)',
          }} />
          {/* Boundary arcs */}
          <div style={{
            position: 'absolute', top: 6, left: 20, right: 20, height: 24,
            borderTop: '1.5px solid rgba(255,255,255,0.06)',
            borderRadius: '50% 50% 0 0',
          }} />
          <div style={{
            position: 'absolute', bottom: 6, left: 20, right: 20, height: 24,
            borderBottom: '1.5px solid rgba(255,255,255,0.06)',
            borderRadius: '0 0 50% 50%',
          }} />
        </div>

        {/* XI container */}
        {xi.length > 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            position: 'relative', zIndex: 1,
            padding: '6px 0 4px',
            gap: 6,
          }}>
            {/* Row 1: Openers */}
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
              textAlign: 'center', marginBottom: -2,
            }}>Openers</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, width: '100%' }}>
              {row1.map(p => (
                <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                  style={{
                    cursor: 'pointer',
                    opacity: swapMode ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  <PitchPlayer player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>

            {/* Row 2: Middle Order */}
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
              textAlign: 'center', marginBottom: -2,
            }}>Middle Order</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, width: '100%' }}>
              {row2.map(p => (
                <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                  style={{
                    cursor: 'pointer',
                    opacity: swapMode ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  <PitchPlayer player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>

            {/* Row 3: Lower Order */}
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
              textAlign: 'center', marginBottom: -2,
            }}>Lower Order</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, width: '100%' }}>
              {row3.map(p => (
                <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                  style={{
                    cursor: 'pointer',
                    opacity: swapMode ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  <PitchPlayer player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1,
          }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600 }}>
              {squad ? 'No players in squad' : 'No team found'}
            </p>
          </div>
        )}
      </div>

      {/* ── Bench (matches view-lineup) ── */}
      {bench.length > 0 && (
        <div style={{
          background: '#f2f3f8',
          padding: '8px 12px 6px',
          flexShrink: 0,
          borderTop: '2px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
              textTransform: 'uppercase' as const, color: '#999',
            }}>Bench</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            {bench.map(p => {
              const isSwapping = swapMode === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => handleBenchTap(p.id)}
                  style={{
                    cursor: 'pointer',
                    opacity: isSwapping ? 1 : (swapMode ? 0.5 : 1),
                    transform: isSwapping ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.2s',
                  }}
                >
                  <BenchPlayer player={p} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Save Area ── */}
      {(dirty || saveMessage) && !isLocked && (
        <div style={{
          flexShrink: 0, padding: '6px 16px 34px', background: '#f2f3f8',
          animation: 'slideUp 0.3s ease',
        }}>
          {dirty && (
            <button
              onClick={saveLineup}
              disabled={saving}
              style={{
                display: 'block', width: '100%', padding: 13, border: 'none', borderRadius: 14,
                background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
                color: '#fff', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', letterSpacing: -0.3,
                opacity: saving ? 0.6 : 1,
              }}>
              {saving ? 'Saving...' : 'Save Lineup'}
            </button>
          )}
          {saveMessage && (
            <div style={{
              textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit',
              color: saveMessage.type === 'success' ? '#0a8754' : '#d32f2f',
            }}>
              {saveMessage.text}
            </div>
          )}
        </div>
      )}

      {/* ── Swap hint ── */}
      {swapMode && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)', color: '#fff',
          padding: '8px 16px', borderRadius: 20,
          fontSize: 12, fontWeight: 600, zIndex: 150,
          backdropFilter: 'blur(8px)',
          maxWidth: 300, textAlign: 'center',
        }}>
          Tap a player on the pitch to swap
        </div>
      )}

      {/* ── Chip Confirmation Modal ── */}
      {chipModalType && (() => {
        const isBB = chipModalType === 'BOWLING_BOOST'
        const chipLabel = isBB ? 'Bowling Boost' : 'Power Play Bat'
        const chipDesc = isBB ? 'bowling' : 'batting'
        const chipGrad = isBB ? 'linear-gradient(135deg, #0d9e5f, #07c472)' : 'linear-gradient(135deg, #d4340f, #f05a28)'
        const ChipIcon = isBB ? BowlingBoostIcon : PowerPlayBatIcon
        return (
          <>
            <div
              onClick={() => setChipModalType(null)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                zIndex: 200,
              }}
            />
            <div style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)',
              bottom: 0, width: '100%', maxWidth: 480,
              background: '#fff', borderRadius: '24px 24px 0 0',
              padding: '0 0 40px', zIndex: 210,
            }}>
              <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '12px auto 20px' }} />
              <div style={{
                width: 64, height: 64, borderRadius: 18, margin: '0 auto 14px',
                background: chipGrad,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ChipIcon color="white" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', textAlign: 'center', padding: '0 24px' }}>
                Play {chipLabel}?
              </div>
              <div style={{ fontSize: 14, color: '#666', textAlign: 'center', marginTop: 6, padding: '0 28px', lineHeight: 1.5 }}>
                All {chipDesc} points for your squad will be doubled for {currentGW ? `Gameweek ${currentGW.number}` : 'this Gameweek'}.
              </div>
              <div style={{
                margin: '16px 20px 0', padding: '12px 14px', borderRadius: 12,
                background: '#fff8ec', border: '1px solid rgba(255,160,0,0.3)',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>&#9888;&#65039;</div>
                <div style={{ fontSize: 13, color: '#7a5500', fontWeight: 500, lineHeight: 1.45 }}>
                  This chip <strong>cannot be changed</strong> once {currentGW ? `Gameweek ${currentGW.number}` : 'the Gameweek'} has started. You only get one {chipLabel} per season — use it wisely.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 20px 0' }}>
                <button
                  onClick={confirmChip}
                  style={{
                    display: 'block', width: '100%', padding: 15, border: 'none', borderRadius: 14,
                    background: chipGrad,
                    color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Yes, Play {chipLabel}
                </button>
                <button
                  onClick={() => setChipModalType(null)}
                  style={{
                    display: 'block', width: '100%', padding: 14, border: 'none', borderRadius: 14,
                    background: '#f2f3f8', color: '#555', fontSize: 15, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Bottom Navigation ── */}
      <nav className="bottom-nav-fixed" style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, background: '#fff',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '8px 0 env(safe-area-inset-bottom, 8px)',
        zIndex: 100,
      }}>
        {[
          { href: '/', label: 'Home', Icon: IconHome, active: false },
          { href: '/lineup', label: 'Lineup', Icon: IconLineup, active: true },
          { href: '/players', label: 'Players', Icon: IconPlayers, active: false },
          { href: '/admin', label: 'League', Icon: IconLeague, active: false },
        ].map(({ href, label, Icon, active }) => (
          <a key={label} href={href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            color: active ? '#004BA0' : '#aaa',
            fontSize: 10, fontWeight: active ? 700 : 500,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 12px', textDecoration: 'none',
          }}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
    </AppFrame>
  )
}
