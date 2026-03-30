/**
 * Simulate GW scores for testing the read-only lineup GW points & navigation feature.
 *
 * Creates:
 * - Lineups (XI + bench + captain/VC) for all teams across GW1-3
 * - PlayerScore records with randomised fantasy points for GW1-2
 * - GameweekScore records for each team in GW1-2
 * - Partial scores for GW3 (active GW)
 * - Marks GW1-2 as COMPLETED, GW3 as ACTIVE
 *
 * Usage: npx tsx scripts/simulate-gw-scores.ts
 */

import { prisma } from '../lib/db'

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function main() {
  console.log('Starting GW score simulation...\n')

  // 1. Fetch all gameweeks, teams, and team players
  const gameweeks = await prisma.gameweek.findMany({ orderBy: { number: 'asc' } })
  const teams = await prisma.team.findMany({
    include: {
      teamPlayers: {
        include: { player: { select: { id: true, fullname: true, role: true } } },
      },
    },
  })

  console.log(`Found ${gameweeks.length} gameweeks, ${teams.length} teams`)

  // 2. Mark GW statuses: GW1-2 COMPLETED, GW3 ACTIVE
  for (const gw of gameweeks) {
    const newStatus = gw.number <= 2 ? 'COMPLETED' : gw.number === 3 ? 'ACTIVE' : 'UPCOMING'
    const newAggStatus = gw.number <= 2 ? 'DONE' : 'PENDING'
    await prisma.gameweek.update({
      where: { id: gw.id },
      data: { status: newStatus, aggregationStatus: newAggStatus },
    })
    console.log(`  GW${gw.number} → ${newStatus}`)
  }

  // 3. Mark matches in GW1-2 as SCORED
  for (const gw of gameweeks.filter(g => g.number <= 2)) {
    await prisma.match.updateMany({
      where: { gameweekId: gw.id },
      data: { scoringStatus: 'SCORED' },
    })
  }
  // Mark some GW3 matches as SCORED (partial)
  const gw3 = gameweeks.find(g => g.number === 3)
  if (gw3) {
    const gw3Matches = await prisma.match.findMany({
      where: { gameweekId: gw3.id },
      orderBy: { startingAt: 'asc' },
    })
    // Score first 4, leave rest as SCHEDULED
    for (let i = 0; i < Math.min(4, gw3Matches.length); i++) {
      await prisma.match.update({
        where: { id: gw3Matches[i].id },
        data: { scoringStatus: 'SCORED' },
      })
    }
  }

  // 3b. Fetch matches per GW for PlayerPerformance linking
  const matchesByGW: Record<string, { id: string }[]> = {}
  for (const gw of gameweeks) {
    const matches = await prisma.match.findMany({
      where: { gameweekId: gw.id },
      select: { id: true },
    })
    matchesByGW[gw.id] = matches
  }

  // 4. For each team, create lineups and scores for GW1-3
  for (const team of teams) {
    const players = team.teamPlayers.map(tp => tp.player)
    if (players.length < 11) {
      console.log(`  Skipping ${team.name} — only ${players.length} players`)
      continue
    }

    // Sort by role for a realistic lineup
    const rolePri: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 }
    const sorted = [...players].sort((a, b) => {
      const ra = rolePri[a.role?.toUpperCase()?.includes('WK') ? 'WK' : a.role?.toUpperCase()?.includes('ALL') ? 'ALL' : a.role?.toUpperCase()?.includes('BOWL') ? 'BOWL' : 'BAT'] ?? 1
      const rb = rolePri[b.role?.toUpperCase()?.includes('WK') ? 'WK' : b.role?.toUpperCase()?.includes('ALL') ? 'ALL' : b.role?.toUpperCase()?.includes('BOWL') ? 'BOWL' : 'BAT'] ?? 1
      return ra - rb
    })

    for (const gw of gameweeks) {
      // Vary the lineup slightly per GW — shuffle last 4 XI / first 4 bench for GW2+
      let xiPlayers = sorted.slice(0, 11)
      let benchPlayers = sorted.slice(11)

      if (gw.number >= 2 && benchPlayers.length > 0) {
        // Swap 1-2 players between XI and bench for variety
        const swapCount = Math.min(gw.number - 1, 2, benchPlayers.length)
        for (let i = 0; i < swapCount; i++) {
          const xiIdx = xiPlayers.length - 1 - i
          const benchIdx = i
          const temp = xiPlayers[xiIdx]
          xiPlayers[xiIdx] = benchPlayers[benchIdx]
          benchPlayers[benchIdx] = temp
        }
      }

      // Rotate captain between GWs
      const captainIdx = (gw.number - 1) % xiPlayers.length
      const vcIdx = (gw.number) % xiPlayers.length

      // Create lineup
      const lineup = await prisma.lineup.upsert({
        where: { teamId_gameweekId: { teamId: team.id, gameweekId: gw.id } },
        create: {
          teamId: team.id,
          gameweekId: gw.id,
          slots: {
            create: [
              ...xiPlayers.map((p, i) => ({
                playerId: p.id,
                slotType: 'XI' as const,
                role: i === captainIdx ? 'CAPTAIN' as const : i === vcIdx ? 'VC' as const : null,
              })),
              ...benchPlayers.map((p, i) => ({
                playerId: p.id,
                slotType: 'BENCH' as const,
                benchPriority: i + 1,
              })),
            ],
          },
        },
        update: {},
      })

      // Create PlayerPerformance + PlayerScore records for completed/active GWs
      if (gw.number <= 3) {
        const gwMatches = matchesByGW[gw.id] || []

        for (const p of [...xiPlayers, ...benchPlayers]) {
          const isXi = xiPlayers.some(x => x.id === p.id)
          const isBat = p.role?.toUpperCase()?.includes('BAT') || p.role?.toUpperCase()?.includes('WK')
          const isBowl = p.role?.toUpperCase()?.includes('BOWL') || p.role?.toUpperCase()?.includes('ALL')

          // Distribute performances across matches in this GW
          let totalFantasyPts = 0
          for (const match of gwMatches) {
            // ~70% chance player participates in any given match
            if (Math.random() > 0.7) continue

            const runs = isBat ? randomInt(0, 75) : randomInt(0, 20)
            const balls = runs > 0 ? randomInt(Math.max(1, Math.floor(runs * 0.6)), Math.floor(runs * 1.5) + 1) : 0
            const fours = Math.floor(runs / 12)
            const sixes = Math.floor(runs / 25)
            const wickets = isBowl ? randomInt(0, 4) : 0
            const overs = isBowl ? randomInt(1, 4) : 0
            const runsConceded = overs > 0 ? randomInt(overs * 4, overs * 12) : 0
            const catches = randomInt(0, 2)
            const fantasyPoints = randomInt(5, 70)
            totalFantasyPts += fantasyPoints

            await prisma.playerPerformance.upsert({
              where: { playerId_matchId: { playerId: p.id, matchId: match.id } },
              create: {
                playerId: p.id,
                matchId: match.id,
                runs, balls, fours, sixes,
                wickets, overs, maidens: 0, runsConceded,
                catches, stumpings: 0,
                fantasyPoints,
                inStartingXI: isXi,
              },
              update: {
                runs, balls, fours, sixes,
                wickets, overs, runsConceded,
                catches, fantasyPoints, inStartingXI: isXi,
              },
            })
          }

          // PlayerScore = sum of fantasy points across all matches in this GW
          // For GW3 (active), scale down
          const points = gw.number === 3 ? Math.floor(totalFantasyPts * 0.6) : totalFantasyPts

          await prisma.playerScore.upsert({
            where: { playerId_gameweekId: { playerId: p.id, gameweekId: gw.id } },
            create: { playerId: p.id, gameweekId: gw.id, totalPoints: points },
            update: { totalPoints: points },
          })
        }

        // Compute team GW total: sum XI + captain bonus
        const captainId = xiPlayers[captainIdx].id
        const xiScores = await prisma.playerScore.findMany({
          where: {
            gameweekId: gw.id,
            playerId: { in: xiPlayers.map(p => p.id) },
          },
        })
        const total = xiScores.reduce((sum, s) => sum + s.totalPoints, 0)
        const captainBonus = xiScores.find(s => s.playerId === captainId)?.totalPoints ?? 0
        const gwTotal = total + captainBonus // captain counted twice = 2x

        await prisma.gameweekScore.upsert({
          where: { teamId_gameweekId: { teamId: team.id, gameweekId: gw.id } },
          create: { teamId: team.id, gameweekId: gw.id, totalPoints: gwTotal },
          update: { totalPoints: gwTotal },
        })
      }
    }

    console.log(`  ✓ ${team.name}: lineups + scores for GW1-3`)
  }

  // 5. Update team total points (cumulative GW1-2)
  for (const team of teams) {
    const gwScores = await prisma.gameweekScore.findMany({
      where: { teamId: team.id, gameweek: { status: 'COMPLETED' } },
    })
    const totalPoints = gwScores.reduce((sum, s) => sum + s.totalPoints, 0)
    const bestGw = gwScores.length > 0 ? Math.max(...gwScores.map(s => s.totalPoints)) : 0
    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints, bestGwScore: bestGw },
    })
  }

  // Summary
  const lineupCount = await prisma.lineup.count()
  const psCount = await prisma.playerScore.count()
  const gsCount = await prisma.gameweekScore.count()
  const perfCount = await prisma.playerPerformance.count()
  console.log(`\nDone! Created:`)
  console.log(`  ${lineupCount} lineups`)
  console.log(`  ${psCount} player scores`)
  console.log(`  ${gsCount} gameweek scores`)
  console.log(`  ${perfCount} player performances`)
  console.log(`\nGW1: COMPLETED, GW2: COMPLETED, GW3: ACTIVE (partial scores)`)
  console.log(`Navigate to /view-lineup/[teamId] to test GW arrow navigation.`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
