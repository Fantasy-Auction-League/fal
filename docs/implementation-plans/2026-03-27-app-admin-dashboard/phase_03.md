# Phase 3: Sync Player Teams API

**Codebase verified:** 2026-03-27

---

## Acceptance Criteria Coverage

This phase implements:

### app-admin-dashboard.AC4: Sync Player Teams
- **app-admin-dashboard.AC4.1 Success:** Dry-run (GET) returns list of team changes, new players, and role changes without modifying DB
- **app-admin-dashboard.AC4.2 Success:** Apply (POST) writes team assignment changes to Player table
- **app-admin-dashboard.AC4.3 Success:** Response includes which fantasy teams are affected by each player change
- **app-admin-dashboard.AC4.4 Failure:** Non-app-admin users receive 403 on both GET and POST
- **app-admin-dashboard.AC4.5 Failure:** Concurrent apply requests do not create duplicate players

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create `lib/sync-players.ts` — shared sync logic

**Verifies:** app-admin-dashboard.AC4.1, app-admin-dashboard.AC4.2, app-admin-dashboard.AC4.3, app-admin-dashboard.AC4.5

**Files:**
- Create: `lib/sync-players.ts`

**Implementation:**

Write fresh implementation using existing utilities (do NOT depend on any file from other branches). Reuse:
- `IPL_TEAMS` from `lib/sportmonks/utils.ts:32-43`
- `mapPositionToRole()` from `lib/sportmonks/utils.ts:10-29`
- `sportmonks` client from `lib/sportmonks/client.ts`
- `prisma` from `lib/db`

Key function signature:
```typescript
export interface SyncResult {
  teamChanges: { playerName: string; apiPlayerId: number; oldTeam: string; newTeam: string; fantasyTeams: string[] }[]
  newPlayers: { playerName: string; iplTeamCode: string }[]
  roleChanges: { playerName: string; oldRole: string; newRole: string }[]
  applied: boolean
  updatedCount: number
  createdCount: number
}

export async function syncPlayerTeams(options: { apply: boolean; seasonId?: number }): Promise<SyncResult>
```

Full implementation logic (self-contained, no dependency on other branches):

```typescript
import { prisma } from '@/lib/db'
import { sportmonks } from './sportmonks/client'
import { IPL_TEAMS, mapPositionToRole } from './sportmonks/utils'

export async function syncPlayerTeams(options: { apply: boolean; seasonId?: number }): Promise<SyncResult> {
  const seasonId = options.seasonId || 1795

  // Concurrency guard: advisory lock prevents parallel applies
  if (options.apply) {
    const [lockResult] = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`SELECT pg_try_advisory_lock(123456)`
    if (!lockResult.pg_try_advisory_lock) {
      throw new Error('Sync already in progress')
    }
  }

  try {
    // 1. Build lookup of existing DB players by apiPlayerId
    const dbPlayers = await prisma.player.findMany({
      select: { id: true, apiPlayerId: true, fullname: true, iplTeamId: true, iplTeamName: true, iplTeamCode: true, role: true },
    })
    const dbLookup = new Map(dbPlayers.map(p => [p.apiPlayerId, p]))

    const teamChanges: SyncResult['teamChanges'] = []
    const newPlayers: SyncResult['newPlayers'] = []
    const roleChanges: SyncResult['roleChanges'] = []
    let updatedCount = 0
    let createdCount = 0

    // 2. Fetch squads from SportMonks for all 10 IPL teams
    for (const team of IPL_TEAMS) {
      let squad: any[]
      try {
        const data = await sportmonks.fetch<{ squad: any[] }>(`/teams/${team.id}/squad/${seasonId}`)
        squad = data?.squad || []
      } catch (err) {
        console.warn(`syncPlayerTeams: failed to fetch squad for ${team.code}:`, err)
        continue
      }

      for (const player of squad) {
        const existing = dbLookup.get(player.id)
        const newRole = mapPositionToRole(player.position?.name)

        if (!existing) {
          // New player not in DB
          newPlayers.push({ playerName: player.fullname, iplTeamCode: team.code })
          if (options.apply) {
            await prisma.player.create({
              data: {
                apiPlayerId: player.id,
                fullname: player.fullname,
                firstname: player.firstname || null,
                lastname: player.lastname || null,
                iplTeamId: team.id,
                iplTeamName: team.name,
                iplTeamCode: team.code,
                role: newRole,
                battingStyle: player.battingstyle || null,
                bowlingStyle: player.bowlingstyle || null,
                imageUrl: player.image_path || null,
                dateOfBirth: player.dateofbirth || null,
              },
            })
            createdCount++
          }
          continue
        }

        // Check team change
        if (existing.iplTeamId !== team.id) {
          // Look up which fantasy teams have this player
          const fantasyTeamPlayers = await prisma.teamPlayer.findMany({
            where: { playerId: existing.id },
            include: { team: { select: { name: true } } },
          })
          const fantasyTeams = fantasyTeamPlayers.map(tp => tp.team.name)

          teamChanges.push({
            playerName: existing.fullname,
            apiPlayerId: player.id,
            oldTeam: existing.iplTeamCode || '??',
            newTeam: team.code,
            fantasyTeams,
          })

          if (options.apply) {
            await prisma.player.update({
              where: { apiPlayerId: player.id },
              data: {
                iplTeamId: team.id,
                iplTeamName: team.name,
                iplTeamCode: team.code,
                fullname: player.fullname,
                firstname: player.firstname || null,
                lastname: player.lastname || null,
                role: newRole,
                battingStyle: player.battingstyle || null,
                bowlingStyle: player.bowlingstyle || null,
                imageUrl: player.image_path || null,
                dateOfBirth: player.dateofbirth || null,
              },
            })
            updatedCount++
          }
        }

        // Check role change
        if (existing.role !== newRole) {
          roleChanges.push({ playerName: existing.fullname, oldRole: existing.role, newRole })
        }
      }
    }

    return { teamChanges, newPlayers, roleChanges, applied: options.apply, updatedCount, createdCount }
  } finally {
    // Release advisory lock
    if (options.apply) {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(123456)`
    }
  }
}
```

**Testing:**
Tests must verify:
- AC4.1: Dry-run returns changes without modifying DB
- AC4.2: Apply mode writes changes to Player table
- AC4.3: Fantasy team names included in teamChanges response
- AC4.5: Advisory lock prevents concurrent execution

Follow project integration test patterns (direct Prisma, namespaced test data).

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

**Commit:** `feat: add shared syncPlayerTeams function for API and CLI use`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create `app/api/admin/sync-players/route.ts`

**Verifies:** app-admin-dashboard.AC4.4

**Files:**
- Create: `app/api/admin/sync-players/route.ts`

**Implementation:**

```typescript
import { auth } from '@/lib/auth'
import { syncPlayerTeams } from '@/lib/sync-players'
import { NextResponse } from 'next/server'

