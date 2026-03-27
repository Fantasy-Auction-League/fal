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


const benchRoleColors: Record<string, string> = {
  BAT: 'rgba(249,205,5,0.4)',
  BOWL: 'rgba(160,196,255,0.4)',
  WK: 'rgba(0,255,135,0.3)',
  ALL: 'rgba(14,177,162,0.3)',
}

/* ─── List view role gradients ─── */
const listRoleGradients: Record<string, { bg: string; color: string; label: string }> = {
  BAT:  { bg: 'linear-gradient(135deg, #F9CD05, #e0b800)', color: '#1a1a1a', label: 'BA' },
  BOWL: { bg: 'linear-gradient(135deg, #004BA0, #0066cc)', color: '#fff', label: 'BO' },
  ALL:  { bg: 'linear-gradient(135deg, #0EB1A2, #089e90)', color: '#fff', label: 'AR' },
  WK:   { bg: 'linear-gradient(135deg, #EA1A85, #c4166e)', color: '#fff', label: 'WK' },
}

const roleFullName: Record<string, string> = {
  BAT: 'Batsman', BOWL: 'Bowler', ALL: 'All-Rounder', WK: 'Wicket-keeper',
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

interface League {
  id: string
  name: string
  teams: { id: string; name: string; userId: string }[]
}

const teamNameToCode: Record<string, string> = {
  'Mumbai Indians': 'MI', 'Chennai Super Kings': 'CSK', 'Royal Challengers Bengaluru': 'RCB',
  'Kolkata Knight Riders': 'KKR', 'Delhi Capitals': 'DC', 'Rajasthan Royals': 'RR',
  'Sunrisers Hyderabad': 'SRH', 'Gujarat Titans': 'GT', 'Lucknow Super Giants': 'LSG',
  'Punjab Kings': 'PBKS',
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
  <svg viewBox="0 0 36 36" width="18" height="18" fill="none">
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
  <svg viewBox="0 0 36 36" width="18" height="18" fill="none">
    <rect x="16" y="4" width="5" height="22" rx="2.5" fill={color === 'grey' ? '#bbb' : '#fff'} transform="rotate(20 16 4)" />
    <ellipse cx="10" cy="28" rx="5" ry="3.5" fill={color === 'grey' ? '#bbb' : '#fff'} transform="rotate(20 10 28)" />
  </svg>
)

/* ─── View toggle icons ─── */
const PitchViewIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" fill={color} />
    <rect x="8" y="1" width="5" height="5" rx="1" fill={color} />
    <rect x="1" y="8" width="5" height="5" rx="1" fill={color} />
    <rect x="8" y="8" width="5" height="5" rx="1" fill={color} />
  </svg>
)

const ListViewIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="2" width="12" height="2" rx="1" fill={color} />
    <rect x="1" y="6" width="12" height="2" rx="1" fill={color} />
    <rect x="1" y="10" width="12" height="2" rx="1" fill={color} />
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
  const [viewMode, setViewMode] = useState<'pitch' | 'list'>('pitch')
  const [actionSheetPlayer, setActionSheetPlayer] = useState<SquadPlayer | null>(null)
  const [actionSheetIsBench, setActionSheetIsBench] = useState(false)
  const [swapSelection, setSwapSelection] = useState<{ direction: 'toBench' | 'toXI'; sourceId: string } | null>(null)
  const [playerStatsSheet, setPlayerStatsSheet] = useState<SquadPlayer | null>(null)
  const [sheetDetail, setSheetDetail] = useState<SheetPlayerDetail | null>(null)
  const [sheetDetailLoading, setSheetDetailLoading] = useState(false)
  const [sheetSeasonTab, setSheetSeasonTab] = useState<number | null>(null)
  const [sheetView, setSheetView] = useState<'compact' | 'full'>('compact')
  const isLocked = currentGW?.lockTime ? new Date() >= new Date(currentGW.lockTime) : false

  /* ─── Fetch player detail when stats sheet opens ─── */
  useEffect(() => {
    if (!playerStatsSheet) { setSheetDetail(null); setSheetSeasonTab(null); setSheetView('compact'); return }
    let cancelled = false
    setSheetDetailLoading(true)
    setSheetDetail(null)
    setSheetSeasonTab(null)
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
          match: p.match as { localTeamName: string | null; visitorTeamName: string | null; gameweek?: { number: number } | null } | undefined,
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

      // Try to restore a previously saved lineup
      const players = data.players || []
      const playerMap = new Map(players.map(p => [p.id, p]))
      let restored = false

      if (currentGW) {
        try {
          const lineupRes = await fetch(`/api/teams/${teamId}/lineups/${currentGW.id}`)
          if (lineupRes.ok) {
            const lineupData = await lineupRes.json()
            const slots = lineupData.lineup?.slots
            if (Array.isArray(slots) && slots.length > 0) {
              const xiSlots = slots.filter((s: { slotType: string }) => s.slotType === 'XI')
              const benchSlots = slots
                .filter((s: { slotType: string }) => s.slotType === 'BENCH')
                .sort((a: { benchPriority: number | null }, b: { benchPriority: number | null }) =>
                  (a.benchPriority ?? 99) - (b.benchPriority ?? 99)
                )

              const xiPlayers = xiSlots
                .map((s: { playerId: string }) => playerMap.get(s.playerId))
                .filter(Boolean) as SquadPlayer[]
              const benchPlayers = benchSlots
                .map((s: { playerId: string }) => playerMap.get(s.playerId))
                .filter(Boolean) as SquadPlayer[]

              if (xiPlayers.length > 0) {
                setXi(xiPlayers)
                setBench(benchPlayers)

                const capSlot = slots.find((s: { role: string | null }) => s.role === 'CAPTAIN')
                const vcSlot = slots.find((s: { role: string | null }) => s.role === 'VC')
                if (capSlot && playerMap.has(capSlot.playerId)) setCaptainId(capSlot.playerId)
                else if (xiPlayers.length > 0) setCaptainId(xiPlayers[0].id)
                if (vcSlot && playerMap.has(vcSlot.playerId)) setVcId(vcSlot.playerId)
                else if (xiPlayers.length > 1) setVcId(xiPlayers[1].id)

                restored = true
              }
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
    if (isLocked) return
    // If in swap mode, complete the swap
    if (swapMode) {
      const benchPlayer = bench.find(p => p.id === swapMode)
      const xiPlayer = xi.find(p => p.id === playerId)
      if (benchPlayer && xiPlayer) {
        setXi(prev => prev.map(p => p.id === playerId ? benchPlayer : p))
        setBench(prev => prev.map(p => p.id === swapMode ? xiPlayer : p))
        if (captainId === playerId) setCaptainId(benchPlayer.id)
        if (vcId === playerId) setVcId(benchPlayer.id)
        setDirty(true)
      }
      setSwapMode(null)
      return
    }
    // Open player stats sheet (same as list view)
    const player = xi.find(p => p.id === playerId)
    if (player) setPlayerStatsSheet(player)
  }

  const handleBenchTap = (playerId: string) => {
    if (isLocked) return
    // If in swap mode, toggle off
    if (swapMode === playerId) {
      setSwapMode(null)
      return
    }
    // If swap mode active and tapping a different bench player, swap bench positions
    if (swapMode) {
      const srcIdx = bench.findIndex(p => p.id === swapMode)
      const tgtIdx = bench.findIndex(p => p.id === playerId)
      if (srcIdx !== -1 && tgtIdx !== -1) {
        const newBench = [...bench]
        ;[newBench[srcIdx], newBench[tgtIdx]] = [newBench[tgtIdx], newBench[srcIdx]]
        setBench(newBench)
        setDirty(true)
      }
      setSwapMode(null)
      return
    }
    // Open player stats sheet for bench player
    const player = bench.find(p => p.id === playerId)
    if (player) setPlayerStatsSheet(player)
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

  /* ─── List view handlers ─── */
  const openActionSheet = (player: SquadPlayer, isBench: boolean) => {
    if (isLocked) return
    setActionSheetPlayer(player)
    setActionSheetIsBench(isBench)
  }

  const closeActionSheet = () => {
    setActionSheetPlayer(null)
  }

  const handleMakeCaptain = (playerId: string) => {
    if (isLocked) return
    if (captainId === playerId) return
    if (vcId === playerId) {
      setVcId(captainId)
    }
    setCaptainId(playerId)
    setDirty(true)
    closeActionSheet()
  }

  const handleMakeVC = (playerId: string) => {
    if (isLocked) return
    if (vcId === playerId) return
    if (captainId === playerId) {
      setCaptainId(vcId)
    }
    setVcId(playerId)
    setDirty(true)
    closeActionSheet()
  }

  const handleMoveToBench = (playerId: string) => {
    if (isLocked) return
    const xiPlayer = xi.find(p => p.id === playerId)
    if (!xiPlayer || bench.length === 0) return
    setSwapSelection({ direction: 'toBench', sourceId: playerId })
    closeActionSheet()
  }

  const handleMoveToXI = (playerId: string) => {
    if (isLocked) return
    const benchPlayer = bench.find(p => p.id === playerId)
    if (!benchPlayer || xi.length === 0) return
    setSwapSelection({ direction: 'toXI', sourceId: playerId })
    closeActionSheet()
  }

  const performSwap = (sourceId: string, targetId: string) => {
    if (!swapSelection) return
    const sourceInXi = xi.some(p => p.id === sourceId)
    const targetInXi = xi.some(p => p.id === targetId)
    const sourceInBench = bench.some(p => p.id === sourceId)
    const targetInBench = bench.some(p => p.id === targetId)

    if (sourceInXi && targetInBench) {
      // XI player swapping with bench player
      const xiPlayer = xi.find(p => p.id === sourceId)!
      const benchPlayer = bench.find(p => p.id === targetId)!
      setXi(prev => prev.map(p => p.id === sourceId ? benchPlayer : p))
      setBench(prev => prev.map(p => p.id === targetId ? xiPlayer : p))
      if (captainId === sourceId) setCaptainId(benchPlayer.id)
      if (vcId === sourceId) setVcId(benchPlayer.id)
    } else if (sourceInBench && targetInXi) {
      // Bench player swapping with XI player
      const benchPlayer = bench.find(p => p.id === sourceId)!
      const xiPlayer = xi.find(p => p.id === targetId)!
      setXi(prev => prev.map(p => p.id === targetId ? benchPlayer : p))
      setBench(prev => prev.map(p => p.id === sourceId ? xiPlayer : p))
      if (captainId === targetId) setCaptainId(benchPlayer.id)
      if (vcId === targetId) setVcId(benchPlayer.id)
    } else if (sourceInBench && targetInBench) {
      // Bench-to-bench reorder
      const srcIdx = bench.findIndex(p => p.id === sourceId)
      const tgtIdx = bench.findIndex(p => p.id === targetId)
      if (srcIdx !== -1 && tgtIdx !== -1) {
        const newBench = [...bench]
        ;[newBench[srcIdx], newBench[tgtIdx]] = [newBench[tgtIdx], newBench[srcIdx]]
        setBench(newBench)
      }
    }
    setDirty(true)
    setSwapSelection(null)
  }

  /* ─── Arrange XI into fixed 4-3-4 formation, sorted by role priority ─── */
  const rolePri: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 }
  const sortedXi = [...xi].sort((a, b) => (rolePri[normalizeRole(a.role)] ?? 1) - (rolePri[normalizeRole(b.role)] ?? 1))
  const row1 = sortedXi.slice(0, 4)     // Top order (4)
  const row2 = sortedXi.slice(4, 7)     // Middle order (3)
  const row3 = sortedXi.slice(7, 11)    // Lower order (4)

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

  /* ─── Chip rendering helpers ─── */
  const renderChipRow = (chipType: 'BOWLING_BOOST' | 'POWER_PLAY_BAT') => {
    const isBB = chipType === 'BOWLING_BOOST'
    const usedGW = usedChips[chipType]
    const isActive = activeChip === chipType
    const isUnavailable = !!usedGW || (!!activeChip && activeChip !== chipType)
    const isDisabled = isUnavailable || isLocked
    const chipLabel = isBB ? 'Bowling Boost' : 'Power Play Bat'
    const ChipIcon = isBB ? BowlingBoostIcon : PowerPlayBatIcon

    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'row',
        alignItems: 'center',
        padding: '6px 10px', gap: 8,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isUnavailable && !isActive ? '#e8e8ee' : 'linear-gradient(135deg, #0d9e5f, #07c472)',
        }}>
          <ChipIcon color={isUnavailable && !isActive ? 'grey' : 'white'} />
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700, flex: 1,
          color: isUnavailable && !isActive ? '#bbb' : '#1a1a2e',
        }}>
          {chipLabel}
        </div>
        {usedGW ? (
          <div style={{
            fontSize: 10, fontWeight: 700,
            background: '#f0f0f5', color: '#999', padding: '3px 8px',
            borderRadius: 7, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            Used GW {usedGW}
          </div>
        ) : isActive ? (
          <button
            onClick={() => handleChipToggle(chipType)}
            style={{
              padding: '4px 10px', borderRadius: 8,
              border: '1.5px solid rgba(13,158,95,0.3)',
              cursor: 'pointer',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              background: 'rgba(13,158,95,0.12)', color: '#0d9e5f',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Active
          </button>
        ) : (
          <button
            onClick={() => { if (!isDisabled) handleChipToggle(chipType) }}
            style={{
              padding: '4px 10px', borderRadius: 8, border: 'none',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              background: '#0d9e5f', color: '#fff',
              whiteSpace: 'nowrap', flexShrink: 0,
              opacity: isDisabled ? 0.4 : 1,
            }}
          >
            Play
          </button>
        )}
      </div>
    )
  }

  /* ─── Get captain/VC names for summary ─── */
  const allPlayers = [...xi, ...bench]
  const captainName = allPlayers.find(p => p.id === captainId)?.fullname
  const vcName = allPlayers.find(p => p.id === vcId)?.fullname

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
      </div>

      {/* ── Compact Chip Bar ── */}
      <div style={{
        background: '#fff',
        display: 'flex', flexDirection: 'row',
        borderBottom: '1px solid #efefF3',
        flexShrink: 0,
      }}>
        <div style={{ borderRight: '1px solid #efefF3', flex: 1, display: 'flex' }}>
          {renderChipRow('BOWLING_BOOST')}
        </div>
        <div style={{ flex: 1, display: 'flex' }}>
          {renderChipRow('POWER_PLAY_BAT')}
        </div>
      </div>

      {/* ── View Toggle ── */}
      <div style={{
        background: '#fff', padding: '6px 16px 8px',
        display: 'flex', flexShrink: 0,
        borderBottom: '1px solid #efefF3',
      }}>
        <div style={{
          display: 'flex', background: '#f2f3f8', borderRadius: 10, padding: 3, flex: 1,
        }}>
          <button
            onClick={() => setViewMode('pitch')}
            style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: viewMode === 'pitch' ? '#fff' : 'transparent',
              color: viewMode === 'pitch' ? '#1a1a2e' : '#888',
              boxShadow: viewMode === 'pitch' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <PitchViewIcon color={viewMode === 'pitch' ? '#1a1a2e' : '#888'} />
            Pitch View
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: viewMode === 'list' ? '#fff' : 'transparent',
              color: viewMode === 'list' ? '#1a1a2e' : '#888',
              boxShadow: viewMode === 'list' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <ListViewIcon color={viewMode === 'list' ? '#1a1a2e' : '#888'} />
            List View
          </button>
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
                    <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                      style={{
                        width: 86, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        opacity: swapMode ? 0.7 : 1,
                        transition: 'opacity 0.2s',
                      }}>
                      <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                    </div>
                  ))}
                </div>

                {/* Row 2: Middle order */}
                <div style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
                  textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
                  textAlign: 'center', marginBottom: -2,
                }}>Middle Order</div>
                <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
                  {row2.map(p => (
                    <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                      style={{
                        width: 86, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        opacity: swapMode ? 0.7 : 1,
                        transition: 'opacity 0.2s',
                      }}>
                      <PlayerFigure player={p} isCaptain={captainId === p.id} isVC={vcId === p.id} />
                    </div>
                  ))}
                </div>

                {/* Row 3: Lower order */}
                <div style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
                  textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)',
                  textAlign: 'center', marginBottom: -2,
                }}>Lower Order</div>
                <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%' }}>
                  {row3.map(p => (
                    <div key={p.id} onClick={() => handlePlayerTap(p.id)}
                      style={{
                        width: 86, cursor: 'pointer',
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

          {/* ── Save Area (Pitch View) ── */}
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
        </>
      )}

      {/* ── List View ── */}
      {viewMode === 'list' && (
        <div style={{
          flex: 1, overflowY: 'auto', background: '#f2f3f8',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Playing XI Section */}
          <div style={{
            fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
            letterSpacing: 0.8, padding: '10px 16px 4px',
          }}>
            Playing XI &mdash; {xi.length} Selected
          </div>
          {sortedXi.map(p => {
            const role = normalizeRole(p.role)
            const roleStyle = listRoleGradients[role] || listRoleGradients.BAT
            const isCap = captainId === p.id
            const isVC = vcId === p.id
            return (
              <div
                key={p.id}
                onClick={() => openActionSheet(p, false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', background: '#fff',
                  borderBottom: '1px solid #f2f3f8', cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
              >
                {/* Role icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: roleStyle.bg, color: roleStyle.color,
                }}>
                  {role === 'BOWL' ? 'B' : role === 'BAT' ? 'B' : role === 'ALL' ? 'A' : 'W'}
                </div>
                {/* Info — tappable for player stats sheet */}
                <div
                  onClick={(e) => { e.stopPropagation(); setPlayerStatsSheet(p) }}
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: '#1a1a2e',
                    display: 'flex', alignItems: 'center', gap: 5,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {p.fullname}
                    {isCap && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, padding: '1.5px 5px', borderRadius: 4,
                        background: '#F9CD05', color: '#1a1a1a', flexShrink: 0, lineHeight: '1.4',
                      }}>C</span>
                    )}
                    {isVC && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, padding: '1.5px 5px', borderRadius: 4,
                        background: '#C0C7D0', color: '#1a1a1a', flexShrink: 0, lineHeight: '1.4',
                      }}>VC</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
                    {p.iplTeamCode || 'IPL'} &middot; {role}
                  </div>
                </div>
                {/* Action buttons */}
                {!isLocked && (
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMakeCaptain(p.id) }}
                      style={{
                        padding: '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        transition: 'all 0.15s',
                        ...(isCap ? {
                          background: '#F9CD05', color: '#1a1a1a', border: '1.5px solid #F9CD05',
                        } : {
                          border: '1.5px solid rgba(249,205,5,0.5)', color: '#b58800',
                          background: 'rgba(249,205,5,0.08)',
                        }),
                      }}
                    >C</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMakeVC(p.id) }}
                      style={{
                        padding: '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        transition: 'all 0.15s',
                        ...(isVC ? {
                          background: '#C0C7D0', color: '#1a1a1a', border: '1.5px solid #C0C7D0',
                        } : {
                          border: '1.5px solid rgba(192,199,208,0.6)', color: '#666',
                          background: 'rgba(192,199,208,0.1)',
                        }),
                      }}
                    >VC</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveToBench(p.id) }}
                      style={{
                        padding: '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        transition: 'all 0.15s',
                        border: '1.5px solid rgba(0,0,0,0.08)', color: '#888', background: '#f2f3f8',
                      }}
                    >&rarr; Bench</button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Bench Section */}
          {bench.length > 0 && (
            <>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
                letterSpacing: 0.8, padding: '10px 16px 4px',
              }}>
                Bench &mdash; Auto-Sub Order
              </div>
              {bench.map((p, idx) => {
                const role = normalizeRole(p.role)
                const roleStyle = listRoleGradients[role] || listRoleGradients.BAT
                return (
                  <div
                    key={p.id}
                    onClick={() => openActionSheet(p, true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', background: '#fafbfd',
                      borderBottom: '1px solid #f2f3f8', cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                  >
                    {/* Priority badge */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: '#e8eaf0', color: '#888',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800,
                    }}>
                      {idx + 1}
                    </div>
                    {/* Role icon */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                      background: roleStyle.bg, color: roleStyle.color,
                    }}>
                      {role === 'BOWL' ? 'B' : role === 'BAT' ? 'B' : role === 'ALL' ? 'A' : 'W'}
                    </div>
                    {/* Info — tappable for player stats sheet */}
                    <div
                      onClick={(e) => { e.stopPropagation(); setPlayerStatsSheet(p) }}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    >
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: '#1a1a2e',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {p.fullname}
                      </div>
                      <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
                        {p.iplTeamCode || 'IPL'} &middot; {role}
                      </div>
                    </div>
                    {/* Move to XI button */}
                    {!isLocked && (
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveToXI(p.id) }}
                          style={{
                            padding: '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                            transition: 'all 0.15s',
                            border: '1.5px solid rgba(13,158,95,0.3)', color: '#0d9e5f',
                            background: 'rgba(13,158,95,0.06)',
                          }}
                        >&rarr; XI</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Summary bar */}
          <div style={{
            margin: '10px 16px 16px', padding: '12px 16px', borderRadius: 14,
            background: '#fff', border: '1px solid #eef0f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#333' }}>{xi.length}/11</div>
              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Playing XI</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#333' }}>{bench.length}/4</div>
              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Bench</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#b58800' }}>
                {captainName ? getShortName(captainName) : '-'}
              </div>
              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Captain</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>
                {vcName ? getShortName(vcName) : '-'}
              </div>
              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, marginTop: 1 }}>Vice Captain</div>
            </div>
          </div>

          {/* Save button (list view) */}
          {(dirty || saveMessage) && !isLocked && (
            <div style={{ padding: '0 16px 16px', flexShrink: 0, background: '#f2f3f8' }}>
              {dirty && (
                <button
                  onClick={saveLineup}
                  disabled={saving}
                  style={{
                    display: 'block', width: '100%', padding: 13, border: 'none', borderRadius: 14,
                    background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
                    color: '#fff', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', letterSpacing: -0.3, textAlign: 'center',
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

      {/* ── Action Sheet (List View) ── */}
      {actionSheetPlayer && (() => {
        const p = actionSheetPlayer
        const role = normalizeRole(p.role)
        const roleStyle = listRoleGradients[role] || listRoleGradients.BAT
        const isBenchPlayer = actionSheetIsBench
        const isCap = captainId === p.id
        const isVCPlayer = vcId === p.id
        return (
          <>
            <div
              onClick={closeActionSheet}
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
              background: '#fff', borderRadius: '20px 20px 0 0',
              zIndex: 210, paddingBottom: 36,
            }}>
              {/* Close */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
                <button
                  onClick={closeActionSheet}
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
              {/* Player info */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px 12px',
                borderBottom: '1px solid #f2f3f8',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: roleStyle.bg, color: roleStyle.color,
                }}>
                  {role}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{p.fullname}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{p.iplTeamCode || 'IPL'}</div>
                </div>
              </div>
              {/* Actions */}
              {!isBenchPlayer && (
                <>
                  <button
                    onClick={() => handleMakeCaptain(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#1a1a2e',
                      cursor: 'pointer', border: 'none', background: 'transparent',
                      width: '100%', fontFamily: 'inherit', borderTop: 'none',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, background: 'rgba(249,205,5,0.12)',
                    }}>
                      {'\uD83C\uDFC6'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{isCap ? 'Captain (current)' : 'Make Captain'}</div>
                      <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>Earns 2&times; points this GW</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleMakeVC(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#1a1a2e',
                      cursor: 'pointer', border: 'none', background: 'transparent',
                      width: '100%', fontFamily: 'inherit',
                      borderTop: '1px solid #f2f3f8',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, background: 'rgba(192,199,208,0.15)',
                    }}>
                      {'\u2B50'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{isVCPlayer ? 'Vice Captain (current)' : 'Make Vice Captain'}</div>
                      <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>2&times; only if Captain doesn&apos;t play</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleMoveToBench(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#1a1a2e',
                      cursor: 'pointer', border: 'none', background: 'transparent',
                      width: '100%', fontFamily: 'inherit',
                      borderTop: '1px solid #f2f3f8',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, background: '#f2f3f8',
                    }}>
                      {'\uD83D\uDD04'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>Move to Bench</div>
                      <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>Swap with a bench player</div>
                    </div>
                  </button>
                </>
              )}
              {isBenchPlayer && (
                <>
                  <button
                    onClick={() => handleMoveToXI(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#1a1a2e',
                      cursor: 'pointer', border: 'none', background: 'transparent',
                      width: '100%', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, background: 'rgba(13,158,95,0.08)',
                    }}>
                      {'\u2705'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>Move to Playing XI</div>
                      <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>Swap with an XI player</div>
                    </div>
                  </button>
                </>
              )}
            </div>
          </>
        )
      })()}

      {/* ── Swap Selection Bottom Sheet ── */}
      {swapSelection && (() => {
        const sourcePlayer = [...xi, ...bench].find(p => p.id === swapSelection.sourceId)
        const sourceIsXi = xi.some(p => p.id === swapSelection.sourceId)
        const sourceIsBench = bench.some(p => p.id === swapSelection.sourceId)
        // XI player: can only swap with bench. Bench player: can swap with any (XI or other bench).
        const xiCandidates = sourceIsXi ? [] : xi
        const benchCandidates = bench.filter(p => p.id !== swapSelection.sourceId)
        return (
          <>
            <div
              onClick={() => setSwapSelection(null)}
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
              background: '#fff', borderRadius: '20px 20px 0 0',
              zIndex: 210, paddingBottom: 36,
              maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            }}>
              {/* Close */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
                <button
                  onClick={() => setSwapSelection(null)}
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
              {/* Header with source player */}
              <div style={{
                padding: '4px 20px 12px',
                borderBottom: '1px solid #f2f3f8',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>
                  Substitute {sourcePlayer?.fullname || 'Player'}
                </div>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginTop: 2 }}>
                  {sourceIsXi ? 'Select a bench player to swap into XI' : 'Select any player to swap with'}
                </div>
              </div>
              {/* Scrollable list with sections */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {/* Playing XI section */}
                {xiCandidates.length > 0 && (
                  <>
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
                      letterSpacing: 0.8, padding: '10px 20px 4px',
                      background: '#f8f9fc',
                    }}>
                      Playing XI
                    </div>
                    {xiCandidates.map((p) => {
                      const role = normalizeRole(p.role)
                      const roleStyle = listRoleGradients[role] || listRoleGradients.BAT
                      const isCap = captainId === p.id
                      const isVCPlayer = vcId === p.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => performSwap(swapSelection.sourceId, p.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '12px 20px', fontSize: 14, fontWeight: 600, color: '#1a1a2e',
                            cursor: 'pointer', border: 'none', background: '#fff',
                            width: '100%', fontFamily: 'inherit',
                            borderTop: '1px solid #f2f3f8',
                            transition: 'background 0.12s',
                          }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800,
                            background: roleStyle.bg, color: roleStyle.color,
                          }}>
                            {role}
                          </div>
                          <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {p.fullname}
                              {isCap && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#F9CD05', color: '#1a1a1a', flexShrink: 0 }}>C</span>}
                              {isVCPlayer && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#C0C7D0', color: '#1a1a1a', flexShrink: 0 }}>VC</span>}
                            </div>
                            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
                              {p.iplTeamCode || 'IPL'} &middot; {role}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 10, fontWeight: 600, color: '#0d9e5f',
                            flexShrink: 0,
                          }}>
                            Swap
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
                {/* Bench section */}
                {benchCandidates.length > 0 && (
                  <>
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
                      letterSpacing: 0.8, padding: '10px 20px 4px',
                      background: '#f8f9fc',
                    }}>
                      Bench {sourceIsBench ? '(reorder)' : ''}
                    </div>
                    {benchCandidates.map((p, idx) => {
                      const role = normalizeRole(p.role)
                      const roleStyle = listRoleGradients[role] || listRoleGradients.BAT
                      return (
                        <button
                          key={p.id}
                          onClick={() => performSwap(swapSelection.sourceId, p.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '12px 20px', fontSize: 14, fontWeight: 600, color: '#1a1a2e',
                            cursor: 'pointer', border: 'none',
                            background: sourceIsXi ? '#fff' : '#fafbfd',
                            width: '100%', fontFamily: 'inherit',
                            borderTop: '1px solid #f2f3f8',
                            transition: 'background 0.12s',
                          }}
                        >
                          {/* Priority badge for bench */}
                          <div style={{
                            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                            background: '#e8eaf0', color: '#888',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 800,
                          }}>
                            {idx + 1}
                          </div>
                          <div style={{
                            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800,
                            background: roleStyle.bg, color: roleStyle.color,
                          }}>
                            {role}
                          </div>
                          <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.fullname}</div>
                            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, marginTop: 1 }}>
                              {p.iplTeamCode || 'IPL'} &middot; {role}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 10, fontWeight: 600,
                            color: sourceIsBench ? '#888' : '#0d9e5f',
                            flexShrink: 0,
                          }}>
                            {sourceIsBench ? 'Reorder' : 'Swap'}
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Player Stats Sheet (C/VC selection) ── */}
      {playerStatsSheet && (() => {
        const p = playerStatsSheet
        const role = normalizeRole(p.role)
        const roleStyle = listRoleGradients[role] || listRoleGradients.BAT
        const isBenchPlayer = bench.some(b => b.id === p.id)
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

              {/* Player header — matches Players page modal */}
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
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{p.fullname}</div>
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
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )}

              {/* ── Key Info Row ── */}
              {!sheetDetailLoading && (() => {
                const ptsPerMatch = sheetDetail && sheetDetail.matches > 0
                  ? (sheetDetail.totalPoints / sheetDetail.matches).toFixed(1)
                  : '—'
                const lastPerfs = sheetDetail ? sheetDetail.performances.slice(-3).reverse() : []
                const formChipColor = (pts: number) => pts > 30 ? '#fff' : pts >= 15 ? '#fff' : '#fff'
                const formChipBg = (pts: number) => pts > 30 ? '#0d9e5f' : pts >= 15 ? '#f59e0b' : '#ef4444'

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
                        {'\u20B9'}{p.purchasePrice}
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

              {/* ── Fixtures Row ── */}
              {!sheetDetailLoading && sheetDetail && (() => {
                const playerTeam = p.iplTeamName
                const fmtDate = (iso: string) => {
                  const d = new Date(iso)
                  const day = d.getDate()
                  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
                  return `${day} ${mon}`
                }
                // Build played fixtures from performances (most recent first → reverse to chronological)
                const played = [...sheetDetail.performances].reverse().map(perf => {
                  const m = perf.match
                  if (!m) return null
                  const opponentName = m.localTeamName === playerTeam ? m.visitorTeamName : m.localTeamName
                  const date = m.startingAt ? fmtDate(m.startingAt) : ''
                  return { team: teamNameToCode[opponentName ?? ''] || opponentName?.slice(0, 3).toUpperCase() || '?', points: perf.fantasyPoints as number | null, date }
                }).filter(Boolean) as { team: string; points: number | null; date: string }[]

                // Build upcoming fixtures
                const upcoming = (sheetDetail.upcomingFixtures || []).map(f => ({
                  team: teamNameToCode[f.opponent] || f.opponent.slice(0, 3).toUpperCase(),
                  points: null as number | null,
                  date: fmtDate(f.startingAt),
                }))

                // Combine: 3 past + 3 future, except at season edges
                const totalSlots = 6
                let pastCount = Math.min(played.length, 3)
                let futureCount = Math.min(upcoming.length, 3)
                // Fill remaining slots from whichever side has more
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
                            borderRadius: 8,
                            background: '#f7f8fb',
                            border: '1px solid #eef0f5',
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

              <div style={{ borderTop: '1px solid #f2f3f8' }} />

              {/* ── Actions Section ── */}
              {/* C/VC checkboxes — inline row */}
              {isBenchPlayer ? (
                <div style={{
                  padding: '12px 20px', textAlign: 'center',
                  color: '#888', fontSize: 13, fontWeight: 500, lineHeight: 1.5,
                }}>
                  Move to Playing XI to assign Captain/VC
                </div>
              ) : (
                <div style={{
                  display: 'flex', gap: 16, padding: '12px 20px',
                  borderBottom: '1px solid #f2f3f8',
                }}>
                  <button
                    onClick={() => {
                      if (isLocked) return
                      if (captainId === p.id) return
                      if (vcId === p.id) setVcId(captainId)
                      setCaptainId(p.id)
                      setDirty(true)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: 0, border: 'none', background: 'transparent',
                      cursor: isLocked ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      border: isCap ? 'none' : '2px solid #d0d2da',
                      background: isCap ? '#F9CD05' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: isCap ? '#1a1a1a' : 'transparent',
                      transition: 'all 0.15s',
                    }}>&#10003;</div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>Captain</span>
                  </button>
                  <button
                    onClick={() => {
                      if (isLocked) return
                      if (vcId === p.id) return
                      if (captainId === p.id) setCaptainId(vcId)
                      setVcId(p.id)
                      setDirty(true)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: 0, border: 'none', background: 'transparent',
                      cursor: isLocked ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      border: isVCPlayer ? 'none' : '2px solid #d0d2da',
                      background: isVCPlayer ? '#C0C7D0' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: isVCPlayer ? '#1a1a1a' : 'transparent',
                      transition: 'all 0.15s',
                    }}>&#10003;</div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>Vice Captain</span>
                  </button>
                </div>
              )}
              {/* Buttons row — Substitute + Full Profile side by side */}
              <div style={{ display: 'flex', gap: 8, padding: '10px 20px 0' }}>
                {!isLocked && (
                  <button
                    onClick={() => {
                      closeStatsSheet()
                      if (isBenchPlayer) {
                        setSwapSelection({ direction: 'toXI', sourceId: p.id })
                      } else {
                        setSwapSelection({ direction: 'toBench', sourceId: p.id })
                      }
                    }}
                    style={{
                      flex: 1, padding: '13px', borderRadius: 12,
                      border: 'none',
                      background: 'linear-gradient(135deg, #0d9e5f, #07c472)',
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: '0 4px 14px rgba(13, 158, 95, 0.25)',
                    }}
                  >
                    Substitute
                  </button>
                )}
                <button
                  onClick={() => setSheetView('full')}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12,
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
