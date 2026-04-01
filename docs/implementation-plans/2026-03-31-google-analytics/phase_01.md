# Google Analytics Integration — Phase 1: GA4 Script Setup

**Goal:** Add Google Analytics 4 to the FAL app with automatic page view tracking.

**Architecture:** Use `@next/third-parties/google` (official Next.js GA integration) in the root layout. Page views are tracked automatically via browser history change detection. Measurement ID stored as `NEXT_PUBLIC_GA_ID` env var.

**Tech Stack:** `@next/third-parties/google`, GA4 (gtag.js)

**Scope:** 2 phases (this is phase 1 of 2)

**Codebase verified:** 2026-03-31

---

## Acceptance Criteria Coverage

### ga.AC1: GA4 script loads on every page
- **ga.AC1.1:** GA4 script tag present in HTML output on all pages
- **ga.AC1.2:** Measurement ID loaded from env var, not hardcoded
- **ga.AC1.3:** Script loads asynchronously (no blocking page render)

### ga.AC2: Page views tracked automatically
- **ga.AC2.1:** Navigation between pages sends pageview events to GA4
- **ga.AC2.2:** Page views include correct page path

---

<!-- START_TASK_1 -->
### Task 1: Install @next/third-parties

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install the package**

```bash
npm install @next/third-parties@latest
```

**Step 2: Verify installation**

```bash
node -e "require('@next/third-parties/google'); console.log('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @next/third-parties for Google Analytics"
```

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add NEXT_PUBLIC_GA_ID to environment config

**Files:**
- Modify: `.env.example` (add GA env var documentation)
- Modify: `.env.local` (add actual measurement ID)

**Step 1: Add to .env.example**

Append after the last line:

```env
# Google Analytics 4
NEXT_PUBLIC_GA_ID="G-XXXXXXXXXX"
```

**Step 2: Add to .env.local**

Append:

```env
NEXT_PUBLIC_GA_ID=G-W4FHCVQGD0
```

**Step 3: Add to Vercel production env vars**

```bash
vercel env add NEXT_PUBLIC_GA_ID production <<< "G-W4FHCVQGD0"
```

Note: `NEXT_PUBLIC_` prefix makes this available client-side. The value is inlined at build time — Vercel needs it as an env var, and a redeploy is required after adding.

**Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add NEXT_PUBLIC_GA_ID to env config"
```

Do NOT commit `.env.local`.

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Add GoogleAnalytics component to root layout

**Verifies:** ga.AC1.1, ga.AC1.2, ga.AC1.3

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Add the GA component**

Add import at top of `app/layout.tsx`:

```typescript
import { GoogleAnalytics } from '@next/third-parties/google'
```

Add the component inside the `<html>` tag, after `<body>`:

```tsx
<html lang="en" className={jakartaSans.variable}>
  <body>
    <Providers>{children}</Providers>
  </body>
  {process.env.NEXT_PUBLIC_GA_ID && (
    <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
  )}
</html>
```

The conditional ensures:
- No GA script in dev if env var is missing
- No errors if env var is unset
- Script loads async automatically (handled by the component)

**Step 2: Verify locally**

```bash
npm run dev
```

Open http://localhost:3000, inspect page source (View Source or DevTools Elements). Search for `gtag` — should see the Google Analytics script tag with `G-W4FHCVQGD0`.

**Step 3: Verify page views in GA4**

1. Open https://analytics.google.com
2. Go to Real-time report
3. Navigate between pages in the app
4. Confirm page_view events appear in real-time

**Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add Google Analytics 4 to root layout"
```

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add GA info to environment variables section**

Add to the env var list:

```
- `NEXT_PUBLIC_GA_ID` — Google Analytics 4 measurement ID (client-side, inlined at build time)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add GA env var to CLAUDE.md"
```

<!-- END_TASK_4 -->
