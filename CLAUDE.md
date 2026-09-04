# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Wazu Finance** — multi-user budget tracking app. React Native + Expo (SDK 57, TypeScript strict) + Supabase (Postgres, Auth, RLS, Realtime). The full French-language spec is [spec-app-budget.md](spec-app-budget.md); it is the source of truth for features, data model, and V1 scope.

## Commands

```bash
npm start                # expo start
npm run android          # expo start --android
npm run web              # expo start --web
npm run lint             # expo lint (eslint-config-expo)
npx tsc --noEmit         # typecheck

npm run test:db          # pgTAP tests — needs Docker Desktop running + `npx supabase start`
npx supabase start       # local stack: applies all migrations from scratch
npx supabase stop
npx expo export --platform android --output-dir <dir>   # bundle check, no device needed

npx supabase db push                # apply pending migrations to the linked project
npx supabase migration list --linked  # compare local vs remote migration state
npx supabase gen types typescript --linked > src/types/database.ts
```

The project is linked to Supabase ref `ozwltxywsqvgmefuqvfv`. Migration files must keep the CLI's `<14-digit timestamp>_name.sql` naming or `db push` skips them.

Database tests are pgTAP files under `supabase/tests/`, run against the local stack. There is no JS test runner yet.

`handle_new_user()` runs inside Supabase Auth's signup transaction; when it fails the client only sees an opaque `Database error saving new user`. Any change to `users`, `budget_groups`, or `account_memberships` must be re-run against `npm run test:db`.

Requires `.env` (copy from `.env.example`) with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. [src/lib/env.ts](src/lib/env.ts) throws at startup if either is missing. Env vars are inlined at build time — after editing `.env`, restart with `npx expo start --clear`.

## Expo version discipline

Per [AGENTS.md](AGENTS.md): read https://docs.expo.dev/versions/v57.0.0/ before writing Expo code. SDK 57 / expo-router v6 / React 19.2 APIs differ from older tutorials — notably `Stack.Protected guard={…}` for route guarding.

## Architecture

Routes live under `src/app/` (expo-router, `src/` root configured via `tsconfig` path alias `@/*`).

```
src/app/_layout.tsx        AuthProvider + Stack.Protected session guard
src/app/(auth)/            sign-in, sign-up  — reachable only when session === null
src/app/(app)/             dashboard         — reachable only when session !== null
src/lib/supabase.ts        client, AsyncStorage persistence, AppState auto-refresh
src/providers/             AuthProvider (session state + signIn/signUp/signOut)
supabase/migrations/       schema, RLS policies, seed — apply in numeric order
```

**Navigation never redirects manually after auth.** `signIn`/`signUp` only call Supabase; `onAuthStateChange` updates the provider, and the `Stack.Protected` guards in the root layout swap route groups. Adding a `router.replace()` after login fights the guard.

Neither auth route is named `index`, so `(app)/index.tsx` owns `/` without a route conflict.

## Core data model decision

**A personal account is a `budget_group` with `is_personal = true` and a single member.** There is no separate "personal" table or code path. All access flows through `account_memberships`, so one set of RLS policies covers personal and shared budgets. Do not introduce a parallel personal-account model.

The `handle_new_user()` trigger on `auth.users` creates profile + personal group + `owner` membership in the signup transaction, so the app never sees a user without a group. `account_memberships_guard_personal` enforces the one-member invariant.

Tables: `users`, `budget_groups`, `account_memberships`, `categories` (`group_id IS NULL` = read-only global default), `transactions`, `budgets`, `savings_goals`, `group_invitations`.

## RLS

Security lives in the database, not the client. Every policy resolves to "is the caller a member of this group?".

`is_group_member()` / `is_group_owner()` / `shares_group_with()` are `SECURITY DEFINER` **on purpose**: a policy on `account_memberships` that queries `account_memberships` recurses infinitely. Keep new membership-dependent policies going through these helpers.

Joining a group goes through the `join_group_with_code()` RPC, not a direct insert — the joining user cannot yet read the group's invitations.

## V1 scope (decided — do not re-litigate)

In: manual transaction entry, per-category budgets with in-app visual alerts, savings goals, CSV/PDF export (after the main screens, before notifications).

Out, with reasons:
- **Bank connection** — needs an aggregator (Plaid / Powens), PSD2 compliance, recurring API cost. Separate project after V1 is validated by usage.
- **Multi-currency** — no identified need; adding a `currency` column to `transactions` and `budgets` later is cheap, so don't complicate the schema now.
- **Push notifications** — needs Expo Notifications, iOS/Android permissions, and a Supabase edge function checking thresholds. In-app alerts suffice for V1.

## UX constraints that shape the code

- **Expense entry in ≤3 taps** from the main screen (amount, category, confirm). Retention depends on it — it drives navigation and form design.
- Transaction history must be paginated (`transactions_group_occurred_idx` covers the filter + sort).
- Forms default to smart values: last-used category, today's date.
- Shared budgets sync live via Supabase Realtime (`transactions`, `budgets`, `savings_goals`, `account_memberships` are in the publication).

## Conventions

- File names kebab-case; components PascalCase.
- User-facing strings in French, code identifiers in English. SQL comments in French, matching the spec.
- Supabase errors are mapped to French text by code in [src/lib/auth-errors.ts](src/lib/auth-errors.ts) — map codes, never message strings, which change between versions.
- TypeScript strict, no `any`. `src/types/database.ts` is **generated** — never edit it by hand. After any migration: `npx supabase gen types typescript --linked > src/types/database.ts`, then restore the header comment and the enum aliases at the end of the file.
