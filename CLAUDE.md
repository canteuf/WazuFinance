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
npm test                 # jest-expo — modules purs uniquement (money, dates, erreurs)

npm run test:db          # pgTAP tests — needs Docker Desktop running + `npx supabase start`
npx supabase start       # local stack: applies all migrations from scratch
npx supabase stop
npx expo export --platform android --output-dir <dir>   # bundle check, no device needed

npx supabase db push                # apply pending migrations to the linked project
npx supabase migration list --linked  # compare local vs remote migration state
npx supabase gen types typescript --linked > src/types/database.ts
```

The project is linked to Supabase ref `ozwltxywsqvgmefuqvfv`. Migration files must keep the CLI's `<14-digit timestamp>_name.sql` naming or `db push` skips them.

Database tests are pgTAP files under `supabase/tests/`, run against the local stack. `npm test` (Jest) covers only framework-free modules under `src/lib/` — no component or hook has a JS test yet.

`handle_new_user()` runs inside Supabase Auth's signup transaction; when it fails the client only sees an opaque `Database error saving new user`. Any change to `users`, `budget_groups`, or `account_memberships` must be re-run against `npm run test:db`.

Requires `.env` (copy from `.env.example`) with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. [src/lib/env.ts](src/lib/env.ts) throws at startup if either is missing. Env vars are inlined at build time — after editing `.env`, restart with `npx expo start --clear`.

## Expo version discipline

Per [AGENTS.md](AGENTS.md): read https://docs.expo.dev/versions/v57.0.0/ before writing Expo code. SDK 57 / expo-router v6 / React 19.2 APIs differ from older tutorials — notably `Stack.Protected guard={…}` for route guarding.

**Never run `npm audit fix --force`.** npm resolves an advisory by picking whatever version falls outside the vulnerable range, regardless of the SDK: on 2026-09-10 it downgraded `expo` to 46 and `expo-router` to 5 — eleven majors back — and the app could no longer start. Align versions with `npx expo install --fix` only. The moderate advisories `npm audit` reports come from two packages pulled in by the SDK itself (`decode-uri-component` through react-navigation, `uuid` through Expo's tooling); they have no npm-side fix that keeps SDK 57, and they go away when Expo ships patch releases, which `npx expo install --fix` picks up.

Windows: if `npm ci` or `npm install` fails with `EPERM` on `@unrs/resolver-binding-win32-x64-msvc/*.node`, VS Code's ESLint server has that native module loaded. Run "ESLint: Restart ESLint Server" or move the folder out of `node_modules` — never kill the VS Code extension host, which Claude Code runs inside.

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

Tables: `users`, `budget_groups`, `account_memberships`, `categories` (`group_id IS NULL` = read-only global default), `transactions`, `budgets`, `savings_goals`, `group_invitations`, `activity_log` (written by triggers only — see below).

**The budget period is not the calendar month.** `budget_groups.period_start_day` (1–28, `check`-constrained) sets the day a period starts, so a budget can follow the payday. It sits on the group, not the user, so both members of a shared budget see the same figures — and `budget_groups_update_owner` already restricts who can change it. The 28 cap exists because the 29th, 30th and 31st don't occur every month. Bounds are computed client-side by `periodBounds()`: the server is UTC, and `date_trunc('month', now())` reports the wrong period during the first hours of a rollover day.

## Data access layers

`screens → hooks → src/data/ → supabase`, one-way dependencies. A screen never imports `supabase` directly; `src/data/` never imports React. TanStack Query holds the cache; keys all live in `src/lib/query-keys.ts`.

Invalidating a key only reaches keys it's a prefix of, never the other way round. Invalidate `queryKeys.transactions()` (the root) to reach both the recent list and the detail records; invalidating a leaf like `recentTransactions(groupId)` leaves an open detail record stale. Always invalidate by the widest prefix the mutation affects.

Every read on the dashboard shares one set of bounds from `periodBounds()`: `period_summary` for the current period, the same function again for the previous one (the comparison), `category_breakdown` for the split, and `listRecent` for the list. Deriving bounds separately in a component is how the headline total and the bars start describing different periods.

`listRecent` takes its bounds as required arguments for that reason. An unbounded recent list put last period's rent under "Solde de septembre", and the row then vanished when the user tapped "Tout voir" — the history opens on `DEFAULT_FILTERS`, whose period is the current one. Both ends now agree, so "Tout voir" only ever widens the set.

`category_breakdown` inner-joins `categories`, so uncategorised expenses are absent from it while still counting in `period_summary().expense`. Bar proportions are therefore computed against the sum of the slices, never against `expense` — otherwise the bars never reach 100%.

Budgets read through `category_breakdown` rather than their own aggregate: the
RPC already defines "spend for the period", and a second definition alongside
it would be one more thing to keep in agreement. The client only matches by
`category_id` and divides — the summation stays in Postgres. `budget-progress.ts`
holds the thresholds and the sort order, so they are covered by Jest rather
than buried in JSX.

`queryKeys.budgets(groupId)` sits outside `['transactions']`, unlike
`periodSummary` and `categoryBreakdown`. Those derive from transactions and must
ride their invalidations; a ceiling does not, and nesting it would reload every
budget on each expense entry. `queryKeys.budgetsAll()` is the `['budgets']` root
above it, and exists only for invalidation: a mutation or a Realtime event may
land after the active group has changed, so invalidating the per-group key would
target the wrong group. Reads use `budgets(groupId)`; invalidation always goes
through the root.

Anything *derived* from transactions nests under that same root — `periodSummary(groupId, from)` is `['transactions', 'summary', …]`. It rides the existing invalidations from the mutations and the Realtime subscription, so neither had to learn it exists. Put new derived caches under the prefix they depend on rather than adding invalidation calls.

`useClearCacheOnUserChange()` clears the TanStack Query cache when the session's user changes, so a second account signed in on the same device never briefly sees the previous one's cached groups or transactions.

`ActiveGroupProvider` holds the active group for the whole app, initialised on the personal account (first in the membership list). Screens write into that group; they never pick a `group_id` themselves.

Data errors are mapped by SQLSTATE code in `src/lib/data-errors.ts` first — that rule doesn't change — with a message-based fallback for transport failures only, which reach the client as an object with `code: ""` and no SQLSTATE to key off. Same priority order as `auth-errors.ts`.

History pages are **cursor-paginated on `(occurred_on, id)`**, never `OFFSET` / `.range()`. Realtime inserts rows while the user scrolls, so an offset shifts every later page: a row appears twice, or is skipped. `transactions_group_occurred_idx` and the `id` tiebreak exist for exactly this. PostgREST cannot express row-value comparison, so `listPage()` builds the equivalent predicate with `.or()`; the cursor values always come from a row the server already returned.

## RLS

Security lives in the database, not the client. Every policy resolves to "is the caller a member of this group?".

`is_group_member()` / `is_group_owner()` / `shares_group_with()` are `SECURITY DEFINER` **on purpose**: a policy on `account_memberships` that queries `account_memberships` recurses infinitely. Keep new membership-dependent policies going through these helpers.

That reason does not generalise. `period_summary()` is `SECURITY INVOKER`, because it reads `transactions` from outside any policy — no recursion, so `transactions_select_member` applies as written and there is no bypass to audit. A non-member sums zero rows and gets `0/0/0`, which is an answer, not an error. Copying `DEFINER` by imitation is the mistake to avoid.

Aggregates are computed in Postgres, never in JavaScript: amounts are `numeric(12,2)`, which Postgres sums exactly, while JS addition goes through binary floats. PostgREST's own aggregate functions are not an option — enabling them requires `pgrst.db_aggregates_enabled` on the `authenticator` role, which opens `sum()` on every table for every client.

Joining a group goes through the `join_group_with_code()` RPC, not a direct insert — the joining user cannot yet read the group's invitations.

## Activity log

`activity_log` records every update and delete on `transactions` and `budgets`: who, when, the row before and after. It is written only by the `log_activity()` trigger. Clients hold `select` and nothing else — no policy and no privilege for insert, update or delete — so no client can add, rewrite or erase an entry, including through a direct API call.

`log_activity()` is `SECURITY DEFINER` for its own reason, not by imitation of the membership helpers: it inserts into a table where clients deliberately have no write right. Two guards keep it from breaking cascades, and both are covered by `activity_log_test.sql`:

- it writes nothing when the row's group no longer exists — deleting a group or an account cascades into transactions and budgets, and an entry pointing at a deleted group would fail its foreign key and roll the whole deletion back;
- it reads the author from `users` rather than taking `auth.uid()` as is — when users delete their own account, their `users` row is already gone during the cascade.

To journal another table: one `create trigger … execute function public.log_activity('<subject>')` and one more value in the `activity_subject` enum.

`updated_at` moves only on a real change: `touch_updated_at()` compares the row with and without `updated_at`, and ignores any value the client sends. That is what makes « modifié » (`updated_at > created_at`) trustworthy. `log_activity()` uses the same comparison, so the mention and the log always agree.

`transactions.user_id`, `transactions.group_id`, `budgets.group_id` and `budgets.category_id` are frozen: `guard_immutable_columns()` raises `42501` on any change. The app never edits them; the update policies alone did not prevent it.

## V1 scope (decided — do not re-litigate)

In: manual transaction entry, per-category budgets with in-app visual alerts, savings goals, CSV/PDF export (after the main screens, before notifications).

Out, with reasons:
- **Bank connection** — needs an aggregator (Plaid / Powens), PSD2 compliance, recurring API cost. Separate project after V1 is validated by usage.
- **Multi-currency** — no identified need; adding a `currency` column to `transactions` and `budgets` later is cheap, so don't complicate the schema now.
- **Push notifications** — needs Expo Notifications, iOS/Android permissions, and a Supabase edge function checking thresholds. In-app alerts suffice for V1.

## UX constraints that shape the code

- **Font scale is followed, not capped.** System font scaling grows text without growing its container, so containers must widen or reflow: derive sizes from `useWindowDimensions().fontScale` (it re-renders on change, unlike `PixelRatio.getFontScale()`), and stack two-column rows past `stackAtFontScale`. Only two places cap it — `AmountInput` and the dashboard balance — because their available width is the screen itself.
- **A `<Link asChild>` child's `style` must be `StyleSheet.flatten(...)`, never an array.** `asChild` renders through a `Slot`, which throws a render error on an array style — and only in development, so `npx expo export` (a production build) passes without a word, as do tsc, lint and Jest. The failure surfaces on a device running the dev bundle, which is the last place the project checks. Every `asChild` site flattens; keep it that way.
- **Expense entry in ≤3 taps** from the main screen (amount, category, confirm). Retention depends on it — it drives navigation and form design. `Screen`'s optional `floatingAction` renders outside the `ScrollView`, pinned in place, so a lengthening list can't scroll it out of reach.
- Transaction history must be paginated (`transactions_group_occurred_idx` covers the filter + sort).
- Forms default to smart values: last-used category, today's date — both are editable, just pre-filled to save a tap.
- Shared budgets sync live via Supabase Realtime (`transactions`, `budgets`, `savings_goals`, `account_memberships` are in the publication).

## Conventions

- File names kebab-case; components PascalCase.
- User-facing strings in French, code identifiers in English. SQL comments in French, matching the spec.
- Supabase errors are mapped to French text by code in [src/lib/auth-errors.ts](src/lib/auth-errors.ts) — map codes, never message strings, which change between versions.
- TypeScript strict, no `any`. `src/types/database.ts` is **generated** — never edit it by hand. After any migration: `npx supabase gen types typescript --linked > src/types/database.ts`, then restore the header comment and the enum aliases at the end of the file.
