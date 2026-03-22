import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from './db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        // Phase 1: simple email-based auth (passwords added later)
        if (user) return { id: user.id, email: user.email, name: user.name }
        return null
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (token?.sub) session.user.id = token.sub
      return session
    },
    jwt({ token, user }) {
      if (user) token.sub = user.id
      return token
    },
  },
})
