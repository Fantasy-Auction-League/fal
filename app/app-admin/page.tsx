'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { AppFrame } from '@/app/components/AppFrame'

/* ─── Types ─── */
interface Match {
  id: string
  apiMatchId: number
  localTeamName: string
  visitorTeamName: string
  startingAt: string
  scoringStatus: 'SCHEDULED' | 'COMPLETED' | 'SCORING' | 'SCORED' | 'ERROR' | 'CANCELLED'
  scoringAttempts: number
}

interface SyncResult {
  teamChanges: { playerName: string; apiPlayerId: number; oldTeam: string; newTeam: string; fantasyTeams: string[] }[]
  newPlayers: { playerName: string; iplTeamCode: string }[]
  roleChanges: { playerName: string; oldRole: string; newRole: string }[]
  applied: boolean
  updatedCount: number
  createdCount: number
}

/* ─── Status pill colors ─── */
const statusColors: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: '#8e8e93', text: '#fff' },
  COMPLETED: { bg: '#004BA0', text: '#fff' },
  SCORING: { bg: '#F9CD05', text: '#1a1a2e' },
  SCORED: { bg: '#0d9e5f', text: '#fff' },
  ERROR: { bg: '#d63060', text: '#fff' },
  CANCELLED: { bg: '#666', text: '#fff' },
}

/* ─── Card style ─── */
const cardStyle = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 16,
  padding: '20px',
  marginBottom: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}

