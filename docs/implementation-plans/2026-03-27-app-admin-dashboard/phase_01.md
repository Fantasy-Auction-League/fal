# App Admin Dashboard Implementation Plan

**Goal:** Build a platform-level admin dashboard with Import Scores, Sync Player Teams, and live mid-gameweek scores

**Architecture:** ENV-var-based app admin role (no schema change), JWT token integration, extend existing APIs rather than creating new routes where possible

**Tech Stack:** Next.js 15, NextAuth v5, Prisma 6, TypeScript, Vercel Hobby tier

**Scope:** 5 phases from design

**Codebase verified:** 2026-03-27

---

## Acceptance Criteria Coverage

This phase implements:

### app-admin-dashboard.AC1: App Admin Access Control
- **app-admin-dashboard.AC1.1 Success:** App admin users (viiveek@gmail.com, shaheeldholakia@gmail.com) can access scoring operations
- **app-admin-dashboard.AC1.2 Success:** `isAppAdmin` boolean is available in session token for client-side nav decisions
- **app-admin-dashboard.AC1.3 Failure:** Non-app-admin users receive 403 Forbidden when calling scoring endpoints
- **app-admin-dashboard.AC1.4 Failure:** Users with `UserRole.ADMIN` (league admin) who are NOT in APP_ADMIN_EMAILS receive 403 on scoring endpoints

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create `lib/app-admin.ts` helper

**Verifies:** app-admin-dashboard.AC1.1

**Files:**
- Create: `lib/app-admin.ts`

**Implementation:**

```typescript
// lib/app-admin.ts

export function isAppAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const emails = (process.env.APP_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
  return emails.includes(email.toLowerCase())
}
```

Takes email directly (not session) so it can be called from both server components and the JWT callback.

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

**Commit:** `feat: add isAppAdmin helper for platform-level access control`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add `isAppAdmin` to JWT token and session

**Verifies:** app-admin-dashboard.AC1.2

**Files:**
- Modify: `types/next-auth.d.ts` — add `isAppAdmin: boolean` to Session.user (line 7) and JWT (line 22)
- Modify: `lib/auth.ts` — set `token.isAppAdmin` in jwt callback (after line 43), expose in session callback (after line 34)

**Implementation:**

In `types/next-auth.d.ts`, add `isAppAdmin: boolean` to both interfaces:

```typescript
// Session.user
interface Session {
  user: {
    id: string
    role: 'USER' | 'ADMIN'
    activeLeagueId: string | null
    isAppAdmin: boolean
  } & DefaultSession['user']
}

// JWT
interface JWT {
  role: 'USER' | 'ADMIN'
  activeLeagueId: string | null
  isAppAdmin: boolean
}
```

In `lib/auth.ts`:

1. Add import at top: `import { isAppAdmin } from './app-admin'`

2. In the jwt callback, after `token.lastVerified = Date.now()` (line 43), add:
```typescript
token.isAppAdmin = isAppAdmin(user.email)
```

3. In the session callback, after `session.user.activeLeagueId = token.activeLeagueId ?? null` (line 34), add:
```typescript
session.user.isAppAdmin = (token.isAppAdmin as boolean) ?? false
```

4. In the resync block (lines 52-66), after updating `token.role`, also refresh:
```typescript
token.isAppAdmin = isAppAdmin(token.email as string)
```

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

**Commit:** `feat: expose isAppAdmin in JWT token and session`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Update scoring routes to use `isAppAdmin`

**Verifies:** app-admin-dashboard.AC1.3, app-admin-dashboard.AC1.4

**Files:**
- Modify: `app/api/scoring/import/route.ts:12-13`
- Modify: `app/api/scoring/recalculate/[matchId]/route.ts:14-16`
- Modify: `app/api/scoring/cancel/[matchId]/route.ts:14-16`

**Implementation:**

In each of the 3 files, replace:
```typescript
if ((session.user as any).role !== 'ADMIN') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

With:
```typescript
if (!session.user.isAppAdmin) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

No new imports needed — `isAppAdmin` is now on the session type from Task 2.

**Note on `UserRole.ADMIN` deprecation:** After this change, the `ADMIN` value in the `UserRole` Prisma enum is no longer used for scoring route authorization. It remains in the schema for `League.adminUserId` (league-level admin) and login flow (`role === 'ADMIN'` allows login without invite code). Scoring access is now controlled entirely by `APP_ADMIN_EMAILS` env var via the JWT `isAppAdmin` field. No schema change needed — the enum value is still referenced by other code paths.

**Testing:**
Tests must verify:
- app-admin-dashboard.AC1.3: Non-app-admin user calling `/api/scoring/import` receives 403
- app-admin-dashboard.AC1.4: League admin (UserRole.ADMIN) NOT in APP_ADMIN_EMAILS receives 403

Follow project testing patterns (integration test with direct Prisma setup, namespaced test data).

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

Run: `npm run test:unit`
Expected: All existing tests pass

**Commit:** `feat: restrict scoring operations to app admins via session token`
<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->
