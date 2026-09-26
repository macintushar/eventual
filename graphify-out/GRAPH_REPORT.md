# Graph Report - splitslop  (2026-09-26)

## Corpus Check
- 274 files · ~164,237 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1533 nodes · 3879 edges · 120 communities (74 shown, 46 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f91202c9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- schema.ts
- $expenseId.tsx
- schemas/index.ts
- dropdown-menu.tsx
- expense-composer.tsx
- combobox.tsx
- routeTree.gen.ts
- includes
- help/index.tsx
- compilerOptions
- app.ts
- recurring-expenses.tsx
- build-shortcut.ts
- auth-form.tsx
- routes/index.tsx
- components/api-keys.tsx
- components.json
- route.tsx
- scripts
- services/expenses.ts
- dialog.tsx
- Turso Cloud
- Turso Embedded Database
- app-shell.tsx
- activity.tsx
- button.tsx
- Eventual
- toggle-group.tsx
- queries.ts
- auth.ts
- transactional.tsx
- http.ts
- shadcn/ui Skill
- dependencies
- expense-table.tsx
- $groupId/index.tsx
- seed.ts
- FileRoutesByPath
- Bidirectional Remote Replication
- cn
- recurring.ts
- Semantic Styling
- member-profile.tsx
- Better Auth Authentication
- analytics-provider.tsx
- Ctx
- empty-state.tsx
- operations.ts
- auth-email.ts
- __root.tsx
- web-api.ts
- reset-password.tsx
- router.tsx
- AuthForm
- Scoped JWT Authentication
- vercel.json
- shadcn/ui
- BEGIN CONCURRENT
- Drizzle Logo
- OpenCode CLI Reference
- categories.ts
- @better-auth/api-key
- @better-auth/drizzle-adapter
- clsx
- cn
- schemas/expenses.ts
- drizzle-kit
- drizzle-orm
- @faker-js/faker
- @libsql/client
- lucide-react
- @modelcontextprotocol/sdk
- next-themes
- nitro
- posthog-js
- posthog-node
- @posthog/react
- radix-ui
- react-dom
- resend
- @sentry/tanstackstart-react
- sonner
- @t3-oss/env-core
- dock.tsx
- tailwindcss
- @tailwindcss/vite
- @tanstack/match-sorter-utils
- @tanstack/react-devtools
- @tanstack/react-form
- @tanstack/react-router
- @tanstack/react-router-devtools
- @tanstack/react-start
- @tanstack/react-table
- zod
- How Eventual will extend
- shortcut.ts
- schemas/groups.ts
- api-client.gen.ts
- legal.ts
- generate-routes.mjs
- vite.config.ts
- Better Auth Security Guide
- Create Auth Skill
- Email and Password Authentication Guide
- GuestClaim
- profile.tsx
- app.tsx
- class-variance-authority
- react-day-picker
- react-email
- @tanstack/react-query
- @tanstack/react-query-devtools
- tw-animate-css
- generate-api-client.ts

## God Nodes (most connected - your core abstractions)
1. `membership()` - 48 edges
2. `cn()` - 40 edges
3. `Button()` - 39 edges
4. `FileRoutesByPath` - 30 edges
5. `Ctx` - 27 edges
6. `activityRow()` - 25 edges
7. `recordActivity()` - 25 edges
8. `formatMinor()` - 23 edges
9. `createExpense()` - 23 edges
10. `requireRole()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Eventual Expense-sharing App` --presented_with--> `Scrapbook Editorial Style`  [INFERRED]
  README.md → DESIGN.md
- `CalendarDayButton()` --references--> `react`  [EXTRACTED]
  src/components/ui/calendar.tsx → package.json
- `useComboboxAnchor()` --references--> `react`  [EXTRACTED]
  src/components/ui/combobox.tsx → package.json
- `Slider()` --references--> `react`  [EXTRACTED]
  src/components/ui/slider.tsx → package.json
- `Semantic Styling` --similar_to--> `Role-based Color System`  [INFERRED]
  .agents/skills/shadcn/rules/styling.md → DESIGN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Eventual Shared-Service Architecture** — agents_build_prompt_eventual, agents_build_prompt_service_layer, agents_build_prompt_balance_engine [EXTRACTED 1.00]
- **Local-first Sync SDK Family** — agents_skills_turso_cloud_turso_cloud_go_overview_tursogo, agents_skills_turso_cloud_turso_cloud_js_overview_javascript_sync_sdk, agents_skills_turso_cloud_turso_cloud_py_overview_pyturso_sync, agents_skills_turso_cloud_turso_cloud_rust_overview_turso_sync_crate [EXTRACTED 1.00]
- **Eventual Shared Service Surfaces** — readme_rest_api, readme_authenticated_mcp, readme_typed_server_functions [EXTRACTED 1.00]
- **Eventual Visual System** — design_scrapbook_editorial_style, design_role_based_color_system, design_typography_system, design_accessible_responsive_design [EXTRACTED 1.00]

## Communities (120 total, 46 thin omitted)

### Community 0 - "schema.ts"
Cohesion: 0.09
Nodes (31): accountRelations, activity, activityRecipient, activityRecipientRelations, activityRelations, apikey, apikeyRelations, channelIdentity (+23 more)

### Community 1 - "$expenseId.tsx"
Cohesion: 0.22
Nodes (19): Amount(), ExpenseComposer(), splitInput(), currencies, currencyDecimals(), currencySymbol(), isCurrency(), symbols (+11 more)

### Community 2 - "schemas/index.ts"
Cohesion: 0.09
Nodes (20): CreateExpenseInput, CreateGroupInput, createGroupSchema, CreateSettlementInput, createSettlementSchema, expenseIdSchema, invitationIdSchema, inviteSchema (+12 more)

### Community 3 - "dropdown-menu.tsx"
Cohesion: 0.15
Nodes (3): DropdownMenu(), DropdownMenuContent(), DropdownMenuSeparator()

### Community 4 - "expense-composer.tsx"
Cohesion: 0.08
Nodes (32): ComposerGroup, ComposerMember, defaultInputs(), defaultPayer(), ExpenseDraft, GROUP_STEP, LATER_STEPS, methodHelp (+24 more)

### Community 5 - "combobox.tsx"
Cohesion: 0.11
Nodes (10): CurrencySelect(), options, Option, OptionCombobox(), ComboboxContent(), ComboboxEmpty(), ComboboxInput(), ComboboxItem() (+2 more)

### Community 6 - "routeTree.gen.ts"
Cohesion: 0.05
Nodes (41): Route, ApiAuthSplatRoute, ApiSplatRoute, AppActivityRoute, AppGroupsGroupIdExpensesExpenseIdRoute, AppGroupsGroupIdIndexRoute, AppIndexRoute, AppRoute (+33 more)

### Community 7 - "includes"
Cohesion: 0.07
Nodes (29): source, assist, actions, files, ignoreUnknown, includes, formatter, enabled (+21 more)

### Community 8 - "help/index.tsx"
Cohesion: 0.11
Nodes (24): Parent, clampZoom(), HelpShot(), Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), Breadcrumb() (+16 more)