export default function AppAdminPage() {
  const { data: session, status: sessionStatus } = useSession()

  /* ─── Import Scores state ─── */
  const [matches, setMatches] = useState<Match[]>([])
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  /* ─── Sync Player Teams state ─── */
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false)

  /* ─── Load initial match status on mount ─── */
  useEffect(() => {
    const loadMatches = async () => {
      try {
        const res = await fetch('/api/scoring/status')
        if (res.ok) {
          const data = await res.json()
          setMatches(data.matches || [])
        }
      } catch (error) {
        console.error('Failed to load matches:', error)
      }
    }
    loadMatches()
  }, [])

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

  if (!session?.user?.isAppAdmin) {
    return (
      <AppFrame>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: '#888', fontSize: 14 }}>Access denied — you don't have platform admin access</p>
          <a href="/" style={{
            background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)',
            color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none'
          }}>Go Home</a>
        </div>
      </AppFrame>
    )
  }

  /* ─── Import Scores handlers ─── */
  const handleImport = async () => {
    setImporting(true)
    setImportMsg(null)
    try {
      const res = await fetch('/api/scoring/import', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setImportMsg({ type: 'success', text: `Scored ${data.matchesScored} matches` })
        // Refresh match list
        const statusRes = await fetch('/api/scoring/status')
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setMatches(statusData.matches || [])
        }
      } else {
        setImportMsg({ type: 'error', text: data.error || 'Import failed' })
      }
    } catch (error) {
      setImportMsg({ type: 'error', text: error instanceof Error ? error.message : 'Network error' })
    } finally {
      setImporting(false)
    }
  }

  const handleRecalculate = async (matchId: string) => {
    try {
      const res = await fetch(`/api/scoring/recalculate/${matchId}`, { method: 'POST' })
      if (res.ok) {
        // Refresh match list
        const statusRes = await fetch('/api/scoring/status')
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setMatches(statusData.matches || [])
        }
      }
    } catch (error) {
      console.error('Recalculate failed:', error)
    }
  }

  /* ─── Sync Player Teams handlers ─── */
  const handleCheckForUpdates = async () => {
    setChecking(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/admin/sync-players')
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
      } else {
        setSyncMsg({ type: 'error', text: data.error || 'Check failed' })
      }
    } catch (error) {
      setSyncMsg({ type: 'error', text: error instanceof Error ? error.message : 'Network error' })
    } finally {
      setChecking(false)
    }
  }

  const handleApplyChanges = async () => {
    setApplying(true)
    setConfirmSheetOpen(false)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/admin/sync-players', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncMsg({ type: 'success', text: 'Changes applied successfully' })
        setSyncResult(null)
      } else {
        setSyncMsg({ type: 'error', text: data.error || 'Apply failed' })
      }
    } catch (error) {
      setSyncMsg({ type: 'error', text: error instanceof Error ? error.message : 'Network error' })
    } finally {
      setApplying(false)
    }
  }

  const completedCount = matches.filter(m => m.scoringStatus === 'COMPLETED').length
  const hasChanges = syncResult && (syncResult.teamChanges.length > 0 || syncResult.newPlayers.length > 0 || syncResult.roleChanges.length > 0)

  return (
    <AppFrame>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: '180px' }}>
        <div style={{ padding: '20px 16px 0' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', marginBottom: 24 }}>App Admin</h1>

          {/* ─── Section 1: Import Scores ─── */}
          <div style={cardStyle}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>Match Scoring Status</div>

            {/* Match status table */}
            <div style={{ marginBottom: 16, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {matches.map(match => (
                    <tr key={match.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', height: 40 }}>
                      <td style={{ padding: '8px 0', textAlign: 'left' }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a2e' }}>
                          {match.localTeamName} vs {match.visitorTeamName}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {new Date(match.startingAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block',
                          background: statusColors[match.scoringStatus]?.bg,
                          color: statusColors[match.scoringStatus]?.text,
                          padding: '4px 12px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                          {match.scoringStatus}
                        </span>
                        {match.scoringStatus === 'ERROR' && (
                          <div style={{ marginTop: 4 }}>
                            <button
                              onClick={() => handleRecalculate(match.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#004BA0',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                padding: 0,
                              }}
                            >
                              Recalculate
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ready to score badge */}
            <div style={{
              background: completedCount > 0 ? '#e3f2fd' : '#f5f5f5',
              border: `1px solid ${completedCount > 0 ? '#004BA0' : '#ddd'}`,
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 500,
              color: completedCount > 0 ? '#004BA0' : '#666',
              marginBottom: 12,
            }}>
              {completedCount > 0 ? `${completedCount} matches ready to score` : 'No matches ready to score'}
            </div>

            {/* Operational guidance */}
            <div style={{ fontSize: 11, color: '#888', marginBottom: 16, fontStyle: 'italic' }}>
              Tip: SportMonks data is usually complete 15-30 minutes after match end.
            </div>

            {/* Import button and message */}
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#004BA0',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: importing ? 'not-allowed' : 'pointer',
                opacity: importing ? 0.7 : 1,
                marginBottom: 12,
              }}
            >
              {importing ? 'Importing...' : 'Import Scores'}
            </button>

            {importMsg && (
              <div style={{
                background: importMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${importMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: 10,
                padding: '10px 14px',
                color: importMsg.type === 'success' ? '#0d9e5f' : '#d63060',
                fontSize: 13,
                fontWeight: 500,
              }}>
                {importMsg.text}
              </div>
            )}
          </div>

          {/* ─── Section 2: Sync Player Teams ─── */}
          <div style={cardStyle}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>Sync Player Teams</div>

            {syncResult && hasChanges ? (
              <>
                {/* Changes table */}
                <div style={{ marginBottom: 16, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                        <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 700, color: '#1a1a2e' }}>Player</th>
                        <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 700, color: '#1a1a2e' }}>From</th>
                        <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 700, color: '#1a1a2e' }}>To</th>
                        <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 700, color: '#1a1a2e' }}>Teams</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncResult.teamChanges.map((change, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                          <td style={{ padding: '8px 0', color: '#1a1a2e' }}>{change.playerName}</td>
                          <td style={{ padding: '8px 0', color: '#888' }}>{change.oldTeam}</td>
                          <td style={{ padding: '8px 0', color: '#0d9e5f', fontWeight: 600 }}>{change.newTeam}</td>
                          <td style={{ padding: '8px 0', color: '#666', fontSize: 11 }}>{change.fantasyTeams.join(', ')}</td>
                        </tr>
                      ))}
                      {syncResult.newPlayers.map((player, idx) => (
                        <tr key={`new-${idx}`} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f9f9f9' }}>
                          <td style={{ padding: '8px 0', color: '#1a1a2e', fontWeight: 600 }}>+ {player.playerName}</td>
                          <td style={{ padding: '8px 0', color: '#888' }}>—</td>
                          <td style={{ padding: '8px 0', color: '#0d9e5f', fontWeight: 600 }}>{player.iplTeamCode}</td>
                          <td style={{ padding: '8px 0', color: '#666', fontSize: 11 }}>New</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Apply button */}
                <button
                  onClick={() => setConfirmSheetOpen(true)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: '#FF822A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Apply Changes
                </button>
              </>
            ) : syncResult && !hasChanges ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: '#0d9e5f',
                fontSize: 14,
              }}>
                <span style={{ fontSize: 20 }}>✓</span>
                All player teams are up to date
              </div>
            ) : null}

            {/* Check button and message */}
            <button
              onClick={handleCheckForUpdates}
              disabled={checking}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#004BA0',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: checking ? 'not-allowed' : 'pointer',
                opacity: checking ? 0.7 : 1,
                marginBottom: syncResult ? 12 : 0,
                marginTop: syncResult ? 12 : 0,
              }}
            >
              {checking ? 'Checking...' : 'Check for Updates'}
            </button>

            {syncMsg && (
              <div style={{
                background: syncMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${syncMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: 10,
                padding: '10px 14px',
                color: syncMsg.type === 'success' ? '#0d9e5f' : '#d63060',
                fontSize: 13,
                fontWeight: 500,
                marginTop: 12,
              }}>
                {syncMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Confirmation Sheet ─── */}
      {confirmSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => !applying && setConfirmSheetOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 200,
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: 480,
            background: '#fff',
            borderRadius: '20px 20px 0 0',
            zIndex: 210,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
            </div>
            {/* Content */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontSize: 14, color: '#1a1a2e', lineHeight: 1.6 }}>
                Apply {syncResult?.teamChanges.length || 0} team changes and {syncResult?.newPlayers.length || 0} new players? This only updates IPL team badges. Fantasy rosters, lineups, and scores are NOT affected.
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setConfirmSheetOpen(false)}
                  disabled={applying}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#f2f3f8',
                    color: '#1a1a2e',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: applying ? 'not-allowed' : 'pointer',
                    opacity: applying ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyChanges}
                  disabled={applying}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#004BA0',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: applying ? 'not-allowed' : 'pointer',
                    opacity: applying ? 0.7 : 1,
                  }}
                >
                  {applying ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </AppFrame>
  )
}
