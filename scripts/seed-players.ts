import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const API_TOKEN = process.env.SPORTMONKS_API_TOKEN
const SEASON_ID = process.env.SPORTMONKS_SEASON_ID || '1795'
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0'

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

// Map SportMonks position names to our PlayerRole enum
function mapRole(positionName: string): 'BAT' | 'BOWL' | 'ALL' | 'WK' {
  switch (positionName?.toLowerCase()) {
    case 'batsman': return 'BAT'
    case 'bowler': return 'BOWL'
    case 'allrounder': return 'ALL'
    case 'wicketkeeper': return 'WK'
    // Handle edge cases
    case 'middle order batter': return 'BAT'
    case 'opening batter': return 'BAT'
    default: return 'ALL' // safe fallback
  }
}

async function fetchSquad(teamId: number) {
  const url = `${BASE_URL}/teams/${teamId}/squad/${SEASON_ID}?api_token=${API_TOKEN}`
  const res = await fetch(url)
  const json = await res.json()
  return json.data?.squad || []
}

async function main() {
  console.log('Seeding IPL 2026 players from SportMonks...')
  let total = 0

  for (const team of TEAMS) {
    const squad = await fetchSquad(team.id)
    console.log(`${team.code}: ${squad.length} players`)

    for (const player of squad) {
      await prisma.player.upsert({
        where: { apiPlayerId: player.id },
        update: {
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
        create: {
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
      total++
    }
  }

  console.log(`\nDone! Seeded ${total} players.`)

  // Verify
  const count = await prisma.player.count()
  console.log(`Database player count: ${count}`)

  const byRole = await prisma.player.groupBy({
    by: ['role'],
    _count: true,
  })
  console.log('By role:', byRole.map(r => `${r.role}: ${r._count}`).join(', '))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
