'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AppFrame } from '@/app/components/AppFrame'
import { computeBattingBreakdown, computeBowlingBreakdown, computeFieldingBreakdown, type ScoringLine } from '@/lib/scoring/breakdown'

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


const benchRoleColors: Record<string, string> = {
  BAT: 'rgba(249,205,5,0.4)',
  BOWL: 'rgba(160,196,255,0.4)',
  WK: 'rgba(0,255,135,0.3)',
  ALL: 'rgba(14,177,162,0.3)',
}

const listRoleGradients: Record<string, { bg: string; color: string; label: string }> = {
  BAT:  { bg: 'linear-gradient(135deg, #F9CD05, #e0b800)', color: '#1a1a1a', label: 'BA' },
  BOWL: { bg: 'linear-gradient(135deg, #004BA0, #0066cc)', color: '#fff', label: 'BO' },
  ALL:  { bg: 'linear-gradient(135deg, #0EB1A2, #089e90)', color: '#fff', label: 'AR' },
  WK:   { bg: 'linear-gradient(135deg, #EA1A85, #c4166e)', color: '#fff', label: 'WK' },
}

const roleFullName: Record<string, string> = {
  BAT: 'Batsman', BOWL: 'Bowler', ALL: 'All-Rounder', WK: 'Wicket-keeper',
}

const teamNameToCode: Record<string, string> = {
  'Mumbai Indians': 'MI', 'Chennai Super Kings': 'CSK', 'Royal Challengers Bengaluru': 'RCB',
  'Kolkata Knight Riders': 'KKR', 'Delhi Capitals': 'DC', 'Rajasthan Royals': 'RR',
  'Sunrisers Hyderabad': 'SRH', 'Gujarat Titans': 'GT', 'Lucknow Super Giants': 'LSG',
  'Punjab Kings': 'PBKS',
}

interface SheetSeasonEntry {
  seasonId: number
  seasonName: string
  batting?: { runs: number; matches: number; innings: number; balls: number; fours: number; sixes: number; strikeRate: number; average: number; highestScore: number | null; fifties?: number; hundreds?: number }
  bowling?: { wickets: number; matches: number; overs: number; runs: number; economyRate: number; average: number; balls?: number; strikeRate?: number; fourWickets?: number; fiveWickets?: number }
}

