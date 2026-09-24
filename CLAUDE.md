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
npm run db:types                    # regenerate src/types/database.ts from the linked project

eas build -p android --profile preview   # installable APK, built by EAS (global eas-cli)
```

The project is linked to Supabase ref `ozwltxywsqvgmefuqvfv`. Migration files must keep the CLI's `<14-digit timestamp>_name.sql` naming or `db push` skips them.

Database tests are pgTAP files under `supabase/tests/`, run against the local stack. `npm test` (Jest) covers only framework-free modules under `src/lib/` — no component or hook has a JS test yet.

`handle_new_user()` runs inside Supabase Auth's signup transaction; when it fails the client only sees an opaque `Database error saving new user`. Any change to `users`, `budget_groups`, or `account_memberships` must be re-run against `npm run test:db`.

Requires `.env` (copy from `.env.example`) with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. [src/lib/env.ts](src/lib/env.ts) throws at startup if either is missing. Env vars are inlined at build time — after editing `.env`, restart with `npx expo start --clear`.

## Expo version discipline

Per [AGENTS.md](AGENTS.md): read https://docs.expo.dev/versions/v57.0.0/ before writing Expo code. SDK 57 / expo-router v6 / React 19.2 APIs differ from older tutorials — notably `Stack.Protected guard={…}` for route guarding.

**Never run `npm audit fix --force`.** npm resolves an advisory by picking whatever version falls outside the vulnerable range, regardless of the SDK: on 2026-09-10 it downgraded `expo` to 46 and `expo-router` to 5 — eleven majors back — and the app could no longer start. Align versions with `npx expo install --fix` only. The moderate advisories `npm audit` reports come from two packages pulled in by the SDK itself (`decode-uri-component` through react-navigation, `uuid` through Expo's tooling); they have no npm-side fix that keeps SDK 57, and they go away when Expo ships patch releases, which `npx expo install --fix` picks up.

If `npx expo install --fix` fails with `EALLOWSCRIPTS` ("--allow-scripts is not allowed in project-scoped installs"), the user-level `~/.npmrc` holds an `allow-scripts` line that npm 11.19 rejects when Expo spawns the install. Don't edit the user's global config: run `npx expo install --check` and `npm install` the exact versions it lists — same result.

Windows: if `npm ci` or `npm install` fails with `EPERM` on `@unrs/resolver-binding-win32-x64-msvc/*.node`, VS Code's ESLint server has that native module loaded. Run "ESLint: Restart ESLint Server" or move the folder out of `node_modules` — never kill the VS Code extension host, which Claude Code runs inside.

## Native build (EAS)

**The three profiles in `eas.json` pin `"node": "22.20.0"`, and that pin is load-bearing.** `@supabase/supabase-js` and its five sub-packages declare `engines.node >= 22`; react-native declares `^20.19.4 || ^22.13.0 || ^24.3.0`. The intersection starts at 22.13. The build worker otherwise defaults to Node 20, where `npm ci` fails hard on the engine conflict — in about fifteen seconds, and the build log shows only `npm ci --include=dev exited with non-zero code: 1`, never the engine mismatch itself. Any new dependency raising its Node floor has to be checked against this pin.

**`eas-cli` is installed globally, never as a project dependency.** EAS runs `npm ci --include=dev` on the worker, so a dev dependency ships 344 packages to a machine that has no use for them. `cli.version` in `eas.json` already enforces the version. Removing it from `devDependencies` also removes the local `eas` binary, so `npx eas` stops resolving — the package is named `eas-cli`, and the bare `eas` command comes from the global install.

Installing the resulting APK needs `adb` from the Android platform-tools. Without it the build still succeeds; only the automatic install step fails, with `spawn adb ENOENT`, and the APK stays downloadable from the build URL.

Windows PATH: `[Environment]::SetEnvironmentVariable("Path", $env:Path + ";…", "User")` is a trap. `$env:Path` holds the *merged* machine + user PATH, so each call copies the machine PATH into the user PATH. Past 2047 characters in a `REG_SZ` key, Windows silently stops merging the user PATH altogether and every globally installed tool disappears from new sessions. Read the user scope explicitly instead — `[Environment]::GetEnvironmentVariable("Path", "User")` — and keep the key `REG_EXPAND_SZ`. VS Code also hands each terminal the environment it captured at its own launch, so a PATH change needs VS Code itself restarted, not just a new terminal tab.

## Database backups and keep-alive (GitHub Actions)

The Supabase free plan offers no downloadable backup and pauses a project after 7 days without activity. Two workflows cover both, at no cost:

- `.github/workflows/db-backup.yml` — nightly at 02:00 UTC (and on demand): `supabase db dump` for roles, schema and data (`auth.users` included), tarred, encrypted with `gpg --symmetric`, uploaded as a 30-day artifact. It uses the Supabase CLI rather than the runner's `pg_dump`, which is older than the server (Postgres 17) and refuses to dump it. It fails if `data.sql` holds no `COPY "public"."transactions"`, so an empty dump never passes for a success. The restore procedure is in the file header.
- `.github/workflows/db-keepalive.yml` — every two days at 06:00 UTC: one real SQL query through `psql`.

Both read the `SUPABASE_DB_URL` repository secret, which must be the **Session pooler** connection string (dashboard → Connect), percent-encoded: the direct connection is IPv6-only on the free plan and GitHub runners are IPv4-only. The backup also needs `BACKUP_PASSPHRASE`; without it the artifacts cannot be read, so it has to be kept outside GitHub too. The CLI version in `db-backup.yml` follows the project's (`npx supabase --version`).

## App icons

`app.json` wires four generated files from `assets/images/`, and Android composes three of them itself rather than taking a finished square.

- `android-icon-foreground.png` — the glyph alone on transparency. Android masks the icon to the launcher's shape (circle, squircle, teardrop), so the drawing has to stay inside the central ~66 %: here 560 × 436 on a 1024 canvas. A full-bleed icon used as the foreground gets its corners cut.
- `android-icon-background.png` — opaque, edge to edge, **no border and no rounded corners**. A hairline border there reads as a stray line once the mask is applied.
- `android-icon-monochrome.png` — the same silhouette in flat white, for Android 13+ themed icons, which recolour it against the wallpaper.
- `icon.png` — the flattened squircle, for iOS and the web. `app.json` deliberately has no `ios.icon`: the template's value pointed at an Icon Composer bundle (`assets/expo.icon`) holding the Expo logo, which would have shipped as the iOS icon.

**An app icon is judged at 48 dp, not at 1024.** The original artwork put a mid-green glyph on a dark-green field — 3.4:1, which dissolves in the launcher. The shipped background is `#062019`, giving 6.89:1. Any new artwork should be checked by compositing foreground over background, masking to a circle and downsampling to 48 px before it is accepted.

The splash screen shares that background colour; `imageWidth` is 140 because the W is much wider than tall, where the Expo template's 76 suited its own square logo.

## Architecture

Routes live under `src/app/` (expo-router, `src/` root configured via `tsconfig` path alias `@/*`).

```
src/app/_layout.tsx        AuthProvider + Stack.Protected session guard
src/app/(auth)/            sign-in, sign-up  — reachable only when session === null
src/app/(app)/             reachable only when session !== null
src/app/(app)/(tabs)/      Synthèse, Budgets, Opérations, Épargne — the four tab roots
src/app/(app)/*.tsx        everything else, stacked or as a form sheet above the tabs
src/lib/supabase.ts        client, AsyncStorage persistence, AppState auto-refresh
src/providers/             AuthProvider (session state + signIn/signUp/signOut)
supabase/migrations/       schema, RLS policies, seed — apply in numeric order
```

**Navigation never redirects manually after auth.** `signIn`/`signUp` only call Supabase; `onAuthStateChange` updates the provider, and the `Stack.Protected` guards in the root layout swap route groups. Adding a `router.replace()` after login fights the guard.

Neither auth route is named `index`, so `(app)/(tabs)/index.tsx` owns `/` without a route conflict — route groups in parentheses don't appear in URLs.

The account settings screen is reached from `AccountButton`, placed in each tab's own header rather than in a navigator-managed header: the four tab screens handle their top safe area differently (a virtualised list for history, a `ScrollView` elsewhere), and a shared header would have forced all of them to give it up. Typed routes (`.expo/types/router.d.ts`) are regenerated by the dev server, not by `expo export` — after adding a route, `tsc` rejects links to it until `npx expo start` has run once.

## Core data model decision

**A personal account is a `budget_group` with `is_personal = true` and a single member.** There is no separate "personal" table or code path. All access flows through `account_memberships`, so one set of RLS policies covers personal and shared budgets. Do not introduce a parallel personal-account model.

The `handle_new_user()` trigger on `auth.users` creates profile + personal group + `owner` membership in the signup transaction, so the app never sees a user without a group. `account_memberships_guard_personal` enforces the one-member invariant.

Tables: `users`, `budget_groups`, `account_memberships`, `categories` (`group_id IS NULL` = read-only global default), `transactions`, `budgets`, `savings_goals`, `group_invitations`, `activity_log` (written by triggers only — see below).

**Custom categories are created in place, under the grid** (`CategoryCreator`, in both the transaction and the envelope form), never in a sheet of their own: the transaction form is already a `formSheet`. The new category goes into the group's cache through `setQueryData` before any refetch, because `TransactionForm` drops a selection missing from the list. A name is unique per group and type, case-insensitively, *and* against the defaults: the two partial unique indexes can't see each other, so `categories_guard_homonym` checks both scopes and raises `P0001`, whose message the app shows verbatim. The icons in `category-icons.ts` deliberately exclude every seed icon, because `categoryTone()` colours the defaults by icon, and a custom category using `gift` would take the colour of « Cadeau ».

**The budget period is not the calendar month.** `budget_groups.period_start_day` (1–28, `check`-constrained) sets the day a period starts, so a budget can follow the payday. It sits on the group, not the user, so both members of a shared budget see the same figures — and `budget_groups_update_owner` already restricts who can change it. The 28 cap exists because the 29th, 30th and 31st don't occur every month. Bounds are computed client-side by `periodBounds()`: the server is UTC, and `date_trunc('month', now())` reports the wrong period during the first hours of a rollover day.

**The currency is the CFA franc (XAF), which has no minor unit (ISO 4217 exponent 0).** [src/lib/money.ts](src/lib/money.ts) is its only definition: `CURRENCY_SYMBOL`, `formatMoney()` (amount + non-breaking space + code), `spokenAmount()` for accessibility labels, and integer-only `parseAmount()`. The app enters and displays whole amounts, with no decimals and a `number-pad` keyboard; the columns stay `numeric(12,2)` and hold integers, so there was no migration. A screen never writes `€` or `XAF` itself — it goes through `money.ts`, so the code changes in one place. Amounts saved before the switch (in euros, possibly with decimals) were not converted: they keep their value, read as XAF, and are rounded on display and in the edit field.

## Profile avatars

**`users.avatar` holds an id (`a01`–`a17`) of an image shipped in `assets/avatars/`, never an upload; `NULL` means initials.** No photo to host, moderate or send through the database, and the app draws the same face on every device. `MemberAvatar` is the one place that draws a person; it takes the raw column value and `parseAvatarId()` turns any id this version doesn't know — an avatar added by a newer app, a corrupted value — into initials rather than a broken image.

The images are generated once by `scripts/gen-avatars.mjs` (DiceBear Avataaars rasterised to PNG by resvg). DiceBear and resvg are deliberately not dependencies: EAS runs `npm ci --include=dev`, and the script only matters when adding an avatar. Each preset fixes every visible attribute instead of a seed, so an id keeps drawing the same face whatever the library version does, and skin tones are spread on purpose. **Ids are append-only** — an id is stored in profiles, and editing a preset would change someone's face under their eyes. To add one: a `PRESETS` line, regenerate, then `AVATAR_IDS` in `src/lib/avatars.ts` and `AVATAR_SOURCES` in `src/components/ui/avatar-sources.ts` (`tsc` fails if the two disagree; a Jest case checks every id has its file).

The database constrains the format (`users_avatar_format`, `^a[0-9]{2}$`), not the list, so adding an avatar needs no migration. The column has its own `grant update (avatar)`, like `display_name`. Other members read it through `users_select_self_or_covisible`, which is what puts faces on the member stacks. `group_overviews()` returns `member_avatars` as an array parallel to `member_names` — same join, order and limit — and `pairMembers()` zips them; an avatar-less member is a `NULL` in the array, not a gap.

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
than buried in JSX. The one exception is the summary card's grand total: `budget_totals()` sums ceilings and budgeted-category spend in Postgres, with the same spend definition as `category_breakdown`. Its key `budgetTotals` nests under `['transactions']` (spend comes from there), and budget mutations and the budgets Realtime hook invalidate `budgetTotalsAll()` as well.

**Budget ceilings and savings amounts are never rewritten, only adjusted.** `adjust_budget_amount()` and `add_to_savings_goal()` add a signed delta in a single `update … set x = x + delta`, so two members adjusting the same envelope (or two devices depositing on the same goal) both count. There is deliberately no data function that writes `budgets.amount` or `savings_goals.current_amount` directly after creation; `UpdateSavingsGoalInput` has no amount field for that reason. The form preview uses `previewSum()` (integer cents) for display only.

`queryKeys.budgets(groupId)` sits outside `['transactions']`, unlike
`periodSummary` and `categoryBreakdown`. Those derive from transactions and must
ride their invalidations; a ceiling does not, and nesting it would reload every
budget on each expense entry. `queryKeys.budgetsAll()` is the `['budgets']` root
above it, and exists only for invalidation: a mutation or a Realtime event may
land after the active group has changed, so invalidating the per-group key would
target the wrong group. Reads use `budgets(groupId)`; invalidation always goes
through the root.

Anything *derived* from transactions nests under that same root — `periodSummary(groupId, from)` is `['transactions', 'summary', …]`. It rides the existing invalidations from the mutations and the Realtime subscription, so neither had to learn it exists. Put new derived caches under the prefix they depend on rather than adding invalidation calls.

`usePersistedQueryCache()` clears the TanStack Query cache when the session's user changes, so a second account signed in on the same device never briefly sees the previous one's cached groups or transactions. It also writes that cache to AsyncStorage (see Offline mode below).

## Offline mode

The app reads and enters expenses without network; the database stays Supabase. Three pieces:

- **The cache survives restarts.** `usePersistedQueryCache()` restores the TanStack Query cache from AsyncStorage under a per-user key (`query-cache:<userId>`) and keeps writing it. The splash waits for the restore on first launch only, so an offline start shows the last known figures, not spinners. Caches of any other user are swept on every session resolution, so signing out leaves no financial data on the device. `gcTime` equals `PERSISTED_CACHE_MAX_AGE` (30 days): a query evicted from memory earlier would also vanish from disk. `buster` is the app version plus `CACHE_FORMAT`, so a new release — or a change to how the cache is written — starts from an empty cache. **The cache is written by `serializeCache()` (`src/lib/cache-serialization.ts`), never plain `JSON.stringify`**: several reads return a `Map` (`getDailyTotals`, savings `rhythms`, group `byGroup`), which plain JSON writes as `{}`. Restored that way, the Opérations and Épargne tabs crashed on `.get()` at every launch, online or not, until the first build with the fix bumped `CACHE_FORMAT` to 2. Returning a `Map` or `Set` from `src/data/` is fine; any other non-JSON type (a `Date`, a class instance) is not, unless `cache-serialization.ts` learns it.
- **Transaction writes queue.** `onlineManager` is wired to NetInfo (`isConnected !== false`; `isInternetReachable` is deliberately ignored — it pings Google and a false negative would queue writes on a working network). Create/update/delete of a transaction run with `networkMode: 'online'`, so offline they pause instead of failing. Their `mutationFn` and effects are registered with `setMutationDefaults` under `mutationKeys` (`src/lib/query-keys.ts`), not passed to `useMutation`: a queued write is persisted and replayed after a restart, when only its key survives. Only those keys are dehydrated.
- **Everything else fails fast.** The global mutation default is `networkMode: 'always'`, so a budget, savings or group write offline errors immediately with « Pas de connexion » rather than spinning. To make another write queue, give it a `mutationKeys` entry, register defaults for it, and widen `shouldDehydrateMutation` — delta RPCs (`adjust_budget_amount`, `add_to_savings_goal`) are safe to replay by design.

The transaction sheet closes as soon as a write is queued. `OfflineBanner`, above the `(app)` stack, says the figures may be stale and counts pending writes; a queued write the database later refuses raises an `Alert` from the `MutationCache`, because no form is left to show it — writes sent immediately keep their inline error only. Queued creations show in a separate « En attente d'envoi » block (`PendingTransactions`, on the dashboard under the balance and at the head of the history), built from the mutation variables by `usePendingTransactions()` and drawn by `TransactionRow pending` — not a link, since there is no id yet. They are deliberately kept out of the list caches and the totals: those are computed in Postgres, and recomputing them client-side would be a second definition of « spend for the period ». Queued updates and deletions are only counted by the banner.

The banner sits above the stack and shrinks it. On Android a `formSheet` opens inside the stack's bounds, not the window's, so a sheet capped at a fraction of the window overflowed the bottom and hid its save button. Sheets cap their height with `useSheetMaxHeight()`, which reads the stack height measured by `StackFrameProvider` — never `useWindowDimensions()` directly. `@react-native-community/netinfo` is a native module: it needs a new EAS build (Expo Go already ships it).

`ActiveGroupProvider` holds the active group for the whole app, initialised on the personal account (first in the membership list). Screens write into that group; they never pick a `group_id` themselves.

Data errors are mapped by SQLSTATE code in `src/lib/data-errors.ts` first — that rule doesn't change — with two message-based exceptions. One is a fallback for transport failures only, which reach the client as an object with `code: ""` and no SQLSTATE to key off. The other is deliberate: `error.code === 'P0001'`, the generic code every bare `raise exception` shares (`join_group_with_code()` and the guard triggers all raise through it), returns `error.message` verbatim rather than going through `MESSAGES`, because a single table entry keyed on `P0001` can't represent several unrelated messages that all happen to share that code. Same priority order as `auth-errors.ts`.

History pages are **cursor-paginated on `(occurred_on, id)`**, never `OFFSET` / `.range()`. Realtime inserts rows while the user scrolls, so an offset shifts every later page: a row appears twice, or is skipped. `transactions_group_occurred_idx` and the `id` tiebreak exist for exactly this. PostgREST cannot express row-value comparison, so `listPage()` builds the equivalent predicate with `.or()`; the cursor values always come from a row the server already returned.

## RLS

Security lives in the database, not the client. Every policy resolves to "is the caller a member of this group?".

Policies decide *which rows*; column privileges decide *which columns*. `authenticated` may update only `users.display_name`, `budget_groups.name` / `period_start_day` and `categories.name` / `icon` (a category moved to another group or switched to the other type would drag its transactions along) — without that, `users_update_self` let a user rewrite their own `users.email` (desynchronising it from `auth.users`) and `budget_groups_update_owner` let an owner change `owner_id` or `is_personal` through a direct API call. A new writable column needs its own `grant update (col)`, or the app gets `42501`.

`is_group_member()` / `is_group_owner()` / `shares_group_with()` are `SECURITY DEFINER` **on purpose**: a policy on `account_memberships` that queries `account_memberships` recurses infinitely. Keep new membership-dependent policies going through these helpers.

That reason does not generalise. `period_summary()` is `SECURITY INVOKER`, because it reads `transactions` from outside any policy — no recursion, so `transactions_select_member` applies as written and there is no bypass to audit. A non-member sums zero rows and gets `0/0/0`, which is an answer, not an error. Copying `DEFINER` by imitation is the mistake to avoid.

`savings_goals_all_own` is the one policy in the project that resolves on `user_id = auth.uid()` instead of group membership, and that is deliberate, not an oversight: a savings goal stays personal even inside a shared budget — two members of the same group never see each other's goals, which `supabase/tests/savings_goals_rls_test.sql` proves. Do not "fix" this policy to route through `is_group_member()`; doing so would silently share a shared budget's savings goals across its members. For the same reason `queryKeys.savingsGoals()` is a single flat key, deliberately not split per group — `usePersistedQueryCache()` is already the only boundary that matters here, unlike `budgets`, which has an active group to track.

Aggregates are computed in Postgres, never in JavaScript: amounts are `numeric(12,2)`, which Postgres sums exactly, while JS addition goes through binary floats. PostgREST's own aggregate functions are not an option — enabling them requires `pgrst.db_aggregates_enabled` on the `authenticator` role, which opens `sum()` on every table for every client.

Joining a group goes through the `join_group_with_code()` RPC, not a direct insert — the joining user cannot yet read the group's invitations. Creating a shared group goes through `create_shared_group()` for the same reason, from the other end: `account_memberships_insert_owner` requires `is_group_owner(group_id)`, which can never be true for a group's very first membership row, so a `SECURITY DEFINER` RPC inserts the group and its owner-membership row atomically.

`guard_owner_orphan()` (the trigger on `account_memberships` added by migration `20260911000100_group_management.sql`) blocks an owner from leaving or being demoted while the group has other members, using `pg_trigger_depth() = 1` so only a direct client action is blocked — every cascade (group deletion, account deletion) runs nested at a greater depth and passes through unblocked.

Account deletion therefore can't rely on that trigger, and doesn't: it goes through the `delete_own_account()` RPC (migration `20260919000100_account_settings.sql`), which refuses with `P0001` while `owned_groups_with_other_members()` is non-empty — the same function the settings screen reads to disable its button, so the screen and the database share one definition of "what blocks deletion". It is `SECURITY DEFINER` for its own reason: clients have no right on `auth.users`, while `postgres` holds `DELETE` on it without being superuser (verified on the hosted project), so no Edge Function is needed. It deletes the member's transactions in surviving groups *before* the account, so `log_activity()` still finds their `users` row and attributes those deletions by name. The client then signs out with `scope: 'local'` — the default global sign-out would call the API with the token of a user who no longer exists and throw after a successful deletion. Deletion done from the Supabase dashboard bypasses the check; only the client escape is closed.

`join_group_with_code()` also refuses a group that has no `owner` membership left: when a sole owner leaves, a still-valid invitation used to let someone into a group nobody could manage. A `for share` lock on the owner's membership closes the race with a simultaneous departure.

## Activity log

`activity_log` records every update and delete on `transactions` and `budgets`: who, when, the row before and after. It is written only by the `log_activity()` trigger. Clients hold `select` and nothing else — no policy and no privilege for insert, update or delete — so no client can add, rewrite or erase an entry, including through a direct API call.

`log_activity()` is `SECURITY DEFINER` for its own reason, not by imitation of the membership helpers: it inserts into a table where clients deliberately have no write right. Two guards keep it from breaking cascades, and both are covered by `activity_log_test.sql`:

- it writes nothing when the row's group no longer exists — deleting a group or an account cascades into transactions and budgets, and an entry pointing at a deleted group would fail its foreign key and roll the whole deletion back;
- it reads the author from `users` rather than taking `auth.uid()` as is — when users delete their own account, their `users` row is already gone during the cascade.

To journal another table: one `create trigger … execute function public.log_activity('<subject>')` and one more value in the `activity_subject` enum.

`updated_at` moves only on a real change: `touch_updated_at()` compares the row with and without `updated_at`, and ignores any value the client sends. That is what makes « modifié » (`updated_at > created_at`) trustworthy. `log_activity()` uses the same comparison, so the mention and the log always agree.

`transactions.id`, `transactions.user_id`, `transactions.group_id`, `transactions.created_at`, `budgets.id`, `budgets.group_id`, `budgets.category_id` and `budgets.created_at` are frozen: `guard_immutable_columns()` raises `42501` on any change. The app never edits them; the update policies alone did not prevent it. Without this guard, a member could advance `created_at` past `updated_at` through a direct API call and erase the « modifié » mention.

On the app side, `queryKeys.activity(groupId)` sits outside `['transactions']` and has no Realtime subscription on purpose. The feed is read deliberately: it refetches on every open (`refetchOnMount: 'always'`) and on pull-to-refresh, because a list that shifts under the finger while being read is worse. Pages are cursor-paginated on `(occurred_at, id)` like the history. The cursor keeps the timestamp string exactly as PostgREST returned it: a round trip through `Date` drops the microseconds, and the next page would repeat or skip an entry.

## V1 scope (decided — do not re-litigate)

In: manual transaction entry, per-category budgets with in-app visual alerts, savings goals, CSV/PDF export (after the main screens, before notifications).

Out, with reasons:
- **Bank connection** — needs an aggregator (Plaid / Powens), PSD2 compliance, recurring API cost. Separate project after V1 is validated by usage.
- **Multi-currency** — no identified need (the single currency is XAF, see Core data model); adding a `currency` column to `transactions` and `budgets` later is cheap, so don't complicate the schema now.
- **Push notifications** — needs Expo Notifications, iOS/Android permissions, and a Supabase edge function checking thresholds. In-app alerts suffice for V1.

## UX constraints that shape the code

- **The theme choice goes through `Appearance.setColorScheme()`, not a theme provider.** `src/lib/theme-preference.ts` stores `system` / `light` / `dark` in AsyncStorage; the root layout reads and applies it before hiding the splash, so the first screen never flashes the phone's theme. `useColorScheme()` then returns the forced value everywhere — `useColors()`, the navigation theme and native components follow without knowing the setting exists. `system` (the default) maps to `'unspecified'`, which hands control back to the phone. React Native Web doesn't implement the override: on web the app follows the browser.
- **The theme change is a cross-fade of a screenshot, not an animation of colours.** `useColors()` returns static palettes read at render, so no component can tween between two themes. `ThemeTransitionProvider` (root layout) photographs its content with `react-native-view-shot`, mounts the photo on top, lets the theme change underneath, then fades the photo out. A plain veil was tried first and shows one flat all-dark or all-light frame. The sequencing and its races — two quick choices, a slow capture, an image that never loads — live in `src/lib/theme-transition.ts`, covered by Jest with fake timers, and every wait has a watchdog: a stuck photo would freeze the screen on the old theme with nothing to say so. When the capture fails (a build without the native module) the theme changes without a fade; the fade is never a condition of the change. `react-native-view-shot` is a native module, so it needs a new EAS build, but Expo Go already ships it. Native `formSheet` presentations sit above the root and are not covered.
- **Font scale is followed, not capped.** System font scaling grows text without growing its container, so containers must widen or reflow: derive sizes from `useWindowDimensions().fontScale` (it re-renders on change, unlike `PixelRatio.getFontScale()`), and stack two-column rows past `stackAtFontScale`. Only two places cap it — `AmountInput` and the dashboard balance — because their available width is the screen itself.
- **A `<Link asChild>` child's `style` must be `StyleSheet.flatten(...)`, never an array.** `asChild` renders through a `Slot`, which throws a render error on an array style — and only in development, so `npx expo export` (a production build) passes without a word, as do tsc, lint and Jest. The failure surfaces on a device running the dev bundle, which is the last place the project checks. Every `asChild` site flattens; keep it that way.
- **`categoryGridLayout()` estimates label widths per character, so the tile itself carries the fallback — and the fallback differs by label.** The grid picks its column count from `CHAR_WIDTH_RATIO = 0.55`, which on a thirteen-letter word like « Remboursement » lands within a point of the real width, close enough to keep one column too many. A multi-word label absorbs that on a second line; a single word has nowhere to break and Android splits it mid-letter (« Rembourseme / nt »). `CategoryPicker` therefore branches: multi-word labels keep `numberOfLines={2}`, single words take `numberOfLines={1}` plus `adjustsFontSizeToFit` and shrink instead. **`adjustsFontSizeToFit` is ignored on Android whenever `numberOfLines > 1`** — pairing it with two lines is a no-op, which is why the branch exists rather than one shared setting. `labelStacked` needs `alignSelf: 'stretch'` for the same reason: in a column, `flexShrink` governs height, so without it the label has no bounded width to shrink against. Tightening the grid threshold instead was tried and reverted twice: « Alimentation » clears three columns by one point, so any margin costs the whole grid a column and breaks the mockup's two-then-three shape (three Jest cases pin it).
- **Expense entry in ≤3 taps** from the main screen (amount, category, confirm). Retention depends on it — it drives navigation and form design. `Screen`'s optional `floatingAction` renders outside the `ScrollView`, pinned in place, so a lengthening list can't scroll it out of reach.
- Transaction history must be paginated (`transactions_group_occurred_idx` covers the filter + sort).
- Forms default to smart values: last-used category, today's date — both are editable, just pre-filled to save a tap.
- Shared budgets sync live via Supabase Realtime (`transactions`, `budgets`, `account_memberships` are in the publication). `savings_goals` is in the same publication for a different reason — it keeps one user's own devices in sync, never fellow group members, since goals are personal (see RLS above).

## Conventions

- File names kebab-case; components PascalCase.
- **Comments are never hard-wrapped.** One paragraph is one physical line, however long — `//`, `/* */` and `{/* */}` alike. `.vscode/settings.json` sets `editor.wordWrap: "on"`, so the editor folds them to the window width; re-wrapping them by hand at ~80 columns undoes that, and turns a one-word edit into a diff spanning every line of the paragraph. A blank line still separates paragraphs, and bullets, JSDoc tags and indented code samples keep their own lines.
- User-facing strings in French, code identifiers in English. SQL comments in French, matching the spec.
- Supabase errors are mapped to French text by code in [src/lib/auth-errors.ts](src/lib/auth-errors.ts) — map codes, never message strings, which change between versions.
- TypeScript strict, no `any`. `src/types/database.ts` is **generated** — never edit it by hand. After any migration, run `npm run db:types`, never `supabase gen types … > src/types/database.ts`: the redirection drops the header comment and the enum aliases the app imports, and under PowerShell it writes UTF-16, after which tsc sees no exports at all. [scripts/gen-db-types.mjs](scripts/gen-db-types.mjs) captures the output instead, re-attaches both, and writes UTF-8. A new enum in a migration is added to its `ALIASES` block.
