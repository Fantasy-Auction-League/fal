import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  retries: 0,
  workers: 2,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    viewport: { width: 393, height: 852 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    {
      name: 'layer0-admin',
      testMatch: 'layer0.spec.ts',
      grep: /@admin/,
      use: { storageState: 'tests/simulation/playwright/.auth/admin.json' },
      dependencies: ['setup'],
    },
    {
      name: 'layer0-user',
      testMatch: 'layer0.spec.ts',
      grep: /@user/,
      use: { storageState: 'tests/simulation/playwright/.auth/user1.json' },
      dependencies: ['setup'],
    },
    {
      name: 'layer0-noauth',
      testMatch: 'layer0.spec.ts',
      grep: /@noauth/,
      use: { storageState: undefined },
    },
  ],
})