interface SheetPlayerDetail {
  totalPoints: number
  matches: number
  performances: {
    runs: number | null; balls: number | null; fours: number | null; sixes: number | null
    wickets: number | null; overs: number | null; maidens: number | null; runsConceded: number | null
    catches: number; stumpings: number; fantasyPoints: number
    match?: { localTeamName: string | null; visitorTeamName: string | null; startingAt?: string; gameweek?: { number: number } | null }
  }[]
  upcomingFixtures?: { opponent: string; startingAt: string; gameweek: number | null }[]
  careerStats?: {
    batting?: { runs: number; matches: number; innings: number; balls: number; fours: number; sixes: number; strikeRate: number; average: number; highestScore: number; hundreds: number; fifties: number }
    bowling?: { wickets: number; matches: number; innings: number; overs: number; runs: number; economyRate: number; average: number; bestInnings: string; fourWickets: number; fiveWickets: number }
    isIplSpecific?: boolean
  } | null
  seasonStats?: { seasons: SheetSeasonEntry[] } | null
  dataSource?: string
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

/* ─── Player Figure Component ─── */
function PlayerFigure({ player, isCaptain, isVC, isBench, points }: {
  player: SquadPlayer; isCaptain: boolean; isVC: boolean; isBench?: boolean; points?: number
}) {
  const code = player.iplTeamCode || ''
  const grad = teamGradients[code] || defaultGrad
  // No external logo — show team code on jersey
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
  const valueFs = isBench ? 10 : 12

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Player figure */}
      <div style={{ width: figW, height: figH, position: 'relative', marginBottom: 2 }}>
        {/* C/VC badge */}
        {(isCaptain || isVC) && (
          <div style={{
            position: 'absolute', top: -4, right: isBench ? -4 : 0, zIndex: 5,
            width: 22, height: 22, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 900,
            background: isCaptain ? '#F9CD05' : '#C0C7D0',
            color: '#1a1a1a',
            border: '2px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}>
            {isCaptain ? 'C' : 'VC'}
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
          <span style={{
            fontSize: isBench ? 10 : 14, fontWeight: 900,
            color: light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)',
            marginTop: logoMt,
            letterSpacing: 1,
          }}>
            {code}
          </span>
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
          fontSize: valueFs, fontWeight: 700,
          color: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.8)',
          marginTop: 2, lineHeight: '1.55',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          {points !== undefined ? (
            <span>{points} pts</span>
          ) : (
            code || 'IPL'
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Role icon gradients for list view ─── */
const roleIconGradients: Record<string, { bg: string; color: string; letter: string }> = {
  BAT:  { bg: 'linear-gradient(135deg, #F9CD05, #e0b800)', color: '#1a1a1a', letter: 'B' },
  BOWL: { bg: 'linear-gradient(135deg, #004BA0, #0066cc)', color: '#fff', letter: 'B' },
  ALL:  { bg: 'linear-gradient(135deg, #0EB1A2, #089e90)', color: '#fff', letter: 'A' },
  WK:   { bg: 'linear-gradient(135deg, #EA1A85, #c4166e)', color: '#fff', letter: 'W' },
}

/* ─── Toggle SVG Icons ─── */
const IconGrid = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
)
const IconList = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)

/* ─── Main Page ─── */
export default function ViewLineupPage() {
  const { data: session, status: sessionStatus } = useSession()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const teamId = params?.teamId as string
  const gwFromUrl = searchParams?.get('gw')

  const [squad, setSquad] = useState<SquadData | null>(null)
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [xi, setXi] = useState<SquadPlayer[]>([])
  const [bench, setBench] = useState<SquadPlayer[]>([])
  const [captainId, setCaptainId] = useState<string | null>(null)
  const [vcId, setVcId] = useState<string | null>(null)
  const [currentGWNumber, setCurrentGWNumber] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'pitch' | 'list'>('pitch')
  const [playerStatsSheet, setPlayerStatsSheet] = useState<SquadPlayer | null>(null)
  const [sheetDetail, setSheetDetail] = useState<SheetPlayerDetail | null>(null)
  const [sheetDetailLoading, setSheetDetailLoading] = useState(false)
  const [sheetView, setSheetView] = useState<'compact' | 'full'>('compact')

  /* ─── GW navigation state ─── */
  const [allGameweeks, setAllGameweeks] = useState<{ id: string; number: number; status: string }[]>([])
  const [selectedGWNumber, setSelectedGWNumber] = useState<number | null>(null)
  const [playerPoints, setPlayerPoints] = useState<Record<string, number>>({})
  const [gwTotal, setGwTotal] = useState<number>(0)
  const [gwLoading, setGwLoading] = useState(false)
  const [noLineupForGW, setNoLineupForGW] = useState(false)
  const [gwStats, setGwStats] = useState<{ average: number; highest: number; highestTeamId: string | null } | null>(null)

  /* ─── Fetch league GW stats (average / highest) ─── */
  useEffect(() => {
    if (!teamDetail?.league?.id || selectedGWNumber === null) return
    fetch(`/api/leagues/${teamDetail.league.id}/gw-stats?gw=${selectedGWNumber}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setGwStats(data))
      .catch(() => setGwStats(null))
  }, [teamDetail?.league?.id, selectedGWNumber])

  /* ─── Fetch player detail when stats sheet opens ─── */
  useEffect(() => {
    if (!playerStatsSheet) { setSheetDetail(null); setSheetView('compact'); return }
    let cancelled = false
    setSheetDetailLoading(true)
    setSheetDetail(null)
    fetch(`/api/players/${playerStatsSheet.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) { setSheetDetailLoading(false); return }
        const perfs = (data.performances || []).map((p: Record<string, unknown>) => ({
          runs: p.runs as number | null, balls: p.balls as number | null,
          fours: p.fours as number | null, sixes: p.sixes as number | null,
          wickets: p.wickets as number | null, overs: p.overs as number | null,
          maidens: p.maidens as number | null, runsConceded: p.runsConceded as number | null,
          catches: (p.catches as number) || 0, stumpings: (p.stumpings as number) || 0,
          fantasyPoints: (p.fantasyPoints as number) || 0,
          match: p.match as { localTeamName: string | null; visitorTeamName: string | null; startingAt?: string; gameweek?: { number: number } | null } | undefined,
        }))
        setSheetDetail({
          totalPoints: data.stats?.totalPoints ?? 0,
          matches: data.stats?.matches ?? perfs.length,
          performances: perfs,
          careerStats: data.careerStats || null,
          seasonStats: data.seasonStats || null,
          dataSource: data.dataSource || 'none',
          upcomingFixtures: data.upcomingFixtures || [],
        })
        setSheetDetailLoading(false)
      })
      .catch(() => { if (!cancelled) setSheetDetailLoading(false) })
    return () => { cancelled = true }
  }, [playerStatsSheet])

  /* ─── Restore lineup from API response slots ─── */
  const restoreLineupFromSlots = useCallback((
    slots: { slotType: string; playerId: string; role: string | null; benchPriority: number | null }[],
    playerMap: Map<string, SquadPlayer>,
  ): boolean => {
    const xiSlots = slots.filter(s => s.slotType === 'XI')
    const benchSlots = slots
      .filter(s => s.slotType === 'BENCH')
      .sort((a, b) => (a.benchPriority ?? 99) - (b.benchPriority ?? 99))

    const xiPlayers = xiSlots
      .map(s => playerMap.get(s.playerId))
      .filter(Boolean) as SquadPlayer[]
    const benchPlayers = benchSlots
      .map(s => playerMap.get(s.playerId))
      .filter(Boolean) as SquadPlayer[]

    if (xiPlayers.length === 0) return false

    setXi(xiPlayers)
    setBench(benchPlayers)

    const capSlot = slots.find(s => s.role === 'CAPTAIN')
    const vcSlot = slots.find(s => s.role === 'VC')
    if (capSlot && playerMap.has(capSlot.playerId)) setCaptainId(capSlot.playerId)
    else setCaptainId(xiPlayers[0].id)
    if (vcSlot && playerMap.has(vcSlot.playerId)) setVcId(vcSlot.playerId)
    else if (xiPlayers.length > 1) setVcId(xiPlayers[1].id)

    return true
  }, [])

  /* ─── Fetch GW-specific lineup + scores ─── */
  const fetchGWData = useCallback(async (gwNumber: number) => {
    if (!teamId || allGameweeks.length === 0) return
    const gw = allGameweeks.find(g => g.number === gwNumber)
    if (!gw) return

    setGwLoading(true)
    setNoLineupForGW(false)

    try {
      const [lineupRes, scoresRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/lineups/${gw.id}`),
        fetch(`/api/teams/${teamId}/scores/${gw.id}`),
      ])

      // Restore lineup snapshot
      if (lineupRes.ok) {
        const lineupData = await lineupRes.json()
        const slots = lineupData.lineup?.slots
        if (Array.isArray(slots) && slots.length > 0 && squad) {
          const playerMap = new Map(squad.players.map(p => [p.id, p]))
          const restored = restoreLineupFromSlots(slots, playerMap)
          if (!restored) setNoLineupForGW(true)
        } else {
          setNoLineupForGW(true)
        }
      } else {
        setNoLineupForGW(true)
      }

      // Parse player scores + server-computed GW total (LIVE/FINAL unified format)
      if (scoresRes.ok) {
        const scoresData = await scoresRes.json()
        const pointsMap: Record<string, number> = {}
        // New format: scoresData.players[] with { id, multipliedPoints }
        if (Array.isArray(scoresData.players) && scoresData.players.length > 0) {
          for (const p of scoresData.players) {
            pointsMap[p.id] = p.multipliedPoints ?? 0
          }
        } else if (Array.isArray(scoresData.performances) && scoresData.performances.length > 0) {
          // Mid-GW fallback: sum per-match fantasy points from PlayerPerformance
          for (const perf of scoresData.performances) {
            const pid = perf.player.id
            pointsMap[pid] = (pointsMap[pid] || 0) + perf.fantasyPoints
          }
        }
        setPlayerPoints(pointsMap)
        // totalPoints at top level (both LIVE and FINAL modes)
        if (scoresData.totalPoints !== undefined) {
          setGwTotal(scoresData.totalPoints)
        } else {
          // Mid-GW fallback: sum all live points (with multipliers applied)
          const liveTotal = Object.values(pointsMap).reduce((sum: number, pts) => sum + (pts as number), 0)
          setGwTotal(liveTotal)
        }
      } else {
        setPlayerPoints({})
        setGwTotal(0)
      }
    } catch {
      setNoLineupForGW(true)
      setPlayerPoints({})
      setGwTotal(0)
    } finally {
      setGwLoading(false)
    }
  }, [teamId, allGameweeks, squad, restoreLineupFromSlots])

  const fetchData = useCallback(async () => {
    if (!teamId) return
    try {
      const [squadRes, teamRes, gwRes, allGwRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/squad`),
        fetch(`/api/teams/${teamId}`),
        fetch('/api/gameweeks/current'),
        fetch('/api/gameweeks'),
      ])

      // Parse all gameweeks
      let allGws: { id: string; number: number; status: string }[] = []
      if (allGwRes.ok) {
        allGws = await allGwRes.json()
        setAllGameweeks(allGws)
      }

      // Parse current gameweek data
      let currentGW: { id: string; number: number } | null = null
      if (gwRes.ok) {
        const gwData = await gwRes.json()
        if (gwData && !gwData.error) {
          currentGW = { id: gwData.id, number: gwData.number }
          setCurrentGWNumber(gwData.number)
          setSelectedGWNumber(gwData.number)
        }
      }

      // Fallback: if no current GW, use latest completed
      if (!currentGW && allGws.length > 0) {
        const completed = allGws
          .filter(gw => gw.status === 'COMPLETED')
          .sort((a, b) => b.number - a.number)
        if (completed.length > 0) {
          currentGW = { id: completed[0].id, number: completed[0].number }
          setCurrentGWNumber(completed[0].number)
          setSelectedGWNumber(completed[0].number)
        }
      }

      // Override with ?gw= URL param if present
      if (gwFromUrl) {
        const gwNum = parseInt(gwFromUrl)
        if (!isNaN(gwNum) && allGws.some(g => g.number === gwNum)) {
          setSelectedGWNumber(gwNum)
        }
      }

      if (squadRes.ok) {
        const data: SquadData = await squadRes.json()
        setSquad(data)

        const players = data.players || []
        const playerMap = new Map(players.map(p => [p.id, p]))
        let restored = false

        if (currentGW) {
          try {
            const [lineupRes, scoresRes] = await Promise.all([
              fetch(`/api/teams/${teamId}/lineups/${currentGW.id}`),
              fetch(`/api/teams/${teamId}/scores/${currentGW.id}`),
            ])

            if (lineupRes.ok) {
              const lineupData = await lineupRes.json()
              const slots = lineupData.lineup?.slots
              if (Array.isArray(slots) && slots.length > 0) {
                restored = restoreLineupFromSlots(slots, playerMap)
              }
            }

            // Parse initial scores + server-computed GW total (LIVE/FINAL unified format)
            if (scoresRes.ok) {
              const scoresData = await scoresRes.json()
              const pointsMap: Record<string, number> = {}
              if (Array.isArray(scoresData.players) && scoresData.players.length > 0) {
                for (const p of scoresData.players) {
                  pointsMap[p.id] = p.multipliedPoints ?? 0
                }
              } else if (Array.isArray(scoresData.performances) && scoresData.performances.length > 0) {
                // Mid-GW fallback: sum per-match fantasy points from PlayerPerformance
                for (const perf of scoresData.performances) {
                  const pid = perf.player.id
                  pointsMap[pid] = (pointsMap[pid] || 0) + perf.fantasyPoints
                }
              }
              setPlayerPoints(pointsMap)
              if (scoresData.totalPoints !== undefined) {
                setGwTotal(scoresData.totalPoints)
              } else {
                const liveTotal = Object.values(pointsMap).reduce((sum: number, pts) => sum + (pts as number), 0)
                setGwTotal(liveTotal)
              }
            }
          } catch {
            // Fall through to default lineup generation
          }
        }

        // Fallback: build initial lineup from squad if no saved lineup
        if (!restored) {
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
  }, [teamId, restoreLineupFromSlots])

  useEffect(() => {
    if (sessionStatus === 'authenticated') fetchData()
    else if (sessionStatus === 'unauthenticated') setLoading(false)
  }, [sessionStatus, fetchData])

  /* ─── GW navigation handler ─── */
  const navigateGW = useCallback((direction: 'prev' | 'next') => {
    if (selectedGWNumber === null || allGameweeks.length === 0) return
    const newNum = direction === 'prev' ? selectedGWNumber - 1 : selectedGWNumber + 1
    const minGW = Math.min(...allGameweeks.map(g => g.number))
    const maxGW = currentGWNumber ?? Math.max(...allGameweeks.map(g => g.number))
    if (newNum < minGW || newNum > maxGW) return
    setSelectedGWNumber(newNum)
    fetchGWData(newNum)
  }, [selectedGWNumber, allGameweeks, currentGWNumber, fetchGWData])

  /* ─── GW navigation bounds ─── */
  const minGWNumber = allGameweeks.length > 0 ? Math.min(...allGameweeks.map(g => g.number)) : 1
  const maxGWNumber = currentGWNumber ?? (allGameweeks.length > 0 ? Math.max(...allGameweeks.map(g => g.number)) : 1)
  const canGoPrev = selectedGWNumber !== null && selectedGWNumber > minGWNumber
  const canGoNext = selectedGWNumber !== null && selectedGWNumber < maxGWNumber

  /* ─── Derive GW status from allGameweeks ─── */
  const gwStatus = selectedGWNumber !== null
    ? allGameweeks.find(g => g.number === selectedGWNumber)?.status ?? null
    : null

  /* ─── Helper: get player points ─── */
  const getPoints = (playerId: string): number => playerPoints[playerId] ?? 0

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
      {/* ── Dashboard-Style Hero Header ── */}
      <div style={{
        background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
        padding: '20px 18px 16px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* Radial glow */}
        <div style={{
          position: 'absolute', top: '-30%', right: '-20%',
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(249,205,5,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Top row: back + title + read only badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.7)',
              fontSize: 15, fontWeight: 600,
            }}
          >
            &#8592;
          </button>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>
            {managerFirstName}&apos;s Lineup
          </div>
          <span style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
            background: 'rgba(255,255,255,0.12)', padding: '2px 7px', borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.15)',
            letterSpacing: 0.3, textTransform: 'uppercase' as const,
          }}>
            <LockIcon />
            Read Only
          </span>
        </div>

        {/* GW label with status badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.5)',
            fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' as const,
          }}>
            Gameweek {selectedGWNumber}
          </div>
          {gwStatus && (
            <div style={{
              fontSize: 9, fontWeight: 700,
              color: gwStatus === 'ACTIVE' ? '#4ade80' : 'rgba(255,255,255,0.5)',
              background: gwStatus === 'ACTIVE' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
              padding: '2px 6px', borderRadius: 4,
            }}>
              {gwStatus === 'ACTIVE' ? 'LIVE' : 'FINAL'}
            </div>
          )}
        </div>

        {/* Score trio */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 12 }}>
          {/* Average */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
              {gwStats?.average ?? '\u2014'}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginTop: 1 }}>Average</div>
          </div>

