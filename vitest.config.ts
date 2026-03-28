import { defineConfig } from 'vitest/config'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '.env.local') })

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/simulation/**', 'node_modules/**'],
    testTimeout: 30000,
    // Run files that call aggregateGameweek() sequentially to prevent
    // cross-file interference (ensureLineups processes ALL teams globally)
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