// GET — dry run (returns changes without applying)
export async function GET() {
  const session = await auth()
  if (!session?.user?.isAppAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await syncPlayerTeams({ apply: false })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Sync players error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}

// POST — apply changes
export async function POST() {
  const session = await auth()
  if (!session?.user?.isAppAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await syncPlayerTeams({ apply: true })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Sync players apply error:', error)
    const message = error instanceof Error ? error.message : 'Internal error'
    const status = message.includes('already in progress') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
```

**Testing:**
Tests must verify:
- AC4.4: Non-app-admin receives 403 on GET and POST

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

**Commit:** `feat: add sync-players API route with dry-run and apply modes`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Refactor CLI script to use shared function

**Verifies:** None (infrastructure refactor)

**Files:**
- Create or modify: `scripts/reseed-player-teams.ts`

**Implementation:**

If PR #18 is merged, modify the existing file. If not, create fresh. Either way, replace inline sync logic with shared function call:

```typescript
import { config } from 'dotenv'
config({ path: '.env.local' })

import { syncPlayerTeams } from '../lib/sync-players'

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  const result = await syncPlayerTeams({ apply: APPLY })

  console.log(`\nTeam changes: ${result.teamChanges.length}`)
  for (const c of result.teamChanges) {
    console.log(`  ${c.playerName} (${c.apiPlayerId}): ${c.oldTeam} → ${c.newTeam}`)
    if (c.fantasyTeams.length > 0) {
      console.log(`    On fantasy teams: ${c.fantasyTeams.join(', ')}`)
    }
  }

  console.log(`\nNew players: ${result.newPlayers.length}`)
  for (const p of result.newPlayers) {
    console.log(`  ${p.playerName} → ${p.iplTeamCode}`)
  }

  console.log(`\nRole changes: ${result.roleChanges.length}`)
  for (const r of result.roleChanges) {
    console.log(`  ${r.playerName}: ${r.oldRole} → ${r.newRole}`)
  }

  if (APPLY) {
    console.log(`\n[APPLIED] ${result.updatedCount} updated, ${result.createdCount} created`)
  } else {
    console.log('\n[DRY RUN] No changes. Run with --apply to write.')
  }
}

main().catch(e => { console.error('Failed:', e); process.exit(1) })
```

**Verification:**
Run: `npx tsx scripts/reseed-player-teams.ts`
Expected: Dry-run output matching previous script behavior

**Commit:** `refactor: CLI reseed script uses shared syncPlayerTeams function`
<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->