### Community 9 - "compilerOptions"
Cohesion: 0.08
Nodes (24): DOM, DOM.Iterable, ES2022, **/*.ts, **/*.tsx, vite/client, compilerOptions, allowImportingTsExtensions (+16 more)

### Community 10 - "app.ts"
Cohesion: 0.16
Nodes (41): people(), listActivity(), createCategoryRule(), deleteCategoryRule(), updateCategoryRule(), archiveGroup(), createGroup(), deleteGroup() (+33 more)

### Community 11 - "recurring-expenses.tsx"
Cohesion: 0.08
Nodes (30): ConfirmDialog(), ExpenseTable(), capitalise(), everyLabel(), Member, NewRecurringExpense(), Recurrence, RECURRENCES (+22 more)

### Community 12 - "build-shortcut.ts"
Cohesion: 0.12
Nodes (23): action(), actions, amount, apiKey, attachment(), auth(), choose(), dictionary() (+15 more)

### Community 13 - "auth-form.tsx"
Cohesion: 0.17
Nodes (25): emailSchema, nameSchema, passwordSchema, PasswordRecovery(), PublicHeader(), PublicHeaderAction, PublicPage(), publicSignedInActions (+17 more)

### Community 14 - "routes/index.tsx"
Cohesion: 0.09
Nodes (32): assistantBrands, Brand, BrandLogo(), assistants, EmailLink(), LEGAL_UPDATED, LegalList(), LegalPage() (+24 more)

