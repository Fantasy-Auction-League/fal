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

    // Parse CSV from request body (text/csv or plain text)
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

    // Build a lookup: lowercase name -> player
    const playerLookup = new Map<string, typeof dbPlayers[0]>()
    for (const p of dbPlayers) {
      playerLookup.set(p.fullname.toLowerCase(), p)
    }

    // Check for duplicate players across teams
    const globalPlayerSet = new Set<string>()
    const duplicatePlayers: string[] = []

    // Prepare data for each manager
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

        // Check cross-team uniqueness
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

    // Atomic transaction: delete existing TeamPlayers for this league, upsert teams, insert new TeamPlayers
    await prisma.$transaction(async (tx) => {
      // Delete existing team players for this league
      await tx.teamPlayer.deleteMany({ where: { leagueId } })

      for (const teamData of teamsToInsert) {
        // Find or create team for this user in this league
        let team = await tx.team.findFirst({
          where: { leagueId, userId: teamData.userId },
        })

        if (team) {
          // Update name if changed
          if (team.name !== teamData.teamName) {
            team = await tx.team.update({
              where: { id: team.id },
              data: { name: teamData.teamName },
            })
          }
        } else {
          team = await tx.team.create({
            data: {
              name: teamData.teamName,
              userId: teamData.userId,
              leagueId,
            },
          })
        }

        // Insert team players
        await tx.teamPlayer.createMany({
          data: teamData.players.map((p) => ({
            teamId: team.id,
            playerId: p.playerId,
            leagueId,
            purchasePrice: p.price,
          })),
        })
      }
    })

    return Response.json({ teams: teamSummaries, errors: [] })
  } catch (error) {
    console.error('POST /api/leagues/[id]/roster error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
