import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

function safeUser(user: { id: string; email: string; name: string | null; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

export async function POST(req: NextRequest) {
  const { email: rawEmail, name, inviteCode, adminSecret, password } = await req.json()
  if (!rawEmail) return Response.json({ error: 'Email required' }, { status: 400 })
  const email = rawEmail.trim().toLowerCase()

  // Case 0: Admin secret provided — bootstrap first admin
  if (adminSecret) {
    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
      return Response.json({ error: 'Invalid admin secret' }, { status: 400 })
    }

    if (password && password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing) {
      // Admin already exists — verify password
      if (existing.passwordHash) {
        if (!password) return Response.json({ error: 'Password required' }, { status: 400 })
        const valid = await bcrypt.compare(password, existing.passwordHash)
        if (!valid) return Response.json({ error: 'Invalid password' }, { status: 401 })
      } else if (password) {
        // Legacy admin without password — set it now
        await prisma.user.update({
          where: { email },
          data: { passwordHash: await bcrypt.hash(password, 10) },
        })
      }

      const user = await prisma.user.update({
        where: { email },
        data: { name: name || undefined, role: 'ADMIN' },
      })
      return Response.json(safeUser(user))
    }

    // New admin creation
    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined
    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        role: 'ADMIN',
        passwordHash,
      },
    })
    return Response.json(safeUser(user))
  }

  // Case 1: Invite code provided — validate and upsert user into league
  if (inviteCode) {
    if (!password) return Response.json({ error: 'Password required' }, { status: 400 })
    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const league = await prisma.league.findUnique({
      where: { inviteCode },
      include: { teams: true },
    })

    if (!league) {
      return Response.json({ error: 'Invalid invite code' }, { status: 400 })
    }

    // Check if user already exists before upsert
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing) {
      // Existing user — verify password
      if (existing.passwordHash) {
        const valid = await bcrypt.compare(password, existing.passwordHash)
        if (!valid) return Response.json({ error: 'Invalid password' }, { status: 401 })
      } else {
        // Legacy user without password — set it now
        await prisma.user.update({
          where: { email },
          data: { passwordHash: await bcrypt.hash(password, 10) },
        })
      }
    }

    const passwordHash = existing ? undefined : await bcrypt.hash(password, 10)

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: name || undefined,
        activeLeagueId: undefined, // preserve existing value on update
      },
      create: {
        email,
        name: name || email.split('@')[0],
        role: 'USER',
        activeLeagueId: league.id,
        passwordHash,
      },
    })

    // Always switch to the league they're joining (they explicitly provided this code)
    if (user.activeLeagueId !== league.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { activeLeagueId: league.id },
      })
      user.activeLeagueId = league.id
    }

    return Response.json(safeUser(user))
  }

  // Case 2: No invite code — check if existing user is already in a league
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { leagues: true, teams: true },
  })

  if (existingUser && (existingUser.role === 'ADMIN' || existingUser.leagues.length > 0 || existingUser.teams.length > 0)) {
    if (!password) return Response.json({ error: 'Password required' }, { status: 400 })
    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    if (existingUser.passwordHash) {
      const valid = await bcrypt.compare(password, existingUser.passwordHash)
      if (!valid) return Response.json({ error: 'Invalid password' }, { status: 401 })
    } else {
      // Legacy user without password — set it now
      await prisma.user.update({
        where: { email },
        data: { passwordHash: await bcrypt.hash(password, 10) },
      })
    }

    // Existing member or admin — allow login without invite code
    const user = await prisma.user.update({
      where: { email },
      data: { name: name || undefined },
    })
    return Response.json(safeUser(user))
  }

  // Case 3: No invite code + not an admin — reject
  return Response.json({ error: 'Invite code required' }, { status: 400 })
}
