import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runScoringPipeline } from '@/lib/scoring/pipeline'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only app admins can trigger scoring
  if (!session.user.isAppAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await runScoringPipeline()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Scoring pipeline error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
