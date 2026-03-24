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

/* ─── Player on Pitch ─── */
function PitchPlayer({ player, isCaptain, isVC }: {
  player: SquadPlayer; isCaptain: boolean; isVC: boolean
}) {
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

/* ─── Bench Player ─── */
function BenchPlayer({ player }: { player: SquadPlayer }) {
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

  /* ─── Arrange XI into rows matching mockup: Openers (2), Middle Order (4), Lower Order (5) ─── */
  // Group by role for formation
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

      {/* ── Cricket Pitch ── */}
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
                <PitchPlayer key={p.id} player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
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
                <PitchPlayer key={p.id} player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
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
                <PitchPlayer key={p.id} player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
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

      {/* ── Bench ── */}
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
            {bench.map(p => (
              <BenchPlayer key={p.id} player={p} />
            ))}
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
