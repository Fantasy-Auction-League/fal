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

/* ─── IPL team colors & gradients ─── */
const teamGradients: Record<string, { head: string; body: string; plate: string }> = {
  MI:   { head: 'linear-gradient(180deg, #0066CC, #004BA0)', body: 'linear-gradient(180deg, #0066CC, #004BA0)', plate: 'linear-gradient(90deg, #004BA0, #0066CC)' },
  CSK:  { head: 'linear-gradient(180deg, #FFDA2B, #E8B800)', body: 'linear-gradient(180deg, #FFDA2B, #E8B800)', plate: 'linear-gradient(90deg, #D4A800, #F9CD05)' },
  RCB:  { head: 'linear-gradient(180deg, #E8222B, #B81820)', body: 'linear-gradient(180deg, #E8222B, #B81820)', plate: 'linear-gradient(90deg, #B81820, #EC1C24)' },
  KKR:  { head: 'linear-gradient(180deg, #6B4F9E, #3A225D)', body: 'linear-gradient(180deg, #6B4F9E, #3A225D)', plate: 'linear-gradient(90deg, #3A225D, #5A3A8A)' },
  DC:   { head: 'linear-gradient(180deg, #1A7FE0, #004C93)', body: 'linear-gradient(180deg, #1A7FE0, #004C93)', plate: 'linear-gradient(90deg, #004C93, #1A7FE0)' },
  RR:   { head: 'linear-gradient(180deg, #F03C96, #C4166E)', body: 'linear-gradient(180deg, #F03C96, #C4166E)', plate: 'linear-gradient(90deg, #C4166E, #EA1A85)' },
  SRH:  { head: 'linear-gradient(180deg, #FF9A44, #E06A18)', body: 'linear-gradient(180deg, #FF9A44, #E06A18)', plate: 'linear-gradient(90deg, #D96A1E, #FF822A)' },
  GT:   { head: 'linear-gradient(180deg, #1AD4BF, #0EB1A2)', body: 'linear-gradient(180deg, #1AD4BF, #0EB1A2)', plate: 'linear-gradient(90deg, #0A9688, #0EB1A2)' },
  LSG:  { head: 'linear-gradient(180deg, #00C4FF, #00AEEF)', body: 'linear-gradient(180deg, #00C4FF, #00AEEF)', plate: 'linear-gradient(90deg, #0098D4, #00AEEF)' },
  PBKS: { head: 'linear-gradient(180deg, #F44040, #CC2020)', body: 'linear-gradient(180deg, #F44040, #CC2020)', plate: 'linear-gradient(90deg, #CC2020, #ED1B24)' },
}

const defaultGrad = { head: 'linear-gradient(180deg, #666, #444)', body: 'linear-gradient(180deg, #666, #444)', plate: 'linear-gradient(90deg, #555, #777)' }

const teamLogos: Record<string, string> = {
  MI:   'https://documents.iplt20.com/ipl/MI/Logos/Logooutline/MIoutline.png',
  CSK:  'https://documents.iplt20.com/ipl/CSK/logos/Logooutline/CSKoutline.png',
  RCB:  'https://documents.iplt20.com/ipl/RCB/Logos/Logooutline/RCBoutline.png',
  KKR:  'https://documents.iplt20.com/ipl/KKR/Logos/Logooutline/KKRoutline.png',
  DC:   'https://documents.iplt20.com/ipl/DC/Logos/LogoOutline/DCoutline.png',
  RR:   'https://documents.iplt20.com/ipl/RR/Logos/Logooutline/RRoutline.png',
  SRH:  'https://documents.iplt20.com/ipl/SRH/Logos/Logooutline/SRHoutline.png',
  GT:   'https://documents.iplt20.com/ipl/GT/Logos/Logooutline/GToutline.png',
  LSG:  'https://documents.iplt20.com/ipl/LSG/Logos/Logooutline/LSGoutline.png',
  PBKS: 'https://documents.iplt20.com/ipl/PBKS/Logos/Logooutline/PBKSoutline.png',
}

