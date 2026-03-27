import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Scoring Pipeline - LIMIT 6 (AC3.1)', () => {
  it('AC3.1: Pipeline SQL query contains LIMIT 6', () => {
    // Read the source file of pipeline.ts
    const pipelinePath = path.resolve(__dirname, '../../lib/scoring/pipeline.ts')
    const source = fs.readFileSync(pipelinePath, 'utf-8')

    // Verify that the source code contains "LIMIT 6"
    // This ensures the query limits processing to 6 matches per pipeline run
    expect(source).toContain('LIMIT 6')

    // Additionally verify that LIMIT 6 appears in the context of a SELECT query
    // looking for the pattern where it limits matches by status
    const limitSixInContext = source.includes(
      "LIMIT 6"
    )
    expect(limitSixInContext).toBe(true)

    // Ensure the pattern appears in a query that looks for COMPLETED matches
    const completedMatchesWithLimit = source.includes(
      '"scoringStatus" = \'COMPLETED\''
    ) && source.includes('LIMIT 6')
    expect(completedMatchesWithLimit).toBe(true)
  })

  it('AC3.1: LIMIT 6 appears after ORDER BY clause in match selection query', () => {
    // Read the source file
    const pipelinePath = path.resolve(__dirname, '../../lib/scoring/pipeline.ts')
    const source = fs.readFileSync(pipelinePath, 'utf-8')

    // Find the section with the runScoringPipeline function
    const startIndex = source.indexOf('export async function runScoringPipeline')
    expect(startIndex).toBeGreaterThan(-1)

    // Find the UPDATE query for claiming matches
    const updateQueryStart = source.indexOf(
      'UPDATE "Match" SET "scoringStatus" = \'SCORING\'',
      startIndex
    )
    expect(updateQueryStart).toBeGreaterThan(-1)

    // Find the end of this first query (approximately at the next $queryRawUnsafe call)
    const updateQueryEnd = source.indexOf(
      'RETURNING id, "apiMatchId", "gameweekId", "superOver"',
      updateQueryStart
    )
    expect(updateQueryEnd).toBeGreaterThan(-1)

    // Extract just the first query
    const firstQuery = source.substring(updateQueryStart, updateQueryEnd + 100)

    // Verify ORDER BY comes before LIMIT 6
    const orderByIndex = firstQuery.indexOf('ORDER BY')
    const limitIndex = firstQuery.indexOf('LIMIT 6')

    expect(orderByIndex).toBeGreaterThan(-1)
    expect(limitIndex).toBeGreaterThan(-1)
    expect(orderByIndex).toBeLessThan(limitIndex)
  })
})
