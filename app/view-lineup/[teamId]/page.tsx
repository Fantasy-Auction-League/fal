'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppFrame } from '@/app/components/AppFrame'

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

interface TeamDetail {
  id: string
  name: string
  user: { id: string; name: string | null; email: string | null; image: string | null }
  league: { id: string; name: string }
}

/* ─── IPL team colors & gradients (EXACT copy from edit lineup) ─── */
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

/* ─── Helpers (EXACT copy from edit lineup) ─── */
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

/* ─── Nav Icons ─── */
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

/* ─── Lock Icon ─── */
const LockIcon = () => (
  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

/* ─── Player Figure Component (EXACT copy from edit lineup) ─── */
function PlayerFigure({ player, isCaptain, isVC, isBench }: {
  player: SquadPlayer; isCaptain: boolean; isVC: boolean; isBench?: boolean
}) {
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

/* ─── Main Page ─── */
export default function ViewLineupPage() {
  const { data: session, status: sessionStatus } = useSession()
  const params = useParams()
  const router = useRouter()
  const teamId = params?.teamId as string

  const [squad, setSquad] = useState<SquadData | null>(null)
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [xi, setXi] = useState<SquadPlayer[]>([])
  const [bench, setBench] = useState<SquadPlayer[]>([])
  const [captainId, setCaptainId] = useState<string | null>(null)
  const [vcId, setVcId] = useState<string | null>(null)
  const [currentGWNumber, setCurrentGWNumber] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    if (!teamId) return
    try {
      const [squadRes, teamRes, gwRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/squad`),
        fetch(`/api/teams/${teamId}`),
        fetch('/api/gameweeks/current'),
      ])

      if (gwRes.ok) {
        const gwData = await gwRes.json()
        if (gwData && !gwData.error) setCurrentGWNumber(gwData.number)
      }

      if (squadRes.ok) {
        const data: SquadData = await squadRes.json()
        setSquad(data)

        const players = data.players || []
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
      }

      if (teamRes.ok) {
        const tData: TeamDetail = await teamRes.json()
        setTeamDetail(tData)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => {
    if (sessionStatus === 'authenticated') fetchData()
    else if (sessionStatus === 'unauthenticated') setLoading(false)
  }, [sessionStatus, fetchData])

  /* ─── Arrange XI into fixed 4-3-4 formation, sorted by role priority (EXACT copy from edit lineup) ─── */
  const rolePri: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 }
  const sortedXi = [...xi].sort((a, b) => (rolePri[normalizeRole(a.role)] ?? 1) - (rolePri[normalizeRole(b.role)] ?? 1))
  const row1 = sortedXi.slice(0, 4)     // Top order (4)
  const row2 = sortedXi.slice(4, 7)     // Middle order (3)
  const row3 = sortedXi.slice(7, 11)    // Lower order (4)

  const managerName = teamDetail?.user?.name || teamDetail?.name || 'Manager'
  const managerFirstName = managerName.split(' ')[0]

  /* ─── Loading ─── */
  if (sessionStatus === 'loading' || loading) {
    return (
      <AppFrame>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888', fontSize: 14, fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>Loading...</p>
        </div>
      </AppFrame>
    )
  }

  if (!session) {
    return (
      <AppFrame>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: '#888', fontSize: 14 }}>Please log in to view lineups.</p>
          <a href="/login" style={{
            background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
            color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}>Go to Login</a>
        </div>
      </AppFrame>
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
      {/* ── Header Bar ── */}
      <div style={{
        background: '#fff',
        padding: '14px 18px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Back arrow */}
          <button
            onClick={() => router.back()}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: '#f2f3f8', border: '1px solid rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#333',
              fontSize: 15, fontWeight: 600,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            &#8592;
          </button>
          {/* Title group */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.3,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {managerFirstName}&apos;s Lineup
              {/* Read Only badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 700, color: '#888',
                background: '#f2f3f8', padding: '2px 7px', borderRadius: 5,
                border: '1px solid rgba(0,0,0,0.06)',
                letterSpacing: 0.3, textTransform: 'uppercase' as const,
              }}>
                <LockIcon />
                Read Only
              </span>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#999', letterSpacing: -0.1,
              marginTop: 1,
            }}>
              {currentGWNumber ? `GW${currentGWNumber}` : 'Pre-season'} · 0 pts
            </div>
          </div>
        </div>
      </div>

      {/* ── Pitch (EXACT copy from edit lineup) ── */}
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
            justifyContent: 'space-evenly', alignItems: 'center',
            padding: '12px 0 10px', zIndex: 3,
            gap: 6,
          }}>
            {/* Row 1: Top Order */}
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
              textAlign: 'center', marginBottom: -2,
            }}>Top Order</div>
            <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
              {row1.map(p => (
                <div key={p.id}
                  style={{
                    width: 86,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                  }}>
                  <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>

            {/* Row 2: Middle Order */}
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
              textAlign: 'center', marginBottom: -2,
            }}>Middle Order</div>
            <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
              {row2.map(p => (
                <div key={p.id}
                  style={{
                    width: 86,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                  }}>
                  <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                </div>
              ))}
            </div>

            {/* Row 3: Lower Order */}
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
              textAlign: 'center', marginBottom: -2,
            }}>Lower Order</div>
            <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
              {row3.map(p => (
                <div key={p.id}
                  style={{
                    width: 86,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
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

      {/* ── Bench (EXACT copy from edit lineup) ── */}
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
              return (
                <div
                  key={p.id}
                  style={{
                    width: 76,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
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
          { href: '/lineup', label: 'Lineup', Icon: IconLineup, active: false },
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
