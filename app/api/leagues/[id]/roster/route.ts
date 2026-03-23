import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parse } from 'csv-parse/sync'

interface CsvRow {
  managerEmail: string
  teamName: string
  playerName: string
  purchasePrice: string
}

interface TeamSummary {
  email: string
  teamName: string
  playerCount: number
  status: 'ok' | 'error'
}

// POST /api/leagues/[id]/roster — CSV roster upload (league admin only)
// The CSV is the SOURCE OF TRUTH. Each upload completely replaces
// all teams and rosters for this league.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: leagueId } = await params

    const league = await prisma.league.findUnique({ where: { id: leagueId } })
    if (!league) {
      return Response.json({ error: 'League not found' }, { status: 404 })
    }

    if (league.adminUserId !== session.user.id) {
      return Response.json({ error: 'Only the league admin can upload rosters' }, { status: 403 })
    }

    // Parse CSV from request body
    const csvText = await req.text()
    if (!csvText.trim()) {
      return Response.json({ error: 'Empty CSV body' }, { status: 400 })
    }

    const rows: CsvRow[] = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })

    if (rows.length === 0) {
      return Response.json({ error: 'No data rows in CSV' }, { status: 400 })
    }

    // Group rows by managerEmail
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

    const errors: string[] = []
    const teamSummaries: TeamSummary[] = []

    // Resolve players by name (case-insensitive)
    const allPlayerNames = rows.map((r) => r.playerName?.trim()).filter(Boolean)
    const dbPlayers = await prisma.player.findMany({
      where: {
        fullname: { in: allPlayerNames, mode: 'insensitive' },
      },
    })

    const playerLookup = new Map<string, typeof dbPlayers[0]>()
    for (const p of dbPlayers) {
      playerLookup.set(p.fullname.toLowerCase(), p)
    }

    // Check for duplicate players across teams
    const globalPlayerSet = new Set<string>()
    const duplicatePlayers: string[] = []

    type TeamInsertData = {
      email: string
      teamName: string
      userId: string
      players: { playerId: string; price: number }[]
    }
    const teamsToInsert: TeamInsertData[] = []

    for (const [email, data] of managerMap) {
      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } })
      if (!user) {
        user = await prisma.user.create({ data: { email, name: email.split('@')[0] } })
      }

      const resolvedPlayers: { playerId: string; price: number }[] = []

      for (const p of data.players) {
        const key = p.name.toLowerCase()
        const dbPlayer = playerLookup.get(key)
        if (!dbPlayer) {
          errors.push(`Player not found: "${p.name}" (team: ${data.teamName})`)
          continue
        }

        if (globalPlayerSet.has(dbPlayer.id)) {
          duplicatePlayers.push(`Duplicate player across teams: "${p.name}"`)
          continue
        }
        globalPlayerSet.add(dbPlayer.id)

        resolvedPlayers.push({ playerId: dbPlayer.id, price: p.price })
      }

      // Validate squad size
      if (resolvedPlayers.length < league.minSquadSize) {
        errors.push(
          `${data.teamName} (${email}): squad size ${resolvedPlayers.length} is below minimum ${league.minSquadSize}`
        )
        teamSummaries.push({ email, teamName: data.teamName, playerCount: resolvedPlayers.length, status: 'error' })
        continue
      }
      if (resolvedPlayers.length > league.maxSquadSize) {
        errors.push(
          `${data.teamName} (${email}): squad size ${resolvedPlayers.length} exceeds maximum ${league.maxSquadSize}`
        )
        teamSummaries.push({ email, teamName: data.teamName, playerCount: resolvedPlayers.length, status: 'error' })
        continue
      }

      teamsToInsert.push({
        email,
        teamName: data.teamName,
        userId: user.id,
        players: resolvedPlayers,
      })

      teamSummaries.push({ email, teamName: data.teamName, playerCount: resolvedPlayers.length, status: 'ok' })
    }

    if (duplicatePlayers.length > 0) {
      errors.push(...duplicatePlayers)
    }

    // If any team had errors, return without modifying DB
    if (errors.length > 0) {
      return Response.json({ teams: teamSummaries, errors }, { status: 400 })
    }

    // CSV is the SOURCE OF TRUTH — wipe and rebuild all teams in this league
    await prisma.$transaction(async (tx) => {
      // 1. Delete all existing team players for this league
      await tx.teamPlayer.deleteMany({ where: { leagueId } })

      // 2. Delete all existing teams for this league
      await tx.team.deleteMany({ where: { leagueId } })

      // 3. Create fresh teams and assign players from the CSV
      for (const teamData of teamsToInsert) {
        const team = await tx.team.create({
          data: {
            name: teamData.teamName,
            userId: teamData.userId,
            leagueId,
          },
        })

        await tx.teamPlayer.createMany({
          data: teamData.players.map((p) => ({
            teamId: team.id,
            playerId: p.playerId,
            leagueId,
            purchasePrice: p.price,
          })),
        })
      }

      // 4. Admin stays as the original creator — do NOT change adminUserId
      //    The admin may or may not be in the CSV (they manage but may not play)
    })

    return Response.json({
      teams: teamSummaries,
      errors: [],
      message: `Roster uploaded successfully. ${teamsToInsert.length} teams with ${teamsToInsert.reduce((a, t) => a + t.players.length, 0)} total players.`,
    })
  } catch (error) {
    console.error('POST /api/leagues/[id]/roster error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
