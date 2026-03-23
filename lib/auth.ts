import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from './db'

// Re-verify user ID against DB every 30 minutes to handle DB resets
const RESYNC_INTERVAL_MS = 30 * 60 * 1000

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        const email = credentials.email as string

        // Find or create user (dev convenience — no password in Phase 1)
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, name: email.split('@')[0], role: 'USER' },
        })

        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    session({ session, token }) {
      if (token?.sub) session.user.id = token.sub
      if (token?.role) (session.user as any).role = token.role
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.email = user.email
        token.role = (user as any).role
        token.lastVerified = Date.now()
      }

      // Periodically re-verify user ID against DB to handle DB resets/re-seeds.
      // If the DB was wiped and re-seeded, the user may exist with a new ID
      // while the JWT still holds the old one — causing empty query results.
      const lastVerified = (token.lastVerified as number) || 0
      if (token.email && Date.now() - lastVerified > RESYNC_INTERVAL_MS) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email as string },
          })
          if (dbUser) {
            if (dbUser.id !== token.sub) {
              token.sub = dbUser.id
              token.role = dbUser.role
            }
            token.lastVerified = Date.now()
          } else {
            // User no longer exists in DB — invalidate token
            token.sub = undefined
            token.role = undefined
          }
        } catch {
          // DB unreachable — keep existing token, try again next cycle
        }
      }

      return token
    },
  },
})
