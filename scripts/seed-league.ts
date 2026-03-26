/**
 * Seeds the All In, All Out 2026 league from auction-roster-2026.csv.
 * Creates the admin user (shaheeldholakia@gmail.com), league, and all 7 team rosters.
 *
 * Run: npx tsx scripts/seed-league.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { join } from 'path'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'shaheeldholakia@gmail.com'
const ADMIN_PASSWORD = 'fal2026'
const LEAGUE_NAME = 'All In, All Out 2026'
const INVITE_CODE = 'FAL-2026'

async function main() {
  console.log('=== Seeding All In, All Out 2026 ===\n')

  // 1. Create / update admin user
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, role: 'ADMIN', name: 'Shaheel Dholakia' },
    create: {
      email: ADMIN_EMAIL,
      name: 'Shaheel Dholakia',
      role: 'ADMIN',
      passwordHash,
    },
  })
  console.log(`[OK] Admin user: ${admin.email}`)

  // 2. Create league (skip if already exists)
  let league = await prisma.league.findFirst({ where: { name: LEAGUE_NAME } })
  if (!league) {
    // Check invite code uniqueness
    const existingCode = await prisma.league.findUnique({ where: { inviteCode: INVITE_CODE } })
    const inviteCode = existingCode ? `FAL-${Date.now()}` : INVITE_CODE

    league = await prisma.league.create({
      data: {
        name: LEAGUE_NAME,
        inviteCode,
        adminUserId: admin.id,
        minSquadSize: 15,
        maxSquadSize: 15,
        teams: {
          create: {
            name: "Shaheel's Team",
            userId: admin.id,
          },
        },
      },
    })
    console.log(`[OK] Created league: "${league.name}" (invite code: ${league.inviteCode})`)
  } else {
    console.log(`[OK] League already exists: "${league.name}" (invite code: ${league.inviteCode})`)
  }

  // Update admin's active league
  await prisma.user.update({
    where: { id: admin.id },
    data: { activeLeagueId: league.id },
  })

  // 3. Read CSV
  const csvPath = join(process.cwd(), 'auction-roster-2026.csv')
  const csvText = readFileSync(csvPath, 'utf-8')
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as any[]
  console.log(`\n[OK] Loaded ${rows.length} rows from auction-roster-2026.csv`)

  // 4. Build player lookup from DB
  const allNames = rows.map((r: any) => r.playerName?.trim()).filter(Boolean)
  const dbPlayers = await prisma.player.findMany({
    where: { fullname: { in: allNames, mode: 'insensitive' } },
  })
  const playerLookup = new Map(dbPlayers.map((p) => [p.fullname.toLowerCase(), p]))
  console.log(`[OK] Matched against ${dbPlayers.length} players in DB`)

  // 5. Group rows by manager email
  const managerMap = new Map<string, { teamName: string; players: { name: string; price: number }[] }>()
  for (const row of rows) {
    const email = row.managerEmail?.toLowerCase().trim()
    if (!email || !row.playerName?.trim()) continue
    if (!managerMap.has(email)) {
      managerMap.set(email, { teamName: row.teamName.trim(), players: [] })
    }
    managerMap.get(email)!.players.push({
      name: row.playerName.trim(),
      price: parseFloat(row.purchasePrice) || 0,
    })
  }

  // 6. Clear existing roster for this league
  await prisma.teamPlayer.deleteMany({ where: { leagueId: league.id } })

  // 7. Create teams and assign players
  const errors: string[] = []
  let teamsCreated = 0
  let playersAssigned = 0

  for (const [email, data] of managerMap) {
    // Upsert user (no password for non-admin users — they'll set it on first login)
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          role: 'USER',
          activeLeagueId: league.id,
        },
      })
    }

    // Resolve players
    const resolved: { playerId: string; price: number }[] = []
    for (const p of data.players) {
      const dbPlayer = playerLookup.get(p.name.toLowerCase())
      if (!dbPlayer) {
        errors.push(`Player not found: "${p.name}" (team: ${data.teamName})`)
        continue
      }
      resolved.push({ playerId: dbPlayer.id, price: p.price })
    }

    // Upsert team
    let team = await prisma.team.findFirst({ where: { leagueId: league.id, userId: user.id } })
    if (team) {
      if (team.name !== data.teamName) {
        team = await prisma.team.update({ where: { id: team.id }, data: { name: data.teamName } })
      }
    } else {
      team = await prisma.team.create({
        data: { name: data.teamName, userId: user.id, leagueId: league.id },
      })
    }

    // Insert team players
    await prisma.teamPlayer.createMany({
      data: resolved.map((p) => ({
        teamId: team.id,
        playerId: p.playerId,
        leagueId: league.id,
        purchasePrice: p.price,
      })),
    })

    teamsCreated++
    playersAssigned += resolved.length
    console.log(`  [OK] ${data.teamName} (${email}): ${resolved.length} players`)
  }

  if (errors.length > 0) {
    console.log('\n[WARN] Unresolved players:')
    errors.forEach((e) => console.log(`  - ${e}`))
  }

  console.log(`\n=== Done ===`)
  console.log(`Teams: ${teamsCreated}`)
  console.log(`Players assigned: ${playersAssigned}`)
  console.log(`\nLogin credentials:`)
  console.log(`  Email:    ${ADMIN_EMAIL}`)
  console.log(`  Password: ${ADMIN_PASSWORD}`)
  console.log(`  URL:      http://localhost:3000`)
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