### Community 15 - "components/api-keys.tsx"
Cohesion: 0.16
Nodes (18): ApiKeys(), EMPTY_KEYS, Expiry, expiryOptions, features, formatDate(), helper, isExpired() (+10 more)

### Community 16 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 17 - "route.tsx"
Cohesion: 0.33
Nodes (8): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger(), Route, SettingsLayout(), TABS

### Community 18 - "scripts"
Cohesion: 0.04
Nodes (48): @biomejs/biome, dotenv, devDependencies, @biomejs/biome, dotenv, @react-email/ui, @tailwindcss/typography, @tanstack/devtools-vite (+40 more)

### Community 19 - "services/expenses.ts"
Cohesion: 0.16
Nodes (23): expenseRecipients(), updatedExpenseRecipients(), assertInteger(), ComputedShare, computeShares(), distribute(), Participant, participants (+15 more)

### Community 20 - "dialog.tsx"
Cohesion: 0.23
Nodes (9): HelpStep, Dialog(), DialogClose(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogTitle() (+1 more)

### Community 21 - "Turso Cloud"
Cohesion: 0.16
Nodes (14): Turso Cloud Features, Turso Cloud, libsql-client-go Remote SDK, tursogo Local-first SDK, @tursodatabase/sync, @tursodatabase/serverless, libsql Python Remote Client, pyturso Local-first Sync (+6 more)

### Community 22 - "Turso Embedded Database"
Cohesion: 0.19
Nodes (14): Page-level Encryption at Rest, BM25 Ranking and Highlighting, Tantivy Full-text Search, Vector Distance Functions, Vector Search, Go SDK tursogo, JavaScript SDK @tursodatabase/database, Python SDK pyturso (+6 more)

### Community 23 - "app-shell.tsx"
Cohesion: 0.12
Nodes (17): ACCOUNT_LINKS, AppShell(), InAppShell, useHeaderMotion(), DropdownMenuLabel(), Sheet(), SheetClose(), SheetContent() (+9 more)

### Community 24 - "activity.tsx"
Cohesion: 0.40
Nodes (3): AppBreadcrumb(), myActivityInfiniteOptions, Route

### Community 25 - "button.tsx"
Cohesion: 0.33
Nodes (7): CodeBlock(), Button(), buttonVariants, Calendar(), CalendarDayButton(), copyToClipboard(), MembersTab()

### Community 26 - "Eventual"
Cohesion: 0.17
Nodes (12): Balance and Settlement Engine, Eventual, Expense Lock Rule, Framework-Agnostic Service Layer, Integer-Only Split Engine, Better Auth Integration Guide, Advanced Drizzle Schemas, Drizzle Performance Optimization (+4 more)

### Community 27 - "toggle-group.tsx"
Cohesion: 0.23
Nodes (9): react, react, useComboboxAnchor(), Slider(), ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle() (+1 more)

### Community 28 - "queries.ts"
Cohesion: 0.06
Nodes (60): Composer, ComposerContext, ComposerProvider(), Open, useComposer(), ComposeButton(), GroupComposer(), looksLikeEmail() (+52 more)

### Community 29 - "auth.ts"
Cohesion: 0.19
Nodes (15): db, env, auth, presentedApiKey(), handlePost(), Route, markerId(), markVerificationSent() (+7 more)

### Community 30 - "transactional.tsx"
Cohesion: 0.24
Nodes (8): BaseEmailProps, emailCopy(), formatExpiry(), TransactionalEmail(), TransactionalEmailProps, urlSegments(), webFonts, sendEmail()

### Community 31 - "http.ts"
Cohesion: 0.08
Nodes (41): createMcpServer(), handleMcp(), metricMethod(), metricMethods, Route, text(), runInBackground(), WaitUntilRequest (+33 more)

### Community 32 - "shadcn/ui Skill"
Cohesion: 0.18
Nodes (11): shadcn/ui Agent Interface, shadcn CLI Reference, shadcn Customization and Theming, shadcn MCP Server, shadcn Registry Authoring, Base vs Radix, Chat and Messaging Components, Component Composition Rules (+3 more)

### Community 33 - "dependencies"
Cohesion: 0.18
Nodes (11): @base-ui/react, better-auth, motion, dependencies, @base-ui/react, better-auth, motion, tailwind-merge (+3 more)

### Community 34 - "expense-table.tsx"
Cohesion: 0.07
Nodes (30): activityIcons, ActivityType, EMPTY_ROWS, ExpenseTableRow, features, helper, initials(), MemberAvatar() (+22 more)

### Community 35 - "$groupId/index.tsx"
Cohesion: 0.11
Nodes (16): BalanceBar(), CardAction(), Select(), SelectContent(), SelectGroup(), SelectItem(), SelectTrigger(), SelectValue() (+8 more)

### Community 36 - "seed.ts"
Cohesion: 0.17
Nodes (10): credentials, debtorIndex, descriptions, firstShares, groups, methods, now, settlementId (+2 more)

### Community 37 - "FileRoutesByPath"
Cohesion: 0.11
Nodes (16): Route, Route, Route, Route, Route, Route, Route, Route (+8 more)

### Community 38 - "Bidirectional Remote Replication"
Cohesion: 0.22
Nodes (10): Embedded Replicas, CDC Capture Modes, Change Data Capture, CDC Transaction Boundaries, Remote Sync Encryption, Explicit Push/Pull Sync Logic, Partial Sync Bootstrap, Bidirectional Remote Replication (+2 more)

### Community 39 - "cn"
Cohesion: 0.20
Nodes (11): EmailVerification(), GoogleIcon(), AuthAccount, optionalIssue(), ProfileSettings(), ProfileUser, SettingsRow(), SettingsSection() (+3 more)

### Community 40 - "recurring.ts"
Cohesion: 0.06
Nodes (62): client, Database, account, job, session, verification, guestAuthGuards(), guestAuthPlugin() (+54 more)

### Community 41 - "Semantic Styling"
Cohesion: 0.25
Nodes (9): Built-in Component Variants, Layout-only className, Semantic Styling, Shared UI Utilities, Accessible Responsive Design, Role-based Color System, Scrapbook Editorial Style, Balance Status Colors (+1 more)

### Community 42 - "member-profile.tsx"
Cohesion: 0.11
Nodes (22): ActivityItem, ActivityLine(), num(), relative, relativeTime(), sentence(), strong(), units (+14 more)

### Community 43 - "Better Auth Authentication"
Cohesion: 0.25
Nodes (9): Eventual Apple Shortcut, Resend and React Email Auth Messages, Authenticated MCP Endpoint, Better Auth Authentication, Eventual Expense-sharing App, Multi-currency Accounting, Eventual REST API, Settlement Validation and Allocation (+1 more)

### Community 44 - "analytics-provider.tsx"
Cohesion: 0.40
Nodes (3): AnalyticsIdentity(), AnalyticsProvider(), analyticsEnabled

### Community 45 - "Ctx"
Cohesion: 0.13
Nodes (20): user, buildUpiUrl(), UpiIntent, Ctx, BalanceExpense, BalanceMember, BalanceSettlement, computeBalances() (+12 more)

### Community 46 - "empty-state.tsx"
Cohesion: 0.36
Nodes (8): EmptyState(), Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 47 - "operations.ts"
Cohesion: 0.10
Nodes (25): empty, memberRoleSchema, MutationOperation, mutationOptions, mutationSchema, myPageSchema, operationByName, OperationDefinition (+17 more)

### Community 48 - "auth-email.ts"
Cohesion: 0.31
Nodes (8): EmailKind, authEmailOptions(), emailKey(), expiryFromNow(), LINK_TTL_SECONDS, SendAuthEmail, fixture(), VerificationSendGate

### Community 49 - "__root.tsx"
Cohesion: 0.24
Nodes (5): AppThemeProvider(), THEME_COLORS, ThemeToggle(), Toaster(), RouterContext

### Community 50 - "web-api.ts"
Cohesion: 0.14
Nodes (13): pendingVerificationUser(), updateProfileSchema, apiKeyInput, ApiKeySummary, cookieHeaders(), createApiKey(), deleteApiKey(), legalInfo (+5 more)

### Community 52 - "router.tsx"
Cohesion: 0.23
Nodes (10): useInAppShell(), ErrorLayout(), ErrorScreen(), NotFoundScreen(), createQueryClient(), getRouter(), Register, @tanstack/react-router (+2 more)

### Community 53 - "AuthForm"
Cohesion: 0.21
Nodes (8): AuthForm(), emailError(), issue(), nameError(), passwordError(), safeAuthRedirect(), Route, Route

### Community 55 - "Scoped JWT Authentication"
Cohesion: 0.50
Nodes (4): Fine-grained Table Permissions, JWKS External Auth Providers, Scoped JWT Authentication, Token Invalidation

### Community 57 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, crons, $schema, trailingSlash

### Community 58 - "shadcn/ui"
Cohesion: 0.67
Nodes (3): Shadcn Logo, shadcn/ui, shadcn/ui Icon

### Community 59 - "BEGIN CONCURRENT"
Cohesion: 0.67
Nodes (3): BEGIN CONCURRENT, Commit Conflict Retry, MVCC Snapshot Isolation

### Community 60 - "Drizzle Logo"
Cohesion: 1.00
Nodes (3): Drizzle Logo, Four Lime Rounded Diagonal Bars, Drizzle SVG Image

### Community 63 - "categories.ts"
Cohesion: 0.19
Nodes (16): categoryRule, ExpenseFilters, categorizeDescription(), defaults, listCategoryRules(), Rule, suggestCategory(), expenseFilterClauses() (+8 more)

### Community 68 - "schemas/expenses.ts"
Cohesion: 0.11
Nodes (17): BulkResplitInput, bulkResplitSchema, categoryRulesSchema, categorySchema, createCategoryRuleSchema, deleteCategoryRuleSchema, expenseFiltersSchema, expenseReportSchema (+9 more)

### Community 86 - "dock.tsx"
Cohesion: 0.15
Nodes (9): AppDock(), DockPointer, DockSlot(), profileActive(), PublicDock(), SlotScale, SPRING, DropdownMenuItem() (+1 more)

### Community 97 - "How Eventual will extend"
Cohesion: 0.15
Nodes (12): Already landed, Decisions, Guests, How Eventual will extend, Members, Milestones, Risks, Schema changes (+4 more)

### Community 98 - "shortcut.ts"
Cohesion: 0.33
Nodes (9): setSharePaid(), listGroups(), listMembers(), createSettlement(), fixture(), labelled(), quickExpense(), shortcutGroups() (+1 more)

### Community 99 - "schemas/groups.ts"
Cohesion: 0.20
Nodes (9): ArchiveGroupInput, archiveGroupSchema, crossGroupBalancesSchema, DuplicateGroupInput, duplicateGroupSchema, PaymentIntentsInput, paymentIntentsSchema, unarchiveGroupSchema (+1 more)

### Community 100 - "api-client.gen.ts"
Cohesion: 0.33
Nodes (4): ApiInput, OperationFor, routes, OperationName

### Community 101 - "legal.ts"
Cohesion: 0.47
Nodes (5): configuredProcessors(), getLegalInfo(), LegalInfo, LegalProcessor, sentryLocation()

### Community 102 - "generate-routes.mjs"
Cohesion: 0.40
Nodes (4): generated, generatedPath, root, tree

### Community 110 - "GuestClaim"
Cohesion: 0.50
Nodes (3): GuestClaim(), post(), Route

## Knowledge Gaps
- **421 isolated node(s):** `$schema`, `enabled`, `clientKind`, `useIgnoreFile`, `ignoreUnknown` (+416 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **46 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `scripts`, `toggle-group.tsx`, `@better-auth/api-key`, `@better-auth/drizzle-adapter`, `clsx`, `cn`, `drizzle-kit`, `drizzle-orm`, `@faker-js/faker`, `@libsql/client`, `lucide-react`, `@modelcontextprotocol/sdk`, `next-themes`, `nitro`, `posthog-js`, `posthog-node`, `@posthog/react`, `radix-ui`, `react-dom`, `resend`, `@sentry/tanstackstart-react`, `sonner`, `@t3-oss/env-core`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/match-sorter-utils`, `@tanstack/react-devtools`, `@tanstack/react-form`, `@tanstack/react-router`, `@tanstack/react-router-devtools`, `@tanstack/react-start`, `@tanstack/react-table`, `zod`, `class-variance-authority`, `react-day-picker`, `react-email`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `tw-animate-css`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Why does `react` connect `toggle-group.tsx` to `dependencies`, `button.tsx`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Why does `ToggleGroupItem()` connect `toggle-group.tsx` to `recurring-expenses.tsx`, `expense-composer.tsx`, `components/api-keys.tsx`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **What connects `$schema`, `enabled`, `clientKind` to the rest of the system?**
  _421 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08534850640113797 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `expense-composer.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0821256038647343 - nodes in this community are weakly interconnected._