'use client'

import { useSession } from 'next-auth/react'
import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  rankChange: number
  liveGwPoints: number | null
  chipActive: string | null
  storedTotalPoints: number
}

interface GwPlayerScore {
  id: string
  totalPoints: number
  player: {
    id: string
    fullname: string
    role: string
    iplTeamCode: string | null
  }
}

interface LivePlayerScore {
  id: string
  name: string
  role: string
  iplTeamCode: string | null
  slotType: 'XI' | 'BENCH'
  basePoints: number
  chipBonus: number
  isCaptain: boolean
  isVC: boolean
  multipliedPoints: number
  matchesPlayed: number
}

interface LiveScoreResponse {
  gameweekId: string
  gameweekNumber: number
  status: 'LIVE' | 'FINAL'
  matchesScored: number
  matchesTotal: number
  totalPoints: number
  chipActive: string | null
  chipBonusPoints: number
  players: LivePlayerScore[]
}

interface LeaderboardResponse {
  standings: Standing[]
  leagueId: string
  gwStatus: 'LIVE' | 'FINAL'
  activeGwNumber: number | null
  matchesScored: number | null
  matchesTotal: number | null
}

/* ─── Team gradients (for pitch view figures) ─── */
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
const IconShield = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
  const date = d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
  return {
    label: 'Deadline',
    time: `${date}, ${time}`,
  }
}

function formatMatchTime(startingAt: string): { display: string; day: string } {
  const d = new Date(startingAt)
  const dayName = d.toLocaleDateString('en', { weekday: 'short' })
  const date = d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
  return {
    display: `${date} \u00B7 ${time}`,
    day: dayName.toUpperCase(),
  }
}

/* ─── League icon gradient colors ─── */
const leagueGradients = [
  'linear-gradient(135deg, #004BA0, #0066cc)',
  'linear-gradient(135deg, #0EB1A2, #089e90)',
  'linear-gradient(135deg, #EA1A85, #c4166e)',
  'linear-gradient(135deg, #3A225D, #5a3d8a)',
  'linear-gradient(135deg, #FF822A, #e06a10)',
]

function getLeagueInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/* ─── Role icon helpers ─── */
const roleIconStyles: Record<string, React.CSSProperties> = {
  BAT: { background: 'linear-gradient(135deg, #F9CD05, #e0b800)', color: '#1a1a1a' },
  BOWL: { background: 'linear-gradient(135deg, #004BA0, #0066cc)', color: '#fff' },
  ALL: { background: 'linear-gradient(135deg, #0EB1A2, #089e90)', color: '#fff' },
  WK: { background: 'linear-gradient(135deg, #EA1A85, #c4166e)', color: '#fff' },
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = { BAT: 'BAT', BOWL: 'BWL', ALL: 'ALL', WK: 'WK', BATSMAN: 'BAT', BOWLER: 'BWL', 'ALL-ROUNDER': 'ALL', 'WICKET-KEEPER': 'WK' }
  return map[role?.toUpperCase()] || role?.slice(0, 3).toUpperCase() || '?'
}

function getRoleKey(role: string): string {
  const map: Record<string, string> = { BAT: 'BAT', BOWL: 'BOWL', ALL: 'ALL', WK: 'WK', BATSMAN: 'BAT', BOWLER: 'BOWL', 'ALL-ROUNDER': 'ALL', 'WICKET-KEEPER': 'WK' }
  return map[role?.toUpperCase()] || 'BAT'
}

