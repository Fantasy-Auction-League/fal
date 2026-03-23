import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { importFixturesAndGameweeks } from '../lib/sportmonks/fixtures'

async function main() {
  const prisma = new PrismaClient()

  try {
    const seasonId = Number(process.argv[2]) || 1795
    console.log(`Seeding fixtures for season ${seasonId}...`)

    const result = await importFixturesAndGameweeks(prisma, seasonId)

    console.log(`\nCreated ${result.gameweeks} gameweeks and ${result.matches} matches\n`)

    // Print summary table
    const byGw = new Map<number, typeof result.fixtures>()
    for (const f of result.fixtures) {
      const arr = byGw.get(f.gameweek) || []
      arr.push(f)
      byGw.set(f.gameweek, arr)
    }

    for (const [gw, matches] of [...byGw.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`GW${gw} (${matches.length} matches):`)
      for (const m of matches) {
        console.log(`  ${m.local} vs ${m.visitor}  ${m.startingAt}`)
      }
    }

    // Verify
    const gwCount = await prisma.gameweek.count()
    const matchCount = await prisma.match.count()
    console.log(`\nVerification: ${gwCount} gameweeks, ${matchCount} matches in DB`)
  } catch (error) {
    console.error('Seed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
