import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, name } = await req.json()
  if (!email) return Response.json({ error: 'Email required' }, { status: 400 })

  const user = await prisma.user.upsert({
    where: { email },
    update: { name: name || undefined },
    create: { email, name: name || email.split('@')[0], role: 'USER' },
  })

  return Response.json(user)
}
