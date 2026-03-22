import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from './db'

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
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.role = (user as any).role
      }
      return token
    },
  },
})