          {/* This team's points (center, large) */}
          <div style={{ flex: 1.3, textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '10%', bottom: '20%', left: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ position: 'absolute', top: '10%', bottom: '20%', right: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {gwTotal > 0 ? gwTotal : '\u2014'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginTop: 2 }}>Points</div>
          </div>

          {/* Highest (clickable) */}
          <div
            onClick={() => {
              if (gwStats?.highestTeamId && gwStats.highestTeamId !== teamId) {
                router.push(`/view-lineup/${gwStats.highestTeamId}?gw=${selectedGWNumber}`)
              }
            }}
            style={{ flex: 1, textAlign: 'center', cursor: gwStats?.highestTeamId ? 'pointer' : 'default' }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
              {gwStats?.highest ?? '\u2014'}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginTop: 1 }}>Highest</div>
          </div>
        </div>

        {/* GW navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {canGoPrev && (
            <button
              onClick={() => navigateGW('prev')}
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
                padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.6)',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              &larr; GW{selectedGWNumber - 1}
            </button>
          )}
          {selectedGWNumber !== null && canGoNext && (
            <button
              onClick={() => navigateGW('next')}
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
                padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.6)',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              GW{selectedGWNumber + 1} &rarr;
            </button>
          )}
        </div>
      </div>

      {/* ── View Toggle ── */}
      <div style={{
        background: '#fff', padding: '6px 16px 8px',
        display: 'flex', flexShrink: 0, borderBottom: '1px solid #efefF3',
      }}>
        <div style={{
          display: 'flex', background: '#f2f3f8', borderRadius: 10, padding: 3, flex: 1,
        }}>
          {(['pitch', 'list'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                flex: 1, padding: '6px 0', border: 'none', borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                background: viewMode === mode ? '#fff' : 'transparent',
                color: viewMode === mode ? '#1a1a2e' : '#888',
                boxShadow: viewMode === mode ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {mode === 'pitch' ? <IconGrid /> : <IconList />}
              {mode === 'pitch' ? 'Pitch View' : 'List View'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pitch View ── */}
      {viewMode === 'pitch' && (
        <>
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

            {/* GW loading overlay */}
            {gwLoading && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(48,150,76,0.6)', backdropFilter: 'blur(2px)',
              }}>
                <p style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Loading GW {selectedGWNumber}...</p>
              </div>
            )}

            {/* No lineup for this GW */}
            {noLineupForGW && !gwLoading && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600 }}>
                  No lineup submitted for GW {selectedGWNumber}
                </p>
              </div>
            )}

            {xi.length > 0 && !noLineupForGW ? (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'space-evenly', alignItems: 'center',
                padding: '12px 0 10px', zIndex: 3,
                gap: 6,
              }}>
                {/* Playing XI header */}
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                  textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.5)',
                  textAlign: 'center', marginBottom: 4,
                }}>Playing XI</div>

                {/* Row 1 */}
                <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
                  {row1.map(p => (
                    <div key={p.id}
                      onClick={() => setPlayerStatsSheet(p)}
                      style={{
                        width: 86, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                      }}>
                      <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} points={getPoints(p.id)} />
                    </div>
                  ))}
                </div>

                {/* Row 2 */}
                <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
                  {row2.map(p => (
                    <div key={p.id}
                      onClick={() => setPlayerStatsSheet(p)}
                      style={{
                        width: 86, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                      }}>
                      <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} points={getPoints(p.id)} />
                    </div>
                  ))}
                </div>

                {/* Row 3 */}
                <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
                  {row3.map(p => (
                    <div key={p.id}
                      onClick={() => setPlayerStatsSheet(p)}
                      style={{
                        width: 86, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                      }}>
                      <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} points={getPoints(p.id)} />
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

          {/* ── Bench (pitch view) ── */}
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
                      onClick={() => setPlayerStatsSheet(p)}
                      style={{
                        width: 76, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                      }}
                    >
                      <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} isBench points={getPoints(p.id)} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── List View (read-only) ── */}
      {viewMode === 'list' && (
        <div style={{
          flex: 1, overflowY: 'auto', background: '#f2f3f8',
          display: 'flex', flexDirection: 'column',
        }}>
          {gwLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '40px 16px',
            }}>
              <p style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>Loading GW {selectedGWNumber}...</p>
            </div>
          )}

          {noLineupForGW && !gwLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '40px 16px',
            }}>
              <p style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>
                No lineup submitted for GW {selectedGWNumber}
              </p>
            </div>
          )}

          {!noLineupForGW && !gwLoading && (<>
          {/* Playing XI section */}
          <div style={{
            fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
            letterSpacing: 0.8, padding: '10px 16px 4px',
          }}>Playing XI</div>

          {sortedXi.map(p => {
            const role = normalizeRole(p.role)
            const isCap = captainId === p.id
            const isVc = vcId === p.id
            const iconStyle = roleIconGradients[role] || roleIconGradients.BAT
            return (
              <div key={p.id} onClick={() => setPlayerStatsSheet(p)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', background: '#fff',
                borderBottom: '1px solid #f2f3f8', cursor: 'pointer',
              }}>
                {/* Role icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                  background: iconStyle.bg, color: iconStyle.color,
                }}>{iconStyle.letter}</div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: '#1a1a2e',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    {getShortName(p.fullname)}
                    {isCap && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, padding: '1.5px 5px', borderRadius: 4,
                        background: '#F9CD05', color: '#1a1a1a', flexShrink: 0,
                      }}>C</span>
                    )}
                    {isVc && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, padding: '1.5px 5px', borderRadius: 4,
                        background: '#C0C7D0', color: '#1a1a1a', flexShrink: 0,
                      }}>VC</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
                    {p.iplTeamCode || 'IPL'} · {role}
                  </div>
                </div>
                {/* Points */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: 15, fontWeight: 800,
                    color: isCap ? '#b58800' : '#1a1a2e',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{getPoints(p.id)}</span>
                </div>
              </div>
            )
          })}

          {/* Bench section */}
          {bench.length > 0 && (
            <>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
                letterSpacing: 0.8, padding: '10px 16px 4px', marginTop: 4,
              }}>Bench</div>

              {bench.map((p, idx) => {
                const role = normalizeRole(p.role)
                const iconStyle = roleIconGradients[role] || roleIconGradients.BAT
                return (
                  <div key={p.id} onClick={() => setPlayerStatsSheet(p)} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', background: '#fafbfd',
                    borderBottom: '1px solid #f2f3f8',
                    opacity: 0.75, cursor: 'pointer',
                  }}>
                    {/* Priority badge */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: '#e8eaf0', color: '#888',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, flexShrink: 0,
                    }}>{idx + 1}</div>
                    {/* Role icon */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                      background: iconStyle.bg, color: iconStyle.color,
                    }}>{iconStyle.letter}</div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>
                        {getShortName(p.fullname)}
                      </div>
                      <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
                        {p.iplTeamCode || 'IPL'} · {role}
                      </div>
                    </div>
                    {/* Bench points (actual, but didn't count) */}
                    <span style={{
                      fontSize: 15, fontWeight: 800, color: '#aaa',
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    }}>{getPoints(p.id)}</span>
                  </div>
                )
              })}
            </>
          )}
          </>)}

          {/* Summary bar */}
          <div style={{
            margin: '10px 16px 16px', padding: '12px 16px', borderRadius: 14,
            background: '#fff', border: '1px solid #eef0f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#333' }}>{gwTotal}</div>
              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>
                {selectedGWNumber ? `GW${selectedGWNumber} Total` : currentGWNumber ? `GW${currentGWNumber} Total` : 'Total'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#b58800' }}>
                {captainId ? getShortName(sortedXi.find(p => p.id === captainId)?.fullname || bench.find(p => p.id === captainId)?.fullname || '—') : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Captain (2&times;)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>
                {vcId ? getShortName(sortedXi.find(p => p.id === vcId)?.fullname || bench.find(p => p.id === vcId)?.fullname || '—') : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Vice Captain</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Player Stats Sheet (read-only) ── */}
      {playerStatsSheet && (() => {
        const p = playerStatsSheet
        const role = normalizeRole(p.role)
        const roleStyle = listRoleGradients[role] || listRoleGradients.BAT
        const isCap = captainId === p.id
        const isVCPlayer = vcId === p.id
        const closeStatsSheet = () => setPlayerStatsSheet(null)

        return (
          <>
            <div
              onClick={closeStatsSheet}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                zIndex: 200,
              }}
            />
            <div style={{
              position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
              width: '100%', maxWidth: 480,
              maxHeight: '80vh', overflowY: 'auto',
              background: '#fff', borderRadius: '20px 20px 0 0',
              zIndex: 210, paddingBottom: 36,
              animation: 'slideUp 0.25s ease-out',
            }}>
              {/* Close */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
                <button
                  onClick={closeStatsSheet}
                  aria-label="Close"
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', background: '#f2f3f8', cursor: 'pointer',
                    fontSize: 16, color: '#666', fontFamily: 'inherit', lineHeight: 1,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  &#10005;
                </button>
              </div>

              {/* Player header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px 10px', paddingRight: 50, position: 'relative',
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: roleStyle.bg, color: roleStyle.color,
                }}>
                  {roleStyle.label}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {p.fullname}
                    {isCap && <span style={{ fontSize: 8, fontWeight: 800, padding: '1.5px 5px', borderRadius: 4, background: '#F9CD05', color: '#1a1a1a' }}>C</span>}
                    {isVCPlayer && <span style={{ fontSize: 8, fontWeight: 800, padding: '1.5px 5px', borderRadius: 4, background: '#C0C7D0', color: '#1a1a1a' }}>VC</span>}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>
                    {p.iplTeamCode || 'IPL'} &middot; {roleFullName[role] || role}
                    {sheetDetail && sheetDetail.matches > 0 ? ` \u00B7 ${sheetDetail.matches} matches` : ''}
                  </div>
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 800, color: '#004BA0',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: -1,
                }}>
                  {sheetDetail ? (sheetDetail.totalPoints > 0 ? sheetDetail.totalPoints : '\u2014') : '\u2014'}
                </div>
              </div>

              {sheetView === 'compact' ? (<>
              {/* Loading spinner */}
              {sheetDetailLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0 12px' }}>
                  <div style={{
                    width: 20, height: 20, border: '2.5px solid #e8eaf0', borderTopColor: '#004BA0',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
                </div>
              )}

              {/* Key Info Row */}
              {!sheetDetailLoading && (() => {
                const ptsPerMatch = sheetDetail && sheetDetail.matches > 0
                  ? (sheetDetail.totalPoints / sheetDetail.matches).toFixed(1)
                  : '\u2014'

                return (
                  <div style={{ display: 'flex', gap: 8, padding: '6px 16px 10px' }}>
                    {/* Auction Price */}
                    <div style={{
                      flex: 1, background: '#fff', border: '1px solid #eef0f5', borderRadius: 10,
                      padding: '8px 10px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 8, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                        Auction Price
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', fontVariantNumeric: 'tabular-nums' }}>
                        ${p.purchasePrice}M
                      </div>
                    </div>
                    {/* Pts/Match */}
                    <div style={{
                      flex: 1, background: '#fff', border: '1px solid #eef0f5', borderRadius: 10,
                      padding: '8px 10px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 8, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                        Pts/Match
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', fontVariantNumeric: 'tabular-nums' }}>
                        {ptsPerMatch}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Fixtures Row */}
              {!sheetDetailLoading && sheetDetail && (() => {
                const playerTeam = p.iplTeamName
                const fmtDate = (iso: string) => {
                  const d = new Date(iso)
                  const day = d.getDate()
                  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
                  return `${day} ${mon}`
                }
                const played = [...sheetDetail.performances].reverse().map(perf => {
                  const m = perf.match
                  if (!m) return null
                  const opponentName = m.localTeamName === playerTeam ? m.visitorTeamName : m.localTeamName
                  const date = m.startingAt ? fmtDate(m.startingAt) : ''
                  return { team: teamNameToCode[opponentName ?? ''] || opponentName?.slice(0, 3).toUpperCase() || '?', points: perf.fantasyPoints as number | null, date }
                }).filter(Boolean) as { team: string; points: number | null; date: string }[]

                const upcoming = (sheetDetail.upcomingFixtures || []).map(f => ({
                  team: teamNameToCode[f.opponent] || f.opponent.slice(0, 3).toUpperCase(),
                  points: null as number | null,
                  date: fmtDate(f.startingAt),
                }))

                const totalSlots = 6
                let pastCount = Math.min(played.length, 3)
                let futureCount = Math.min(upcoming.length, 3)
                if (pastCount < 3) futureCount = Math.min(upcoming.length, totalSlots - pastCount)
                if (futureCount < 3) pastCount = Math.min(played.length, totalSlots - futureCount)
                const fixtures = [
                  ...played.slice(-pastCount),
                  ...upcoming.slice(0, futureCount),
                ].slice(0, totalSlots)

                if (fixtures.length === 0) return null

                return (
                  <div style={{ padding: '2px 16px 8px' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>
                      Fixtures
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {fixtures.map((f, i) => {
                        const isPlayed = f.points !== null
                        const pts = f.points ?? 0
                        const pointsColor = !isPlayed ? '#ccc' : pts > 30 ? '#0d9e5f' : pts >= 15 ? '#c88a00' : '#d44'
                        return (
                          <div key={i} style={{
                            flex: 1, textAlign: 'center', padding: '4px 2px 5px',
                            borderRadius: 8, background: '#f7f8fb', border: '1px solid #eef0f5',
                          }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#1a1a2e', letterSpacing: 0.3 }}>
                              {f.team}
                            </div>
                            <div style={{
                              fontSize: 12, fontWeight: 800, marginTop: 1,
                              color: isPlayed ? pointsColor : '#666',
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {isPlayed ? f.points : f.date}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* GW Points Breakdown */}
              {!sheetDetailLoading && sheetDetail && (() => {
                const gwPerfs = sheetDetail.performances.filter(perf => {
                  const gwNum = perf.match?.gameweek?.number
                  return gwNum === selectedGWNumber
                })
                if (gwPerfs.length === 0) return null

                const gwMatchTotal = gwPerfs.reduce((sum, pr) => sum + pr.fantasyPoints, 0)
                const playerTeam = p.iplTeamName

                return (
                  <div style={{ padding: '8px 16px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        GW{selectedGWNumber} Points Breakdown
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#004BA0' }}>{gwMatchTotal} pts</div>
                    </div>

                    {gwPerfs.map((perf, perfIdx) => {
                      const m = perf.match
                      if (!m) return null
                      const opponentName = m.localTeamName === playerTeam ? m.visitorTeamName : m.localTeamName
                      const oppCode = teamNameToCode[opponentName ?? ''] || opponentName?.slice(0, 3).toUpperCase() || '?'
                      const fmtDate = (iso: string) => {
                        const d = new Date(iso)
                        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      }
                      const matchDate = m.startingAt ? fmtDate(m.startingAt) : ''
                      const pts = perf.fantasyPoints
                      const ptsColor = pts > 30 ? '#0d9e5f' : pts >= 15 ? '#c88a00' : '#d44'

                      const perfRole = normalizeRole(p.role)
                      const batLines = computeBattingBreakdown(perf, perfRole)
                      const bowlLines = computeBowlingBreakdown(perf)
                      const fieldLines = computeFieldingBreakdown(perf)
                      const batTotal = batLines.reduce((s, l) => s + l.points, 0)
                      const bowlTotal = bowlLines.reduce((s, l) => s + l.points, 0)
                      const fieldTotal = fieldLines.reduce((s, l) => s + l.points, 0)
                      const remainder = pts - batTotal - bowlTotal - fieldTotal
                      const otherLines: ScoringLine[] = remainder !== 0
                        ? [{ category: 'Other', rawValue: '', formula: 'dots, lbw/b, etc.', points: remainder }]
                        : []
                      const allLines = [...batLines, ...bowlLines, ...fieldLines, ...otherLines]

                      return (
                        <div key={perfIdx} style={{
                          background: '#fff', border: '1.5px solid #e8eaf0', borderRadius: 12,
                          padding: '12px 14px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #f0f1f5',
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>
                              vs {oppCode} {matchDate ? `· ${matchDate}` : ''}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: ptsColor }}>{pts}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {allLines.map((line, i) => (
                              <div key={i} style={{
                                display: 'flex', alignItems: 'center', fontSize: 12, padding: '5px 0',
                                borderBottom: i < allLines.length - 1 ? '1px solid #f5f6f9' : 'none',
                              }}>
                                <span style={{ flex: 1.2, color: '#555', fontWeight: 500 }}>{line.category}</span>
                                <span style={{ flex: 2, textAlign: 'center', color: '#1a1a2e' }}>
                                  <span style={{ fontWeight: 700, fontSize: 13 }}>{line.rawValue}</span>
                                  <span style={{ color: '#999', fontSize: 11, marginLeft: 2 }}>{line.formula}</span>
                                </span>
                                <span style={{ flex: 0.8, textAlign: 'right', fontWeight: 700, color: line.points >= 0 ? '#004BA0' : '#d44', fontSize: 12 }}>
                                  {line.points > 0 ? '+' : ''}{line.points} pts
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Full Profile button — full width */}
              <div style={{ padding: '10px 20px 0' }}>
                <button
                  onClick={() => setSheetView('full')}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 12,
                    border: '2px solid #e0e2ea', background: '#fff',
                    color: '#1a1a2e', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Full Profile
                </button>
              </div>
              </>) : (
              /* ── Full Profile View ── */
              <>
              {/* Back button */}
              <button
                onClick={() => setSheetView('compact')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#004BA0',
                  fontFamily: 'inherit',
                }}
              >
                {'\u2190'} Back
              </button>

              {/* Loading */}
              {sheetDetailLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                  <div style={{
                    width: 24, height: 24, border: '3px solid #e8eaf0', borderTopColor: '#004BA0',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                </div>
              )}

              {/* Tables */}
              {!sheetDetailLoading && sheetDetail && (() => {
                const apiSeasons = sheetDetail.seasonStats?.seasons ?? []
                const cs = sheetDetail.careerStats
                const hasBatting = (cs?.batting && cs.batting.matches > 0) || apiSeasons.some(s => s.batting && s.batting.matches > 0)
                const hasBowling = (cs?.bowling && cs.bowling.wickets > 0) || apiSeasons.some(s => s.bowling && s.bowling.wickets > 0)

                if (!hasBatting && !hasBowling) {
                  return (
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#aaa', fontSize: 12, fontWeight: 500 }}>
                      No match data available yet
                    </div>
                  )
                }

                type BatRow = { label: string; isCareer: boolean; isMostRecent: boolean; mat: number; runs: number; avg: string; sr: string; fiftyHundred: string; foursSixes: string }
                const batRows: BatRow[] = []
                if (cs?.batting && cs.batting.matches > 0) {
                  const b = cs.batting
                  batRows.push({
                    label: 'T20', isCareer: true, isMostRecent: false,
                    mat: b.matches, runs: b.runs,
                    avg: b.average > 0 ? b.average.toFixed(1) : '\u2014',
                    sr: b.strikeRate > 0 ? b.strikeRate.toFixed(1) : '\u2014',
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
                    avg: b.average > 0 ? b.average.toFixed(1) : '\u2014',
                    sr: b.strikeRate > 0 ? b.strikeRate.toFixed(1) : '\u2014',
                    fiftyHundred: '\u2014',
                    foursSixes: `${b.fours}/${b.sixes}`,
                  })
                })

                type BowlRow = { label: string; isCareer: boolean; isMostRecent: boolean; mat: number; wkts: number; avg: string; econ: string; sr: string; fourFive: string }
                const bowlRows: BowlRow[] = []
                if (cs?.bowling && cs.bowling.wickets > 0) {
                  const bw = cs.bowling
                  const balls = Math.floor(bw.overs) * 6 + Math.round((bw.overs % 1) * 10)
                  const bowlSR = bw.wickets > 0 ? (balls / bw.wickets).toFixed(1) : '\u2014'
                  bowlRows.push({
                    label: 'T20', isCareer: true, isMostRecent: false,
                    mat: bw.matches, wkts: bw.wickets,
                    avg: bw.average > 0 ? bw.average.toFixed(1) : '\u2014',
                    econ: bw.economyRate > 0 ? bw.economyRate.toFixed(1) : '\u2014',
                    sr: bowlSR,
                    fourFive: `${bw.fourWickets}/${bw.fiveWickets}`,
                  })
                }
                const sortedBowlSeasons = [...apiSeasons].filter(s => s.bowling && s.bowling.wickets > 0).sort((a, b) => b.seasonId - a.seasonId)
                sortedBowlSeasons.forEach((s, idx) => {
                  const bw = s.bowling!
                  const balls = Math.floor(bw.overs) * 6 + Math.round((bw.overs % 1) * 10)
                  const bowlSR = bw.wickets > 0 ? (balls / bw.wickets).toFixed(1) : '\u2014'
                  bowlRows.push({
                    label: s.seasonName.replace('IPL ', ''), isCareer: false, isMostRecent: idx === 0,
                    mat: bw.matches, wkts: bw.wickets,
                    avg: bw.average > 0 ? bw.average.toFixed(1) : '\u2014',
                    econ: bw.economyRate > 0 ? bw.economyRate.toFixed(1) : '\u2014',
                    sr: bowlSR,
                    fourFive: '\u2014',
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
                              <Fragment key={i}>
                                {i === 1 && batRows[0]?.isCareer && (
                                  <tr>
                                    <td colSpan={7} style={{ padding: '8px 4px 4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 9, fontWeight: 800, color: '#004BA0', textTransform: 'uppercase', letterSpacing: 1 }}>IPL</span>
                                        <div style={{ flex: 1, height: 1, background: 'rgba(0,75,160,0.15)' }} />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                <tr style={{
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
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

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
                              <Fragment key={i}>
                                {i === 1 && bowlRows[0]?.isCareer && (
                                  <tr>
                                    <td colSpan={7} style={{ padding: '8px 4px 4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 9, fontWeight: 800, color: '#004BA0', textTransform: 'uppercase', letterSpacing: 1 }}>IPL</span>
                                        <div style={{ flex: 1, height: 1, background: 'rgba(0,75,160,0.15)' }} />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                <tr style={{
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
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )
              })()}
              </>
              )}
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
