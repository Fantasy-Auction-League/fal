# FAL Vercel Deployment Plan

**Date:** 2026-03-24
**Goal:** Deploy FAL to Vercel with automated CI testing on every push. Everything free tier.

---

## Prerequisites

- Vercel CLI installed (`vercel` command available)
- GitHub repo: `Fantasy-Auction-League/fal`
- Vercel account (Hobby tier — free)
- GitHub Actions (free for public repos, 2000 min/month for private)

---

## Phase 1: One-Time Setup (CLI)

### Step 1: Link repo to Vercel

```bash
cd /Users/viiveeksankar/workspace/fal
vercel link
```

Follow prompts: select your Vercel account, link to existing project or create new one named `fal`.

### Step 2: Provision Vercel Postgres

```bash
vercel env pull .env.vercel.local  # pulls any existing env vars
vercel postgres create fal-db --region iad1
```

Or via Vercel Dashboard: Project → Storage → Create Database → Postgres → Hobby (free).

This auto-sets `DATABASE_URL`, `POSTGRES_URL`, etc. in Vercel env vars.

### Step 3: Set environment variables

```bash
# Generate a strong auth secret
echo $(openssl rand -base64 32)

# Set each env var in Vercel
vercel env add AUTH_SECRET production        # paste the generated secret
vercel env add SPORTMONKS_API_TOKEN production  # your SportMonks token
vercel env add SPORTMONKS_SEASON_ID production  # 1795
vercel env add SPORTMONKS_LEAGUE_ID production  # 1
vercel env add ADMIN_SECRET production       # fal-admin-2026
```

**Note:** `DATABASE_URL`, `DIRECT_URL`, and `CRON_SECRET` are auto-managed by Vercel. `AUTH_URL` is auto-detected by Auth.js in production.

### Step 4: First deploy

```bash
vercel --prod
```

This triggers: `npm install` → `prisma generate` → `next build` → deploy.

### Step 5: Push database schema

```bash
# Pull production env vars locally
vercel env pull .env.production.local

# Push schema to production Neon DB
npx dotenv -e .env.production.local -- npx prisma db push
```

### Step 6: Seed production data

```bash
# Seed IPL 2026 players
npx dotenv -e .env.production.local -- npx tsx scripts/seed-players.ts

# Seed IPL 2026 fixtures
npx dotenv -e .env.production.local -- npx tsx scripts/seed-fixtures.ts
```

### Step 7: Bootstrap admin

1. Go to `https://fal.vercel.app/login` (your Vercel URL)
2. Click "Admin setup?" at bottom
3. Enter your email + admin secret (`fal-admin-2026`) + password
4. You're now admin — create your league, upload roster CSV, share invite code

---

## Phase 2: GitHub Action — CI Tests on Every Push

Create `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  # Job 1: Run unit/integration tests (no deploy needed)
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test

  # Job 2: Deploy preview + run Playwright against it
  e2e-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci

      # Install Playwright browsers
      - run: npx playwright install chromium

      # Deploy preview to Vercel
      - name: Deploy to Vercel Preview
        id: deploy
        run: |
          npm i -g vercel
          URL=$(vercel deploy --token ${{ secrets.VERCEL_TOKEN }} 2>&1 | tail -1)
          echo "url=$URL" >> $GITHUB_OUTPUT

      # Wait for deployment to be ready
      - name: Wait for deployment
        run: |
          URL="${{ steps.deploy.outputs.url }}"
          for i in {1..30}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
            if [ "$STATUS" = "200" ]; then echo "Ready!"; exit 0; fi
            echo "Waiting... ($STATUS)"
            sleep 5
          done
          echo "Timeout" && exit 1

      # Run Playwright tests against Vercel preview
      - name: Run Playwright tests
        env:
          TEST_BASE_URL: ${{ steps.deploy.outputs.url }}
        run: npx playwright test --config tests/simulation/playwright/playwright.config.ts

      # Upload test results on failure
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: test-results/
          retention-days: 7
```

### GitHub Secrets to set

Go to GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | How to get it |
|---|---|
| `VERCEL_TOKEN` | `vercel tokens create` or Vercel Dashboard → Settings → Tokens |
| `VERCEL_ORG_ID` | In `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | In `.vercel/project.json` after `vercel link` |

---

## Phase 3: Automated Seeding on Deploy

Add a post-deploy script that runs seeds idempotently. Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/scoring/cron",
      "schedule": "0 0 * * *"
    }
  ],
  "buildCommand": "prisma generate && next build"
}
```

For DB schema push on deploy, add to `package.json`:

```json
"vercel-build": "prisma generate && prisma db push --accept-data-loss && next build"
```

**Note:** `--accept-data-loss` is needed because `db push` in production may need to alter columns. For a brand new DB this is safe. After initial setup, switch to `prisma migrate deploy` for safer migrations.

---

## Cost Summary

| Service | Tier | Cost | Limits |
|---|---|---|---|
| **Vercel Hosting** | Hobby | Free | 100GB bandwidth, serverless functions |
| **Vercel Postgres** | Hobby | Free | 256MB storage, 60 compute hours/mo |
| **GitHub Actions** | Free (public) / 2000 min (private) | Free | ~1000 test runs/month |
| **SportMonks API** | Major | €29/mo | Only external cost |
| **Total** | | **€0/mo** (excluding SportMonks) | |

---

## Post-Deploy Verification

After first deploy, verify:

1. `https://your-app.vercel.app/login` — login page loads
2. Admin can log in with admin secret
3. Create league, upload roster CSV
4. Users can sign up with invite code + password
5. Lineup page loads with players
6. Cron endpoint: `curl https://your-app.vercel.app/api/scoring/cron` (should return 401 without bearer token — correct)

---

## Running Tests Against Production

### Local (manual)
```bash
TEST_BASE_URL=https://your-app.vercel.app npm run test:layer0
```

### CI (automatic)
Every push to `main` triggers the GitHub Action which:
1. Runs unit tests
2. Deploys a Vercel preview
3. Runs Playwright tests against the preview
4. Reports results in the PR / commit status

---

## Rollback

If a deploy breaks production:
```bash
vercel rollback
```
Or via Vercel Dashboard → Deployments → click previous deployment → Promote to Production.
