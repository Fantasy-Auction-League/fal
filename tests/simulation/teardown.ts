import { prisma } from '../../lib/db'
import { rmSync, existsSync } from 'fs'
import { join } from 'path'
import { SIM_LEAGUE_NAME, SIM_PREFIX } from './helpers'

export async function teardownSimulation() {
  const league = await prisma.league.findFirst({
    where: { name: SIM_LEAGUE_NAME },
  })
  if (!league) return { log: ['No simulation data found'] }

  const log: string[] = ['Tearing down simulation data...']
  const teams = await prisma.team.findMany({ where: { leagueId: league.id } })
  const teamIds = teams.map((t) => t.id)

  // Delete in FK order, ALL scoped to simulation data
  await prisma.chipUsage.deleteMany({ where: { teamId: { in: teamIds } } })
  await prisma.gameweekScore.deleteMany({ where: { teamId: { in: teamIds } } })

  const lineups = await prisma.lineup.findMany({
    where: { teamId: { in: teamIds } },
  })
  await prisma.lineupSlot.deleteMany({
    where: { lineupId: { in: lineups.map((l) => l.id) } },
  })
  await prisma.lineup.deleteMany({ where: { teamId: { in: teamIds } } })

  // Scope to simulation gameweeks
  const gameweeks = await prisma.gameweek.findMany()
  const gwIds = gameweeks.map((g) => g.id)
  const matches = await prisma.match.findMany({
    where: { gameweekId: { in: gwIds } },
  })
  const matchIds = matches.map((m) => m.id)

  await prisma.playerPerformance.deleteMany({
    where: { matchId: { in: matchIds } },
  })
  await prisma.playerScore.deleteMany({
    where: { gameweekId: { in: gwIds } },
  })
  await prisma.teamPlayer.deleteMany({ where: { leagueId: league.id } })
  await prisma.team.deleteMany({ where: { leagueId: league.id } })
  await prisma.match.deleteMany({ where: { gameweekId: { in: gwIds } } })
  await prisma.gameweek.deleteMany({ where: { id: { in: gwIds } } })
  await prisma.league.delete({ where: { id: league.id } })
  await prisma.user.deleteMany({
    where: { email: { startsWith: SIM_PREFIX } },
  })

  // Clean test artifacts and caches so next run starts fresh
  const root = join(__dirname, '../..')
  const dirsToClean = [
    join(root, '.next'),
    join(root, 'node_modules/.cache'),
    join(root, 'test-results'),
    join(root, 'playwright-report'),
    join(__dirname, 'playwright/.auth'),
    join(__dirname, 'playwright/layer0.spec.ts-snapshots'),
  ]
  for (const dir of dirsToClean) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
      log.push(`Cleaned ${dir.replace(root, '.')}`)
    }
  }

  log.push('Teardown complete')
  return { log }
}
