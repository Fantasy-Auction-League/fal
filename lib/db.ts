import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
  if (process.env.VERCEL) {
    const { Pool } = require('@neondatabase/serverless')
    const { PrismaNeon } = require('@prisma/adapter-neon')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    return new PrismaClient({ adapter: new PrismaNeon(pool) })
  }
  return new PrismaClient()
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
