import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
  if (process.env.VERCEL) {
    const { neon } = require('@neondatabase/serverless')
    const { PrismaNeon } = require('@prisma/adapter-neon')
    // Use DATABASE_URL_UNPOOLED for direct connection (avoids channel_binding issues)
    const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
    // Strip channel_binding parameter which causes issues with the serverless driver
    const cleanUrl = connectionString?.replace(/[&?]channel_binding=[^&]*/, '') || ''
    const sql = neon(cleanUrl)
    return new PrismaClient({ adapter: new PrismaNeon(sql) })
  }
  return new PrismaClient()
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
