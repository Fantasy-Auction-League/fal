'use client'

import { useSession } from 'next-auth/react'
import { useState, useCallback, useRef } from 'react'

/* ─── IPL team colors ─── */
const teamColors: Record<string, string> = {
  MI: '#004BA0', CSK: '#F9CD05', RCB: '#EC1C24', KKR: '#3A225D',
  DC: '#004C93', RR: '#EA1A85', SRH: '#FF822A', GT: '#0EB1A2',
  LSG: '#00AEEF', PBKS: '#ED1B24',
}

const roleColors: Record<string, string> = {
  BAT: '#F9CD05', BOWL: '#a0c4ff', ALL: '#0EB1A2', WK: '#EA1A85',
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

interface TeamSummary {
  email: string
  teamName: string
  playerCount: number
  status: 'ok' | 'error'
}

interface RosterResult {
  teams: TeamSummary[]
  errors: string[]
}

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

/* ─── Reusable styles ─── */
const card = 'bg-white/[0.03] border border-white/10 rounded-xl p-5'
const inputCls = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm w-full outline-none focus:border-white/25 transition-colors'
const btnPrimary = 'bg-gradient-to-r from-[#3A225D] via-[#004BA0] to-[#0EB1A2] text-white px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity'
const sectionTitle = 'text-lg font-bold text-white mb-3'
const subtle = 'text-white/40 text-xs'
const successText = 'text-[#a8e6cf]'
const errorText = 'text-[#ffc6d9]'

export default function AdminPage() {
  const { data: session, status: sessionStatus } = useSession()

  /* ─── State ─── */
  const [league, setLeague] = useState<League | null>(null)
  const [leagueName, setLeagueName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rosterResult, setRosterResult] = useState<RosterResult | null>(null)
  const [squads, setSquads] = useState<Record<string, SquadData>>({})
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* ─── Fetch existing league on mount ─── */
  const fetchLeagues = useCallback(async () => {
    try {
      const res = await fetch('/api/leagues')
      if (!res.ok) return
      const leagues: League[] = await res.json()
      if (leagues.length > 0) {
        // Fetch full detail for the first league the user admin
        const detail = await fetch(`/api/leagues/${leagues[0].id}`)
        if (detail.ok) {
          const full = await detail.json()
          setLeague(full)
        }
      }
    } catch {
      // silent
    } finally {
      setInitialLoad(false)
    }
  }, [])

  // Run once on mount
  useState(() => {
    if (sessionStatus === 'authenticated') fetchLeagues()
  })

  // Also fetch when session transitions to authenticated
  const prevStatus = useRef(sessionStatus)
  if (sessionStatus === 'authenticated' && prevStatus.current !== 'authenticated') {
    prevStatus.current = sessionStatus
    fetchLeagues()
  }
  prevStatus.current = sessionStatus

  /* ─── Auth guard ─── */
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/50 text-sm">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-white/60 text-sm">Please log in to access the admin dashboard.</p>
        <a href="/login" className={btnPrimary}>Go to Login</a>
      </div>
    )
  }

  /* ─── Helpers ─── */
  const clearMessages = () => { setError(''); setSuccess('') }

  const createLeague = async () => {
    if (!leagueName.trim()) return
    clearMessages()
    setLoading(true)
    try {
      const res = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: leagueName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create league'); return }
      // Fetch full detail
      const detail = await fetch(`/api/leagues/${data.id}`)
      if (detail.ok) setLeague(await detail.json())
      else setLeague(data)
      setSuccess('League created!')
      setLeagueName('')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const copyInviteCode = async () => {
    if (!league) return
    try {
      await navigator.clipboard.writeText(league.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback: do nothing */ }
  }

  const uploadRoster = async () => {
    if (!league || !fileRef.current?.files?.[0]) return
    clearMessages()
    setLoading(true)
    try {
      const csvText = await fileRef.current.files[0].text()
      const res = await fetch(`/api/leagues/${league.id}/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText,
      })
      const data = await res.json()
      setRosterResult(data)
      if (!res.ok && data.error) setError(data.error)
      if (res.ok) {
        setSuccess('Roster uploaded successfully!')
        // Refresh league detail
        const detail = await fetch(`/api/leagues/${league.id}`)
        if (detail.ok) setLeague(await detail.json())
        // Fetch squads for all teams
        await fetchAllSquads()
      }
    } catch { setError('Network error during upload') }
    finally { setLoading(false) }
  }

  const fetchAllSquads = async () => {
    if (!league) return
    const result: Record<string, SquadData> = {}
    for (const team of league.teams) {
      try {
        const res = await fetch(`/api/teams/${team.id}/squad`)
        if (res.ok) result[team.id] = await res.json()
      } catch { /* skip */ }
    }
    setSquads(result)
  }

  const startSeason = async () => {
    if (!league) return
    clearMessages()
    setLoading(true)
    try {
      const res = await fetch('/api/admin/season/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId: league.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to start season')
        return
      }
      setSuccess('Season started!')
      setLeague((prev) => prev ? { ...prev, seasonStarted: true } : prev)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const toggleSquad = async (teamId: string) => {
    if (expandedTeam === teamId) {
      setExpandedTeam(null)
      return
    }
    setExpandedTeam(teamId)
    if (!squads[teamId]) {
      try {
        const res = await fetch(`/api/teams/${teamId}/squad`)
        if (res.ok) {
          const data = await res.json()
          setSquads((prev) => ({ ...prev, [teamId]: data }))
        }
      } catch { /* skip */ }
    }
  }

  const groupByRole = (players: SquadPlayer[]) => {
    const groups: Record<string, SquadPlayer[]> = { WK: [], BAT: [], ALL: [], BOWL: [] }
    for (const p of players) {
      const role = p.role?.toUpperCase() || 'BAT'
      const key = role.includes('WK') ? 'WK'
        : role.includes('ALL') ? 'ALL'
        : role.includes('BOWL') ? 'BOWL'
        : 'BAT'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return groups
  }

  /* ─── Render ─── */
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">

        {/* ── Header ── */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-black bg-gradient-to-r from-[#3A225D] via-[#004BA0] to-[#0EB1A2] bg-clip-text text-transparent">
              FAL
            </div>
            <h1 className="text-lg font-bold text-white">League Admin</h1>
          </div>
          <span className={subtle}>{session.user?.email}</span>
        </header>

        {/* ── Messages ── */}
        {error && <p className={`${errorText} text-sm`}>{error}</p>}
        {success && <p className={`${successText} text-sm`}>{success}</p>}

        {/* ── Loading initial data ── */}
        {initialLoad && (
          <div className={card}>
            <p className="text-white/50 text-sm">Loading leagues...</p>
          </div>
        )}

        {/* ── Section B: Create League ── */}
        {!initialLoad && !league && (
          <section className={card}>
            <h2 className={sectionTitle}>Create League</h2>
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="League name"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createLeague()}
              />
              <button className={btnPrimary} onClick={createLeague} disabled={loading || !leagueName.trim()}>
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </section>
        )}

        {/* ── Section C: League Overview ── */}
        {league && (
          <section className={card}>
            <h2 className={sectionTitle}>{league.name}</h2>

            <div className="flex flex-wrap gap-4 mb-4">
              {/* Invite code */}
              <div>
                <p className={subtle}>Invite Code</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="text-sm font-mono text-white/80">{league.inviteCode}</code>
                  <button
                    onClick={copyInviteCode}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Manager count */}
              <div>
                <p className={subtle}>Managers</p>
                <p className="text-sm text-white/80 mt-0.5">{league._count?.teams ?? league.teams.length} / 15</p>
              </div>

              {/* Season status */}
              <div>
                <p className={subtle}>Season</p>
                <span className={`text-xs mt-0.5 inline-block px-2 py-0.5 rounded-full ${
                  league.seasonStarted
                    ? 'bg-[#a8e6cf]/10 text-[#a8e6cf]'
                    : 'bg-white/5 text-white/40'
                }`}>
                  {league.seasonStarted ? 'Active' : 'Not Started'}
                </span>
              </div>
            </div>

            {/* Team list */}
            {league.teams.length > 0 && (
              <div className="space-y-2">
                <p className={`${subtle} mb-1`}>Teams</p>
                {league.teams.map((team) => {
                  const squad = squads[team.id]
                  const count = squad?.players?.length ?? 0
                  const maxSquad = league.maxSquadSize || 15
                  const isComplete = count >= (league.minSquadSize || 15)
                  return (
                    <button
                      key={team.id}
                      onClick={() => toggleSquad(team.id)}
                      className="w-full flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2 hover:border-white/15 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm text-white/80">{team.name}</p>
                        <p className={subtle}>{team.user?.email}</p>
                      </div>
                      <span className={`text-xs font-mono ${isComplete && count > 0 ? successText : 'text-white/40'}`}>
                        {count}/{maxSquad}{isComplete && count > 0 ? ' \u2713' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Section F: Expanded Squad Viewer ── */}
        {expandedTeam && squads[expandedTeam] && (
          <section className={card}>
            <h2 className={sectionTitle}>{squads[expandedTeam].teamName} Squad</h2>
            {(() => {
              const groups = groupByRole(squads[expandedTeam].players)
              return Object.entries(groups).map(([role, players]) =>
                players.length > 0 ? (
                  <div key={role} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                        style={{ color: roleColors[role], borderColor: roleColors[role] }}
                      >
                        {role}
                      </span>
                      <span className={subtle}>{players.length}</span>
                    </div>
                    <div className="space-y-1">
                      {players.map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/[0.02]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white/80">{p.fullname}</span>
                            {p.iplTeamCode && (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  color: teamColors[p.iplTeamCode] || '#fff',
                                  backgroundColor: `${teamColors[p.iplTeamCode] || '#fff'}15`,
                                }}
                              >
                                {p.iplTeamCode}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-white/40 font-mono">
                            {p.purchasePrice > 0 ? `${p.purchasePrice} Cr` : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              )
            })()}
            {squads[expandedTeam].players.length === 0 && (
              <p className="text-white/30 text-sm">No players yet.</p>
            )}
          </section>
        )}

        {/* ── Section D: CSV Roster Upload ── */}
        {league && !league.seasonStarted && (
          <section className={card}>
            <h2 className={sectionTitle}>Upload Roster (CSV)</h2>
            <p className={`${subtle} mb-3`}>
              Format: managerEmail, teamName, playerName, purchasePrice
            </p>
            <div className="flex gap-2 items-end">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white/70 hover:file:bg-white/15 transition-colors"
              />
              <button className={btnPrimary} onClick={uploadRoster} disabled={loading}>
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>

            {/* Upload results */}
            {rosterResult && (
              <div className="mt-4 space-y-2">
                {rosterResult.teams?.map((t) => (
                  <div key={t.email} className="flex items-center justify-between text-sm">
                    <span className="text-white/70">{t.teamName}</span>
                    <span className={t.status === 'ok' ? successText : errorText}>
                      {t.playerCount} players {t.status === 'ok' ? '\u2713' : '\u2717'}
                    </span>
                  </div>
                ))}
                {rosterResult.errors?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {rosterResult.errors.map((err, i) => (
                      <p key={i} className={`${errorText} text-xs`}>{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Section E: Start Season ── */}
        {league && (
          <section className={card}>
            <h2 className={sectionTitle}>Season Control</h2>
            {league.seasonStarted ? (
              <p className={`${successText} text-sm`}>Season is active.</p>
            ) : (
              <button className={btnPrimary} onClick={startSeason} disabled={loading || league.seasonStarted}>
                {loading ? 'Starting...' : 'Start Season'}
              </button>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="text-center pt-4">
          <p className={subtle}>FAL v0.1 — Fantasy Auction League</p>
        </footer>
      </div>
    </main>
  )
}