function getChipName(chipCode: string | null): string {
  if (!chipCode) return ''
  const map: Record<string, string> = {
    'POWER_PLAY_BAT': 'Power Play Bat',
    'BOWLING_BOOST': 'Bowling Boost',
    // NOTE: New chips should be added to this map as they are introduced
  }
  return map[chipCode] || chipCode
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const pathname = usePathname()

  const [league, setLeague] = useState<League | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const [showAllStandings, setShowAllStandings] = useState(false)
  const [currentGw, setCurrentGw] = useState<CurrentGameweek | null>(null)
  const [gwNotFound, setGwNotFound] = useState(false)
  const [standings, setStandings] = useState<Standing[]>([])
  const [allLeagues, setAllLeagues] = useState<{ id: string; name: string; teamCount: number }[]>([])
  const [switchingLeague, setSwitchingLeague] = useState(false)
  const activeLeagueId = session?.user?.activeLeagueId

  // Sheet states
  const [leagueSheetOpen, setLeagueSheetOpen] = useState(false)
  const [gwSheetOpen, setGwSheetOpen] = useState(false)
  const [gwSheetView, setGwSheetView] = useState<'list' | 'pitch'>('list')
  const [gwPlayerScores, setGwPlayerScores] = useState<GwPlayerScore[]>([])
  const [gwScoresLoading, setGwScoresLoading] = useState(false)
  const [liveScoreResponse, setLiveScoreResponse] = useState<LiveScoreResponse | null>(null)
  const [liveScoreFetched, setLiveScoreFetched] = useState(false)
  const [gwStatus, setGwStatus] = useState<'LIVE' | 'FINAL'>('FINAL')

  // Live GW state from leaderboard response
  const [activeGwNumber, setActiveGwNumber] = useState<number | null>(null)
  const [matchesScored, setMatchesScored] = useState<number | null>(null)
  const [matchesTotal, setMatchesTotal] = useState<number | null>(null)

  // Join league
  const [joinFormOpen, setJoinFormOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [editGwDeadline, setEditGwDeadline] = useState<{ number: number; lockTime: string | null } | null>(null)
  const joinInputRef = useRef<HTMLInputElement>(null)

  /* ─── Fetch league on mount ─── */
  const fetchLeague = useCallback(async () => {
    try {
      const res = await fetch('/api/leagues')
      if (!res.ok) return
      const leagues: League[] = await res.json()
      setAllLeagues(leagues.map(l => ({ id: l.id, name: l.name, teamCount: l._count?.teams ?? l.teams?.length ?? 0 })))
      if (leagues.length > 0) {
        const targetLeague = leagues.find(l => l.id === activeLeagueId) || leagues[0]
        const detail = await fetch(`/api/leagues/${targetLeague.id}`)
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
  }, [activeLeagueId])

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
      const data: LeaderboardResponse = await res.json()
      setStandings(data.standings || [])
      setGwStatus(data.gwStatus)
      setActiveGwNumber(data.activeGwNumber)
      setMatchesScored(data.matchesScored)
      setMatchesTotal(data.matchesTotal)
    } catch {
      // silent
    }
  }, [])

  /* ─── Eager fetch live score on page load ─── */
  const eagerFetchLiveScore = useCallback(async () => {
    if (!league || !currentGw) return

    // Find user's team in this league
    const userId = session?.user?.id
    const myTeam = league.teams?.find(t => t.userId === userId)
    if (!myTeam) return

    try {
      const res = await fetch(`/api/teams/${myTeam.id}/scores/${currentGw.id}`)
      if (res.ok) {
        const data: LiveScoreResponse = await res.json()
        setLiveScoreResponse(data)
      } else if (res.status === 404) {
        // No lineup submitted — leave liveScoreResponse as null
      }
    } catch {
      // silent
    } finally {
      // Mark that we've attempted the fetch (success or 404)
      setLiveScoreFetched(true)
    }
  }, [league, currentGw, session?.user?.id])

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

  // Eager fetch live score when gwStatus becomes LIVE
  useEffect(() => {
    if (gwStatus === 'LIVE' && !liveScoreFetched) {
      setLiveScoreFetched(false)
      eagerFetchLiveScore()
    }
  }, [gwStatus, liveScoreFetched, eagerFetchLiveScore])

  // Deadline — find the next unlocked GW's lock time for editing
  useEffect(() => {
    if (!currentGw) return
    const locked = currentGw.lockTime ? new Date() >= new Date(currentGw.lockTime) : false
    if (!locked) {
      setEditGwDeadline({ number: currentGw.number, lockTime: currentGw.lockTime })
    } else {
      fetch('/api/gameweeks').then(res => res.ok ? res.json() : []).then((allGws: { number: number; status: string; lockTime: string | null }[]) => {
        const nextGw = allGws
          .filter(gw => gw.number > currentGw.number && (gw.status === 'UPCOMING' || gw.status === 'ACTIVE'))
          .sort((a, b) => a.number - b.number)[0]
        if (nextGw) {
          setEditGwDeadline({ number: nextGw.number, lockTime: nextGw.lockTime })
        } else {
          setEditGwDeadline({ number: currentGw.number, lockTime: currentGw.lockTime })
        }
      }).catch(() => {
        setEditGwDeadline({ number: currentGw.number, lockTime: currentGw.lockTime })
      })
    }
  }, [currentGw])

  /* ─── GW Score Detail fetch ─── */
  const openGwSheet = useCallback(async () => {
    if (!league || !currentGw) return
    setGwSheetOpen(true)
    setGwSheetView('list')

    // Find user's team in this league
    const userId = session?.user?.id
    const myTeam = league.teams?.find(t => t.userId === userId)
    if (!myTeam) return

    setGwScoresLoading(true)
    try {
      const res = await fetch(`/api/teams/${myTeam.id}/scores/${currentGw.id}`)
      if (res.ok) {
        const data: LiveScoreResponse = await res.json()
        setLiveScoreResponse(data)
        setGwStatus(data.status)
        setGwPlayerScores([]) // Clear legacy playerScores
      }
    } catch {
      // silent
    } finally {
      setGwScoresLoading(false)
    }
  }, [league, currentGw, session?.user?.id])

  /* ─── League switch handler ─── */
  const handleSwitchLeague = useCallback(async (leagueId: string) => {
    if (league?.id === leagueId) return
    setSwitchingLeague(true)
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeLeagueId: leagueId }),
      })
      if (res.ok) {
        window.location.reload()
      }
    } catch {
      // silent
    } finally {
      setSwitchingLeague(false)
    }
  }, [league?.id])

  /* ─── Join league handler ─── */
  const handleJoinLeague = useCallback(async () => {
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinError('')
    try {
      const res = await fetch('/api/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      })
      if (res.ok) {
        window.location.reload()
      } else {
        const data = await res.json()
        setJoinError(data.error || 'Failed to join league')
      }
    } catch {
      setJoinError('Something went wrong')
    } finally {
      setJoinLoading(false)
    }
  }, [joinCode])

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
  const leagueName = league?.name || 'Join a League'
  const seasonStarted = !gwNotFound && currentGw !== null

  // Gameweek label — show the GW that scores are from, not necessarily the "current" GW
  const userId = session.user?.id
  const myStanding = standings.find(s => s.managerId === userId)

  // Determine which GW's scores we're displaying
  const displayGwNumber = gwStatus === 'LIVE' && activeGwNumber
    ? activeGwNumber
    : myStanding?.lastGwNumber ?? currentGw?.number ?? null
  const gwLabel = displayGwNumber ? `Gameweek ${displayGwNumber}` : (seasonStarted ? `Gameweek ${currentGw!.number}` : 'Season not started')

  // GW-level scores from standings (liveGwPoints during LIVE, lastGwPoints during FINAL)
  const getGwPoints = (s: Standing) => gwStatus === 'LIVE' && s.liveGwPoints !== null ? s.liveGwPoints : (s.lastGwPoints ?? 0)
  const yourGwPoints = myStanding ? getGwPoints(myStanding) : 0
  const yourPoints = yourGwPoints
  const avgPoints = standings.length > 0
    ? Math.round(standings.reduce((sum, s) => sum + getGwPoints(s), 0) / standings.length)
    : 0
  const topGwStanding = standings.length > 0
    ? standings.reduce((best, s) => getGwPoints(s) > getGwPoints(best) ? s : best, standings[0])
    : null
  const highestPoints = topGwStanding ? getGwPoints(topGwStanding) : 0
  const hasScores = standings.some(s => getGwPoints(s) > 0 || s.totalPoints > 0)

  // GW score total from live response or legacy playerScores
  const gwScoreTotal = liveScoreResponse?.totalPoints ?? gwPlayerScores.reduce((sum, s) => sum + s.totalPoints, 0)

  const deadline = editGwDeadline
    ? formatDeadline(editGwDeadline.lockTime)
    : { label: 'Deadline', time: 'Season starts soon' }
  const deadlineLabel = editGwDeadline ? `GW${editGwDeadline.number} Deadline` : deadline.label

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

        {/* Header row: league pill + league tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          {/* League Switcher Pill */}
          <button
            onClick={() => setLeagueSheetOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              borderRadius: 20,
              padding: '5px 10px 5px 8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#F9CD05', flexShrink: 0,
            }} />
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#fff',
              maxWidth: 130, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {leagueName}
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.6)', fontSize: 10, flexShrink: 0,
            }}>{'\u25BE'}</div>
          </button>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Dashboard</div>
        </div>

        {/* Gameweek label with LIVE/FINAL badge */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginTop: 6, marginBottom: 2,
        }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.6)',
            fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' as const,
          }}>
            {gwLabel}
          </div>
          {gwStatus === 'LIVE' && (
            <div data-testid="hero-live-badge" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div data-testid="hero-pulsing-dot" style={{
                width: 6, height: 6, borderRadius: '50%', background: '#22C55E',
                animation: 'pulse 2s infinite',
              }} />
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#22C55E',
                background: 'rgba(34,197,94,0.15)', padding: '2px 5px', borderRadius: 4,
              }}>LIVE</div>
            </div>
          )}
          {gwStatus === 'FINAL' && activeGwNumber !== null && (
            <div data-testid="hero-final-badge" style={{
              fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.1)', padding: '2px 5px', borderRadius: 4,
            }}>FINAL</div>
          )}
          {gwStatus === 'LIVE' && matchesScored !== null && matchesTotal !== null && (
            <div data-testid="hero-match-progress" style={{
              fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
            }}>
              {matchesScored}/{matchesTotal} matches
            </div>
          )}
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

          {/* Your Points (center) — tappable to view lineup (PR #20 behavior) */}
          <Link
            data-testid="hero-your-points"
            href={myStanding ? `/view-lineup/${myStanding.teamId}${displayGwNumber ? `?gw=${displayGwNumber}` : ''}` : '#'}
            style={{ flex: 1.3, textAlign: 'center', position: 'relative', cursor: 'pointer', textDecoration: 'none' }}
          >
            {/* Left divider */}
            <div style={{ position: 'absolute', top: '10%', bottom: '20%', left: 0, width: 1, background: 'rgba(255,255,255,0.1)' }} />
            {/* Right divider */}
            <div style={{ position: 'absolute', top: '10%', bottom: '20%', right: 0, width: 1, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {hasScores ? formatNumber(yourPoints) : '\u2014'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginTop: 2 }}>Your Points</div>
          </Link>

          {/* Highest */}
          <Link
            href={topGwStanding ? `/view-lineup/${topGwStanding.teamId}${displayGwNumber ? `?gw=${displayGwNumber}` : ''}` : '#'}
            style={{ flex: 1, textAlign: 'center', textDecoration: 'none', cursor: topGwStanding ? 'pointer' : 'default' }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
              {hasScores ? formatNumber(highestPoints) : '\u2014'}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginTop: 1 }}>Highest</div>
          </Link>
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

      {/* CSS for pulsing animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* CONTENT */}
      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* League Standings Card */}
        <div data-testid="standings-card" style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 16, padding: 14,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          {/* Section header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {gwStatus === 'LIVE' && (
                <>
                  {/* Pulsing green dot */}
                  <div
                    data-testid="standings-pulsing-dot"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#22C55E',
                      animation: 'pulse 2s infinite',
                      flexShrink: 0,
                    }}
                  />
                  {/* Match progress badge */}
                  {matchesScored !== null && matchesTotal !== null && (
                    <div data-testid="standings-match-progress" style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#22C55E',
                      background: 'rgba(34, 197, 94, 0.1)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      flexShrink: 0,
                    }}>
                      {matchesScored}/{matchesTotal}
                    </div>
                  )}
                </>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.2 }}>
                {gwStatus === 'LIVE' ? 'Live Standings' : 'League Standings'}
              </div>
            </div>
            <Link href="/standings" style={{ fontSize: 11, fontWeight: 600, color: '#004BA0', textDecoration: 'none' }}>
              Full Standings &rarr;
            </Link>
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
                <div style={{ width: 16 }}></div>
                <div style={{ flex: 1 }}>Team</div>
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

                // Rank change indicator
                let rankChangeContent = '—'
                let rankChangeColor = '#999'
                if (s.rankChange > 0) {
                  rankChangeContent = `↑${s.rankChange}`
                  rankChangeColor = '#22C55E'
                } else if (s.rankChange < 0) {
                  rankChangeContent = `↓${Math.abs(s.rankChange)}`
                  rankChangeColor = '#EF4444'
                }

                return (
                  <Link href={`/view-lineup/${s.teamId}${displayGwNumber ? `?gw=${displayGwNumber}` : ''}`} key={s.teamId} style={{...rowStyle, textDecoration: 'none'}}>
                    <div style={getRankStyle(s.rank, isYou)}>{s.rank}</div>
                    <div data-testid="rank-change" style={{ fontSize: 10, fontWeight: 600, color: rankChangeColor, width: 16, textAlign: 'center' }}>
                      {rankChangeContent}
                    </div>
                    <div style={{ flex: 1, fontWeight: nameWeight, color: nameColor }}>
                      {s.teamName}{isYou ? ' (You)' : ''}
                    </div>
                    <div data-testid="gw-points" style={{ fontSize: 11, color: '#999', fontWeight: 500, fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>
                      {gwStatus === 'LIVE' && s.liveGwPoints !== null ? s.liveGwPoints : s.lastGwPoints}
                    </div>
                    <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ptsColor, width: 42, textAlign: 'right' }}>{formatNumber(s.totalPoints)}</div>
                  </Link>
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
                Tap a team to view their lineup
              </div>

              {/* Footer for LIVE mode */}
              {gwStatus === 'LIVE' && (
                <div style={{ fontSize: 9, color: '#999', textAlign: 'center', marginTop: 8, fontWeight: 500 }}>
                  Provisional — bench subs not yet applied
                </div>
              )}
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

      {/* ═══ LEAGUE SWITCHER BOTTOM SHEET ═══ */}
      {/* Overlay */}
      <div
        onClick={() => setLeagueSheetOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 60,
          opacity: leagueSheetOpen ? 1 : 0,
          pointerEvents: leagueSheetOpen ? 'all' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%',
        width: '100%', maxWidth: 480,
        background: '#fff',
        borderRadius: '24px 24px 0 0',
        zIndex: 61,
        transform: leagueSheetOpen ? 'translate(-50%, 0)' : 'translate(-50%, 100%)',
        transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
        paddingBottom: 36,
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '12px auto 16px' }} />

        {/* Title */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#aaa',
          textTransform: 'uppercase', letterSpacing: 0.8,
          padding: '0 20px 10px',
        }}>
          YOUR LEAGUES
        </div>

        {/* League rows */}
        {allLeagues.map((l, i) => {
          const isActive = league?.id === l.id
          return (
            <div
              key={l.id}
              onClick={() => !switchingLeague && handleSwitchLeague(l.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 20px',
                cursor: isActive ? 'default' : 'pointer',
                borderTop: i > 0 ? '1px solid #f2f3f8' : 'none',
                opacity: switchingLeague ? 0.6 : 1,
                transition: 'background 0.15s',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
                background: leagueGradients[i % leagueGradients.length],
              }}>
                {getLeagueInitials(l.name)}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: '#1a1a2e',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {l.name}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#999', marginTop: 1 }}>
                  {l.teamCount} team{l.teamCount !== 1 ? 's' : ''}{currentGw ? ` \u00B7 GW ${currentGw.number}` : ''}
                </div>
              </div>
              {/* Check */}
              {isActive ? (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#004BA0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 11, color: '#fff',
                }}>
                  {'\u2713'}
                </div>
              ) : (
                <div style={{ width: 20, flexShrink: 0 }} />
              )}
            </div>
          )
        })}

        {/* Divider */}
        <div style={{ height: 1, background: '#eef0f5', margin: '8px 20px' }} />

        {/* Join a League row */}
        <div
          onClick={() => {
            setJoinFormOpen(!joinFormOpen)
            if (!joinFormOpen) {
              setTimeout(() => joinInputRef.current?.focus(), 100)
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 20px', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: '#f2f3f8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0, color: '#004BA0',
          }}>
            +
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#004BA0' }}>Join a League</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#999', marginTop: 1 }}>Enter an invite code</div>
          </div>
        </div>

        {/* Join form (inline expand) */}
        {joinFormOpen && (
          <div style={{ padding: '0 20px 4px' }}>
            <input
              ref={joinInputRef}
              type="text"
              placeholder="Invite code (e.g. ABC123)"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value); setJoinError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleJoinLeague() }}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: '1.5px solid #e0e2ea', fontSize: 14,
                fontFamily: 'inherit', color: '#1a1a2e',
                background: '#f7f8fb', outline: 'none',
              }}
            />
            {joinError && (
              <div style={{ fontSize: 11, color: '#d63060', marginTop: 4, fontWeight: 500 }}>
                {joinError}
              </div>
            )}
            <button
              onClick={handleJoinLeague}
              disabled={joinLoading || !joinCode.trim()}
              style={{
                width: '100%', marginTop: 8, padding: 12,
                border: 'none', borderRadius: 12,
                background: '#004BA0', color: '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: joinLoading || !joinCode.trim() ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: joinLoading || !joinCode.trim() ? 0.5 : 1,
              }}
            >
              {joinLoading ? 'Joining...' : 'Join League'}
            </button>
          </div>
        )}
      </div>

      {/* ═══ GW SCORE DETAIL BOTTOM SHEET ═══ */}
      {/* Overlay */}
      <div
        onClick={() => setGwSheetOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 50,
          opacity: gwSheetOpen ? 1 : 0,
          pointerEvents: gwSheetOpen ? 'all' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />
      {/* Sheet */}
      <div data-testid="gw-detail-sheet" style={{
        position: 'fixed', bottom: 0, left: '50%',
        width: '100%', maxWidth: 480,
        background: '#fff',
        borderRadius: '24px 24px 0 0',
        zIndex: 51,
        transform: gwSheetOpen ? 'translate(-50%, 0)' : 'translate(-50%, 100%)',
        transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        maxHeight: '88vh',
        overflow: 'hidden',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '10px auto 0' }} />

        {/* Header */}
        <div style={{ padding: '12px 18px 10px', position: 'relative' }}>
          {/* GW label with LIVE/FINAL badge and match progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {currentGw ? `Gameweek ${currentGw.number}` : 'Gameweek'} Breakdown
            </div>
            {liveScoreResponse && (
              <>
                {/* LIVE/FINAL badge */}
                {liveScoreResponse.status === 'LIVE' ? (
                  <>
                    <div data-testid="sheet-live-badge" style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'rgba(13, 158, 95, 0.1)', borderRadius: 6,
                      padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#0d9e5f',
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%', background: '#0d9e5f',
                        animation: 'pulse 2s infinite',
                      }} />
                      LIVE
                    </div>
                    {/* Match progress */}
                    <div style={{
                      fontSize: 9, fontWeight: 600, color: '#999',
                      background: '#f7f8fb', padding: '2px 6px', borderRadius: 6,
                    }}>
                      {liveScoreResponse.matchesScored}/{liveScoreResponse.matchesTotal}
                    </div>
                  </>
                ) : (
                  <div data-testid="sheet-final-badge" style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(150, 150, 150, 0.1)', borderRadius: 6,
                    padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#999',
                  }}>
                    FINAL
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#1a1a2e', letterSpacing: -1.5, lineHeight: 1.1 }}>
            {gwScoresLoading ? '\u2014' : (liveScoreResponse?.totalPoints ?? gwScoreTotal)} <span style={{ fontSize: 14, fontWeight: 500, color: '#999', letterSpacing: 0 }}>pts</span>
          </div>
          {myStanding && (
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0d9e5f', marginTop: 2 }}>
              {myStanding.rank === 1 ? '1st' : myStanding.rank === 2 ? '2nd' : myStanding.rank === 3 ? '3rd' : `${myStanding.rank}th`} in league
            </div>
          )}
          {/* Close button */}
          <button
            onClick={() => setGwSheetOpen(false)}
            style={{
              position: 'absolute', top: 14, right: 16,
              width: 30, height: 30, borderRadius: '50%',
              background: '#f2f3f8', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, color: '#999', fontFamily: 'inherit',
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Toggle pill */}
        <div style={{ display: 'flex', padding: '8px 16px 6px' }}>
          <div style={{ display: 'flex', background: '#f2f3f8', borderRadius: 10, padding: 3, flex: 1 }}>
            <button
              onClick={() => setGwSheetView('list')}
              style={{
                flex: 1, padding: '5px 0', border: 'none', borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: gwSheetView === 'list' ? '#fff' : 'transparent',
                color: gwSheetView === 'list' ? '#1a1a2e' : '#888',
                boxShadow: gwSheetView === 'list' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              List View
            </button>
            <button
              onClick={() => setGwSheetView('pitch')}
              style={{
                flex: 1, padding: '5px 0', border: 'none', borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: gwSheetView === 'pitch' ? '#fff' : 'transparent',
                color: gwSheetView === 'pitch' ? '#1a1a2e' : '#888',
                boxShadow: gwSheetView === 'pitch' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              Pitch View
            </button>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#f0f0f4', margin: '0 18px' }} />

        {/* Scrollable content */}
        <div style={{
          overflowY: 'auto', maxHeight: 'calc(88vh - 160px)', padding: '8px 0 30px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {gwSheetView === 'list' ? (
            <>
              {gwScoresLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999', fontSize: 13 }}>
                  Loading scores...
                </div>
              ) : !liveScoreResponse || liveScoreResponse.players.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999', fontSize: 13 }}>
                  {currentGw ? `No lineup submitted for GW ${currentGw.number}` : 'No player scores available yet'}
                </div>
              ) : (
                <>
                  {/* Active chip badge (AC14.2) */}
                  {liveScoreResponse.chipActive && (
                    <div data-testid="sheet-chip-badge" style={{
                      margin: '8px 18px', padding: '8px 12px', borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(0,75,160,0.08), rgba(14,177,162,0.08))',
                      border: '1px solid rgba(0,75,160,0.15)',
                      fontSize: 11, fontWeight: 700, color: '#004BA0',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span>⚡</span>
                      <span>{getChipName(liveScoreResponse.chipActive)} ACTIVE</span>
                      <span style={{ marginLeft: 'auto', color: '#0d9e5f' }}>+{liveScoreResponse.chipBonusPoints} pts</span>
                    </div>
                  )}

                  {/* XI section */}
                  <div style={{ paddingTop: 8 }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase',
                      letterSpacing: 0.8, padding: '6px 18px',
                    }}>
                      Playing XI
                    </div>
                    {liveScoreResponse.players.filter(p => p.slotType === 'XI').map((player) => {
                      const roleKey = getRoleKey(player.role)
                      const iconStyle = roleIconStyles[roleKey] || roleIconStyles.BAT
                      return (
                        <div key={player.id} style={{
                          display: 'flex', alignItems: 'center', padding: '8px 18px', gap: 8,
                        }}>
                          {/* Role icon */}
                          <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 800, flexShrink: 0,
                            ...iconStyle,
                          }}>
                            {getRoleLabel(player.role)}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 600, color: '#222',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {player.name}
                              </span>
                              {player.isCaptain && <span style={{ fontSize: 10, fontWeight: 700, color: '#004BA0' }}>(C)</span>}
                              {player.isVC && <span style={{ fontSize: 10, fontWeight: 700, color: '#999' }}>(VC)</span>}
                            </div>
                            <div style={{ fontSize: 9.5, color: '#999', fontWeight: 500, marginTop: 1 }}>
                              {player.iplTeamCode || ''}
                            </div>
                            {/* Chip progression (AC14.1) */}
                            {player.chipBonus > 0 && (
                              <div data-testid="chip-progression" style={{ fontSize: 9, color: '#0d9e5f', fontWeight: 600, marginTop: 1 }}>
                                {player.basePoints} → {player.multipliedPoints + player.chipBonus}
                              </div>
                            )}
                          </div>
                          {/* Points */}
                          <div style={{
                            fontSize: 14, fontWeight: 800, color: player.multipliedPoints < 0 ? '#d63060' : '#1a1a2e',
                            width: 36, textAlign: 'right', flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {player.matchesPlayed === 0 ? '\u2014' : player.multipliedPoints}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Bench section */}
                  {liveScoreResponse.players.some(p => p.slotType === 'BENCH') && (
                    <div style={{ paddingTop: 8 }}>
                      <div style={{
                        fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase',
                        letterSpacing: 0.8, padding: '6px 18px',
                      }}>
                        Bench
                      </div>
                      {liveScoreResponse.players.filter(p => p.slotType === 'BENCH').map((player) => {
                        const roleKey = getRoleKey(player.role)
                        const iconStyle = roleIconStyles[roleKey] || roleIconStyles.BAT
                        return (
                          <div key={player.id} style={{
                            display: 'flex', alignItems: 'center', padding: '8px 18px', gap: 8,
                            opacity: 0.6,
                            background: '#f7f8fb',
                          }}>
                            {/* Role icon */}
                            <div style={{
                              width: 28, height: 28, borderRadius: 8,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, flexShrink: 0,
                              ...iconStyle,
                            }}>
                              {getRoleLabel(player.role)}
                            </div>
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 12, fontWeight: 600, color: '#222',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {player.name}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#999' }}>BENCH</span>
                              </div>
                              <div style={{ fontSize: 9.5, color: '#999', fontWeight: 500, marginTop: 1 }}>
                                {player.iplTeamCode || ''}
                              </div>
                            </div>
                            {/* Points */}
                            <div style={{
                              fontSize: 14, fontWeight: 800, color: player.multipliedPoints < 0 ? '#d63060' : '#1a1a2e',
                              width: 36, textAlign: 'right', flexShrink: 0,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {player.matchesPlayed === 0 ? '\u2014' : player.multipliedPoints}
                            </div>
                          </div>
                        )
                      })}
                      {/* Bench footer */}
                      {liveScoreResponse.status === 'LIVE' && (
                        <div style={{
                          fontSize: 9, color: '#999', fontWeight: 500, padding: '8px 18px',
                          textAlign: 'center', background: '#f7f8fb',
                        }}>
                          Bench subs applied at GW end
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary row */}
                  <div style={{
                    margin: '12px 18px', padding: '10px 14px', borderRadius: 12,
                    background: '#f7f8fb', border: '1px solid #eef0f5',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
                        {liveScoreResponse.players.reduce((sum, p) => sum + (p.matchesPlayed > 0 ? p.basePoints : 0), 0)}
                      </div>
                      <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Base Pts</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
                        {liveScoreResponse.players.reduce((sum, p) => sum + (p.isCaptain || p.isVC ? (p.multipliedPoints - p.basePoints) : 0), 0)}
                      </div>
                      <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>C/VC Bonus</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
                        {liveScoreResponse.chipBonusPoints}
                      </div>
                      <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Chip Bonus</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#004BA0' }}>
                        {liveScoreResponse.totalPoints}
                      </div>
                      <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Total</div>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Pitch View — 4-3-4 Formation */
            (() => {
              if (!liveScoreResponse) {
                return (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#999', fontSize: 13 }}>
                    No player scores available yet
                  </div>
                )
              }

              const rolePriority: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 }
              const xiPlayers = liveScoreResponse.players.filter(p => p.slotType === 'XI')
              const benchPlayers = liveScoreResponse.players.filter(p => p.slotType === 'BENCH')
              const sorted = [...xiPlayers].sort((a, b) =>
                (rolePriority[getRoleKey(a.role)] ?? 9) - (rolePriority[getRoleKey(b.role)] ?? 9)
              )
              const xi = sorted.slice(0, 11)
              const bench = benchPlayers
              const rows: { label: string; players: typeof xi }[] = [
                { label: 'Top Order', players: xi.slice(0, 4) },
                { label: 'Middle Order', players: xi.slice(4, 7) },
                { label: 'Lower Order', players: xi.slice(7, 11) },
              ]

              const renderFigure = (player: LivePlayerScore, size: 'normal' | 'bench' = 'normal') => {
                const grad = teamGradients[player.iplTeamCode || ''] || defaultGrad
                const isBench = size === 'bench'
                const headSize = isBench ? 14 : 18
                const bodyW = isBench ? 22 : 28
                const bodyH = isBench ? 12 : 16
                const plateW = isBench ? 32 : 40
                return (
                  <div key={player.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: isBench ? 56 : 68 }}>
                    {/* Head */}
                    <div style={{
                      width: headSize, height: headSize, borderRadius: '50%',
                      background: grad.head, border: '1.5px solid rgba(255,255,255,0.5)',
                    }} />
                    {/* Body */}
                    <div style={{
                      width: bodyW, height: bodyH, borderRadius: '0 0 6px 6px',
                      background: grad.body, marginTop: -2,
                      border: '1.5px solid rgba(255,255,255,0.3)', borderTop: 'none',
                    }} />
                    {/* Points plate */}
                    <div style={{
                      background: grad.plate, borderRadius: 4,
                      padding: '1px 5px', marginTop: 2,
                      minWidth: plateW, textAlign: 'center',
                    }}>
                      <span style={{
                        fontSize: isBench ? 9 : 11, fontWeight: 800, color: '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {player.matchesPlayed === 0 ? '\u2014' : player.multipliedPoints} pts
                      </span>
                    </div>
                    {/* Name */}
                    <div style={{
                      fontSize: isBench ? 7.5 : 8.5, color: 'rgba(255,255,255,0.85)',
                      fontWeight: 600, textAlign: 'center', marginTop: 1,
                      maxWidth: isBench ? 54 : 66, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', lineHeight: 1.2,
                    }}>
                      {player.name.split(' ').pop()}
                    </div>
                  </div>
                )
              }

              return gwScoresLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999', fontSize: 13 }}>
                  Loading scores...
                </div>
              ) : liveScoreResponse.players.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999', fontSize: 13 }}>
                  {currentGw ? `No lineup submitted for GW ${currentGw.number}` : 'No player scores available yet'}
                </div>
              ) : (
                <div style={{
                  background: 'linear-gradient(180deg, #3aad5c 0%, #2b8a45 50%, #267f3e 100%)',
                  borderRadius: 14, minHeight: 280, padding: '14px 6px 10px',
                  position: 'relative', overflow: 'hidden', margin: '0 10px',
                }}>
                  {/* Center circle marking */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 70, height: 70, borderRadius: '50%',
                    border: '1.5px solid rgba(255,255,255,0.15)',
                  }} />
                  {/* Halfway line */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '10%', right: '10%',
                    height: 0, borderTop: '1.5px solid rgba(255,255,255,0.1)',
                  }} />

                  {/* Formation rows */}
                  {rows.map((row) => (
                    <div key={row.label} style={{ marginBottom: 6 }}>
                      <div style={{
                        fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
                        textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.8,
                        marginBottom: 4,
                      }}>
                        {row.label}
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'center', gap: 4,
                      }}>
                        {row.players.map((player) => renderFigure(player))}
                      </div>
                    </div>
                  ))}

                  {/* Bench */}
                  {bench.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(255,255,255,0.2)' }}>
                      <div style={{
                        fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.35)',
                        textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.8,
                        marginBottom: 4,
                      }}>
                        Bench
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                        {bench.map((player) => renderFigure(player, 'bench'))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()
          )}
        </div>
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
        <Link href={myStanding ? `/view-lineup/${myStanding.teamId}` : '/lineup'} style={{ textDecoration: 'none', textAlign: 'center', fontSize: 10, color: '#8e8e93', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontWeight: 500 }}>
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
        {session?.user?.isAppAdmin && (
          <Link href="/app-admin" style={{
            textDecoration: 'none', textAlign: 'center', fontSize: 10, color: pathname === '/app-admin' ? '#004BA0' : '#8e8e93', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontWeight: pathname === '/app-admin' ? 600 : 500
          }}>
            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: pathname === '/app-admin' ? 'rgba(0,75,160,0.08)' : undefined, borderRadius: 7 }}>
              <IconShield />
            </div>
            Admin
          </Link>
        )}
      </nav>
    </div>
    </AppFrame>
  )
}