const benchRoleColors: Record<string, string> = {
  BAT: 'rgba(249,205,5,0.4)',
  BOWL: 'rgba(160,196,255,0.4)',
  WK: 'rgba(0,255,135,0.3)',
  ALL: 'rgba(14,177,162,0.3)',
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
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

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

function isLightTeam(code: string | null): boolean {
  return code === 'CSK'
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
  const [bowlingBoostOn, setBowlingBoostOn] = useState(false)
  const [chipModalOpen, setChipModalOpen] = useState(false)
  const [swapMode, setSwapMode] = useState<string | null>(null) // benchPlayerId being swapped
  const [dirty, setDirty] = useState(false)
  const [currentGW, setCurrentGW] = useState<CurrentGameweek | null>(null)

  /* ─── Fetch current gameweek ─── */
  useEffect(() => {
    fetch('/api/gameweeks/current')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.error) setCurrentGW(data) })
      .catch(() => {})
  }, [])

  /* ─── Fetch squad ─── */
  const fetchSquad = useCallback(async () => {
    try {
      // First get user's leagues
      const leaguesRes = await fetch('/api/leagues')
      if (!leaguesRes.ok) return
      const leagues: League[] = await leaguesRes.json()
      if (leagues.length === 0) return

      // Fetch full league detail to get teams with userId
      const detailRes = await fetch(`/api/leagues/${leagues[0].id}`)
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
  }, [session?.user?.id])

  useEffect(() => {
    if (sessionStatus === 'authenticated') fetchSquad()
    else if (sessionStatus === 'unauthenticated') setLoading(false)
  }, [sessionStatus, fetchSquad])

  /* ─── Handlers ─── */
  const handlePlayerTap = (playerId: string) => {
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
    if (swapMode === playerId) {
      setSwapMode(null)
    } else {
      setSwapMode(playerId)
    }
  }

  const handleChipToggle = () => {
    if (bowlingBoostOn) {
      setBowlingBoostOn(false)
      setDirty(true)
    } else {
      setChipModalOpen(true)
    }
  }

  const confirmChip = () => {
    setBowlingBoostOn(true)
    setChipModalOpen(false)
    setDirty(true)
  }

  /* ─── Arrange XI into 3 rows: 4-4-3 like mockup ─── */
  const row1 = xi.slice(0, 4)
  const row2 = xi.slice(4, 8)
  const row3 = xi.slice(8, 11)

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

  /* ─── Player Figure Component ─── */
  const PlayerFigure = ({ player, isCaptain, isVC, isBench }: {
    player: SquadPlayer; isCaptain: boolean; isVC: boolean; isBench?: boolean
  }) => {
    const code = player.iplTeamCode || ''
    const grad = teamGradients[code] || defaultGrad
    const logo = teamLogos[code]
    const light = isLightTeam(code)
    const initials = getInitials(player.fullname)
    const shortName = getShortName(player.fullname)

    const figW = isBench ? 42 : 56
    const figH = isBench ? 44 : 58
    const headSize = isBench ? 24 : 34
    const bodyW = isBench ? 40 : 52
    const bodyH = isBench ? 28 : 36
    const bodyTop = isBench ? 16 : 22
    const logoSize = isBench ? 16 : 22
    const logoMt = isBench ? 4 : 6
    const bodyBr = isBench ? '10px 10px 3px 3px' : '12px 12px 4px 4px'
    const plateMinW = isBench ? 60 : 82
    const plateMaxW = isBench ? 72 : 90
    const platePx = isBench ? '2px 5px 1px' : '4px 8px'
    const nameFs = isBench ? 11 : 12
    const valueFs = isBench ? 9 : 10

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Player figure */}
        <div style={{ width: figW, height: figH, position: 'relative', marginBottom: 2 }}>
          {/* C/VC badge */}
          {(isCaptain || isVC) && (
            <div style={{
              position: 'absolute', top: -2, right: isBench ? -2 : 2, zIndex: 5,
              width: 16, height: 16, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 900,
              background: isCaptain ? '#F9CD05' : '#C0C7D0',
              color: '#1a1a1a',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            }}>
              {isCaptain ? 'C' : 'V'}
            </div>
          )}
          {/* Head */}
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: headSize, height: headSize, borderRadius: '50%', zIndex: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isBench ? 9 : 11, fontWeight: 800,
            color: light ? '#1a1a1a' : '#fff',
            textShadow: light ? 'none' : '0 1px 3px rgba(0,0,0,0.4)',
            border: light ? '2.5px solid rgba(0,0,0,0.1)' : '2.5px solid rgba(255,255,255,0.35)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            background: grad.head,
            overflow: 'hidden',
          }}>
            {initials}
          </div>
          {/* Body */}
          <div style={{
            position: 'absolute', top: bodyTop, left: '50%', transform: 'translateX(-50%)',
            width: bodyW, height: bodyH, zIndex: 2,
            borderRadius: bodyBr,
            boxShadow: '0 3px 10px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: grad.body,
            overflow: 'hidden',
          }}>
            {/* Collar */}
            <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: 14, height: 5, borderRadius: '0 0 7px 7px',
              background: 'rgba(255,255,255,0.2)',
            }} />
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={code}
                style={{
                  width: logoSize, height: logoSize, objectFit: 'contain',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
                  marginTop: logoMt,
                }}
              />
            )}
          </div>
        </div>
        {/* Name plate */}
        <div style={{
          minWidth: plateMinW, maxWidth: plateMaxW,
          padding: platePx, borderRadius: 5,
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: grad.plate,
        }}>
          <div style={{
            fontSize: nameFs, fontWeight: 700,
            color: light ? '#1a1a1a' : '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: light ? 'none' : '0 1px 2px rgba(0,0,0,0.2)',
          }}>
            {shortName}
          </div>
          <div style={{
            fontSize: valueFs, fontWeight: 500,
            color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.8)',
            marginTop: 2, lineHeight: '1.55',
          }}>
            {code || 'IPL'}
          </div>
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
            width: 30, height: 30, borderRadius: '50%',
            border: '1.5px solid rgba(0,0,0,0.08)', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: '#333', fontSize: 14, cursor: 'pointer',
          }}>
            &#8249;
          </a>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.5 }}>
            Pick Team
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#555', marginBottom: 10 }}>
          {currentGW ? (
            <>
              Gameweek {currentGW.number} &middot;{' '}
              <strong style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 15 }}>
                {currentGW.lockTime
                  ? `Deadline: ${new Date(currentGW.lockTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(currentGW.lockTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                  : 'Deadline TBD'}
              </strong>
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
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', textAlign: 'center',
            padding: '7px 10px 6px', gap: 4,
            borderRight: '1px solid #efeff3',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #0d9e5f, #07c472)',
            }}>
              <BowlingBoostIcon color="white" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2 }}>Bowling Boost</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#888', lineHeight: 1.35 }}>Doubles all bowling points this GW</div>
            <div
              onClick={handleChipToggle}
              style={{
                width: 48, height: 28, borderRadius: 14,
                position: 'relative', cursor: 'pointer',
                transition: 'background 0.25s ease',
                background: bowlingBoostOn ? '#0d9e5f' : '#dde0e8',
                flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 3,
                left: bowlingBoostOn ? 23 : 3,
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
                transition: 'left 0.22s ease',
              }} />
            </div>
          </div>
          {/* Power Play Bat — already used */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', textAlign: 'center',
            padding: '7px 10px 6px', gap: 4,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#e8e8ee',
            }}>
              <PowerPlayBatIcon color="grey" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#bbb', lineHeight: 1.2 }}>Power Play Bat</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#ccc', lineHeight: 1.35 }}>Doubles all batting points this GW</div>
            <div style={{
              fontSize: 11, fontWeight: 700,
              background: '#f0f0f5', color: '#999', padding: '4px 10px',
              borderRadius: 8, whiteSpace: 'nowrap',
            }}>
              Used GW 3
            </div>
          </div>
        </div>
      </div>

      {/* ── Pitch ── */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(180deg,
          #3aad5c 0%, #35a254 15%,
          #30964c 30%, #34a058 45%,
          #3aad5c 50%, #30964c 65%,
          #2b8a45 80%, #267f3e 100%
        )`,
        minHeight: xi.length > 0 ? 380 : 200,
      }}>
        {/* Concentric circle markings */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 300, height: 300, borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.07)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 180, height: 180, borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.05)',
          pointerEvents: 'none',
        }} />

        {xi.length > 0 ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'space-evenly',
            padding: '12px 0 10px', zIndex: 3,
          }}>
            {/* Row 1 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
              {row1.map(p => (
                <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                  style={{
                    width: 92, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    opacity: swapMode ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>
            {/* Row 2 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
              {row2.map(p => (
                <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                  style={{
                    width: 92, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    opacity: swapMode ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>
            {/* Row 3 */}
            <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
              {row3.map(p => (
                <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                  style={{
                    width: 92, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    opacity: swapMode ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                  <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 3,
          }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600 }}>
              {squad ? 'No players in squad' : 'No team found'}
            </p>
          </div>
        )}
      </div>

      {/* ── Bench ── */}
      {bench.length > 0 && (
        <div style={{
          flexShrink: 0, padding: '6px 6px 4px',
          background: 'linear-gradient(180deg, #1a5c32, #16502c)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, justifyContent: 'center',
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)', maxWidth: 80 }} />
            <div style={{
              fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.2)',
              textTransform: 'uppercase', letterSpacing: 2,
            }}>
              Bench
            </div>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)', maxWidth: 80 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {bench.map(p => {
              const role = normalizeRole(p.role)
              const isSwapping = swapMode === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => handleBenchTap(p.id)}
                  style={{
                    width: 76, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    opacity: isSwapping ? 1 : (swapMode ? 0.5 : 1),
                    transform: isSwapping ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    fontSize: 9, fontWeight: 700, textAlign: 'center', marginBottom: 2,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    color: benchRoleColors[role] || 'rgba(255,255,255,0.3)',
                  }}>
                    {role}
                  </div>
                  <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} isBench />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Save Area ── */}
      {dirty && (
        <div style={{
          flexShrink: 0, padding: '6px 16px 34px', background: '#f2f3f8',
          animation: 'slideUp 0.3s ease',
        }}>
          <button style={{
            display: 'block', width: '100%', padding: 13, border: 'none', borderRadius: 14,
            background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
            color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: -0.3,
          }}>
            Save Lineup
          </button>
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
      {chipModalOpen && (
        <>
          <div
            onClick={() => setChipModalOpen(false)}
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
              background: 'linear-gradient(135deg, #0d9e5f, #07c472)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BowlingBoostIcon color="white" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', textAlign: 'center', padding: '0 24px' }}>
              Play Bowling Boost?
            </div>
            <div style={{ fontSize: 14, color: '#666', textAlign: 'center', marginTop: 6, padding: '0 28px', lineHeight: 1.5 }}>
              All bowling points for your squad will be doubled for Gameweek 8.
            </div>
            <div style={{
              margin: '16px 20px 0', padding: '12px 14px', borderRadius: 12,
              background: '#fff8ec', border: '1px solid rgba(255,160,0,0.3)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>&#9888;&#65039;</div>
              <div style={{ fontSize: 13, color: '#7a5500', fontWeight: 500, lineHeight: 1.45 }}>
                This chip <strong>cannot be changed</strong> once Gameweek 8 has started. You only get one Bowling Boost per season — use it wisely.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 20px 0' }}>
              <button
                onClick={confirmChip}
                style={{
                  display: 'block', width: '100%', padding: 15, border: 'none', borderRadius: 14,
                  background: 'linear-gradient(135deg, #0d9e5f, #07c472)',
                  color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Yes, Play Bowling Boost
              </button>
              <button
                onClick={() => setChipModalOpen(false)}
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
      )}

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
