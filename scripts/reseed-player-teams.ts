/**
 * Re-syncs player IPL team assignments from SportMonks API (IPL 2026).
 *
 * SAFE: Only updates iplTeamId, iplTeamName, iplTeamCode on the Player table.
 * Does NOT touch TeamPlayer, Lineup, or LineupSlot — existing fantasy rosters
 * and saved lineups are unaffected.
 *
 * Usage:
 *   npx tsx scripts/reseed-player-teams.ts            # dry-run (shows changes)
 *   npx tsx scripts/reseed-player-teams.ts --apply     # apply changes to DB
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN
const SEASON_ID = process.env.SPORTMONKS_SEASON_ID || '1795'
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0'

const APPLY = process.argv.includes('--apply')

const TEAMS = [
  { id: 6, name: 'Mumbai Indians', code: 'MI' },
  { id: 2, name: 'Chennai Super Kings', code: 'CSK' },
  { id: 5, name: 'Kolkata Knight Riders', code: 'KKR' },
  { id: 7, name: 'Rajasthan Royals', code: 'RR' },
  { id: 8, name: 'Royal Challengers Bengaluru', code: 'RCB' },
  { id: 4, name: 'Punjab Kings', code: 'PBKS' },
  { id: 1976, name: 'Gujarat Titans', code: 'GT' },
  { id: 9, name: 'Sunrisers Hyderabad', code: 'SRH' },
  { id: 3, name: 'Delhi Capitals', code: 'DC' },
  { id: 1979, name: 'Lucknow Super Giants', code: 'LSG' },
]

async function fetchSquad(teamId: number): Promise<any[]> {
  const url = `${BASE_URL}/teams/${teamId}/squad/${SEASON_ID}?api_token=${API_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SportMonks ${res.status}: ${url}`)
  const json = await res.json()
  return json.data?.squad || []
}

interface TeamChange {
  playerName: string
  apiPlayerId: number
  oldTeam: string
  newTeam: string
}

async function main() {
  if (!API_TOKEN) {
    console.error('SPORTMONKS_API_TOKEN not set in .env.local')
    process.exit(1)
  }

  console.log(`=== Player Team Re-sync (Season ${SEASON_ID}) ===`)
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no DB changes)'}`)
  console.log()

  // Build lookup of current DB players by apiPlayerId
  const dbPlayers = await prisma.player.findMany({
    select: { id: true, apiPlayerId: true, fullname: true, iplTeamId: true, iplTeamName: true, iplTeamCode: true },
  })
  const dbLookup = new Map(dbPlayers.map(p => [p.apiPlayerId, p]))
  console.log(`DB players: ${dbPlayers.length}`)

  const changes: TeamChange[] = []
  let totalApiPlayers = 0
  let newPlayers = 0
  let updated = 0

  for (const team of TEAMS) {
    const squad = await fetchSquad(team.id)
    console.log(`${team.code}: ${squad.length} players`)
    totalApiPlayers += squad.length

    for (const player of squad) {
      const existing = dbLookup.get(player.id)

      if (!existing) {
        newPlayers++
        if (APPLY) {
          await prisma.player.create({
            data: {
              apiPlayerId: player.id,
              fullname: player.fullname,
              firstname: player.firstname,
              lastname: player.lastname,
              iplTeamId: team.id,
              iplTeamName: team.name,
              iplTeamCode: team.code,
              role: mapRole(player.position?.name),
              battingStyle: player.battingstyle || null,
              bowlingStyle: player.bowlingstyle || null,
              imageUrl: player.image_path || null,
              dateOfBirth: player.dateofbirth || null,
            },
          })
        }
        console.log(`  [NEW] ${player.fullname} → ${team.code}`)
        continue
      }

      // Check if team assignment changed
      if (existing.iplTeamId !== team.id) {
        changes.push({
          playerName: existing.fullname,
          apiPlayerId: player.id,
          oldTeam: existing.iplTeamCode || '??',
          newTeam: team.code,
        })

        if (APPLY) {
          await prisma.player.update({
            where: { apiPlayerId: player.id },
            data: {
              iplTeamId: team.id,
              iplTeamName: team.name,
              iplTeamCode: team.code,
              // Also refresh metadata while we're here
              fullname: player.fullname,
              firstname: player.firstname,
              lastname: player.lastname,
              role: mapRole(player.position?.name),
              battingStyle: player.battingstyle || null,
              bowlingStyle: player.bowlingstyle || null,
              imageUrl: player.image_path || null,
              dateOfBirth: player.dateofbirth || null,
            },
          })
          updated++
        }
      }
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  console.log(`API players fetched: ${totalApiPlayers}`)
  console.log(`New players (not in DB): ${newPlayers}`)
  console.log(`Team changes: ${changes.length}`)

  if (changes.length > 0) {
    console.log('\n=== Team Changes ===')
    for (const c of changes) {
      console.log(`  ${c.playerName} (${c.apiPlayerId}): ${c.oldTeam} → ${c.newTeam}`)
    }
  }

  if (APPLY) {
    console.log(`\n[APPLIED] ${updated} players updated, ${newPlayers} new players created.`)
  } else {
    console.log('\n[DRY RUN] No changes made. Run with --apply to write to DB.')
  }
}

function mapRole(positionName: string): 'BAT' | 'BOWL' | 'ALL' | 'WK' {
  switch (positionName?.toLowerCase()) {
    case 'batsman': return 'BAT'
    case 'bowler': return 'BOWL'
    case 'allrounder': return 'ALL'
    case 'wicketkeeper': return 'WK'
    case 'middle order batter': return 'BAT'
    case 'opening batter': return 'BAT'
    default: return 'ALL'
  }
}

main()
  .catch(e => { console.error('Failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
