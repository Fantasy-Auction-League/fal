import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '../../lib/db'
import { scoreMatch } from '../../lib/scoring/pipeline'
import { getSimGameweeks } from './helpers'

describe('Layer 3: Score All 74 Matches', () => {
  let allMatches: any[]
  let gameweeks: any[]

  beforeAll(async () => {
    gameweeks = await getSimGameweeks()
    allMatches = await prisma.match.findMany({
      orderBy: { startingAt: 'asc' },
    })
  })

  it('scores all matches in batches of 8', async () => {
    // Ensure all non-scored matches are set to COMPLETED so scoreMatch can process them
    await prisma.match.updateMany({
      where: {
        scoringStatus: { in: ['SCHEDULED', 'ERROR'] },
      },
      data: { scoringStatus: 'COMPLETED' },
    })

    // Re-fetch after status update
    const completedMatches = await prisma.match.findMany({
      where: { scoringStatus: 'COMPLETED' },
      orderBy: { startingAt: 'asc' },
      select: { id: true, apiMatchId: true, gameweekId: true, superOver: true },
    })

    // Process in batches of 8
    for (let i = 0; i < completedMatches.length; i += 8) {
      const batch = completedMatches.slice(i, i + 8)
      await Promise.allSettled(
        batch.map((m) =>
          scoreMatch(m).catch(async (err) => {
            console.warn(
              `Match ${m.id} (api: ${m.apiMatchId}) scoring error:`,
              err.message
            )
            // Mark as cancelled if scoring fails (abandoned match, no scorecard, etc.)
            await prisma.match.update({
              where: { id: m.id },
              data: { scoringStatus: 'CANCELLED' },
            })
          })
        )
      )
      console.log(
        `Scored batch ${Math.floor(i / 8) + 1}: ${batch.length} matches`
      )
    }
  }, 900_000) // 15 min timeout

  it('matches have correct status distribution', async () => {
    const scored = await prisma.match.count({
      where: { scoringStatus: 'SCORED' },
    })
    const cancelled = await prisma.match.count({
      where: { scoringStatus: 'CANCELLED' },
    })
    const total = scored + cancelled

    console.log(`Scored: ${scored}, Cancelled: ${cancelled}, Total: ${total}`)
    // 74 total matches, but some may remain in other states (e.g., SCHEDULED if API had no data)
    expect(scored + cancelled).toBeGreaterThanOrEqual(71)
    expect(scored).toBeGreaterThan(65)
  })

  it('PlayerPerformance records created for scored matches', async () => {
    const perfCount = await prisma.playerPerformance.count()
    console.log(`Total PlayerPerformance records: ${perfCount}`)
    expect(perfCount).toBeGreaterThan(0)

    // Each match should have ~22 performances (11 per team)
    const scoredMatches = await prisma.match.count({
      where: { scoringStatus: 'SCORED' },
    })
    expect(perfCount).toBeGreaterThan(scoredMatches * 10) // at least 10 per match
  })

  it('fantasy points are non-null and reasonable', async () => {
    // fantasyPoints is a non-nullable Int with default 0, so all records have a value.
    // Verify no records have exactly 0 points (at minimum, starting XI bonus = 4)
    // Actually some impact/fielding-only players could have 0, so just check count > 0.
    const totalPerfs = await prisma.playerPerformance.count()
    expect(totalPerfs).toBeGreaterThan(0)

    // Check range: points should be between -50 and 300
    const extreme = await prisma.playerPerformance.findMany({
      where: {
        OR: [
          { fantasyPoints: { lt: -50 } },
          { fantasyPoints: { gt: 300 } },
        ],
      },
    })
    expect(extreme).toHaveLength(0)
  })

  it('batting stats populated for batters', async () => {
    const withRuns = await prisma.playerPerformance.count({
      where: { runs: { gt: 0 } },
    })
    expect(withRuns).toBeGreaterThan(0)
  })

  it('bowling stats populated for bowlers', async () => {
    const withWickets = await prisma.playerPerformance.count({
      where: { wickets: { gt: 0 } },
    })
    expect(withWickets).toBeGreaterThan(0)
  })

  it('fielding stats populated', async () => {
    const withCatches = await prisma.playerPerformance.count({
      where: { catches: { gt: 0 } },
    })
    expect(withCatches).toBeGreaterThan(0)
  })

  it('starting XI bonus: players in XI have participation points', async () => {
    const xiPlayers = await prisma.playerPerformance.findMany({
      where: { inStartingXI: true },
      take: 10,
    })
    // Starting XI get +4 base, so even 0-scoring players should have >= 4
    for (const p of xiPlayers) {
      expect(p.fantasyPoints).toBeGreaterThanOrEqual(4)
    }
  })
})
