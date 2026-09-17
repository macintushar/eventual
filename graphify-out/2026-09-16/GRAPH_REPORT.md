# Graph Report - .  (2026-09-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1078 nodes · 2285 edges · 110 communities (66 shown, 44 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1add490a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- services/app.ts
- activity-line.tsx
- schemas/index.ts
- app-shell.tsx
- $expenseId.tsx
- combobox.tsx
- routeTree.gen.ts
- biome.json
- help/index.tsx
- compilerOptions
- button.tsx
- expense-composer.tsx
- build-shortcut.ts
- auth-form.tsx
- docs.tsx
- api-keys.tsx
- components.json
- $groupId/index.tsx
- scripts
- devDependencies
- step-dialog.tsx
- Turso Cloud
- Turso Embedded Database
- sheet.tsx
- api-keys.ts
- date-picker.tsx
- Eventual
- toggle-group.tsx
- mutateFn
- lib/auth.ts
- transactional.tsx
- telemetry.ts
- shadcn/ui Skill
- dependencies
- header-user.tsx
- select.tsx
- seed.ts
- FileRoutesByPath
- Bidirectional Remote Replication
- cn
- context.ts
- Semantic Styling
- package.json
- Better Auth Authentication
- app.tsx
- composer.tsx
- empty-state.tsx
- auth-email.ts
- __root.tsx
- popup-container.tsx
- reset-password.tsx
- router.tsx
- login.tsx
- Scoped JWT Authentication
- vercel.json
- shadcn/ui
- BEGIN CONCURRENT
- Drizzle Logo
- OpenCode CLI Reference
- better-auth
- @better-auth/api-key
- @better-auth/drizzle-adapter
- clsx
- cn
- dotenv
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
- tailwind-merge
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
- @react-email/ui
- @tailwindcss/typography
- @tanstack/devtools-vite
- tsx
- vite
- vite.config.ts
- Better Auth Security Guide
- Create Auth Skill
- Email and Password Authentication Guide

## God Nodes (most connected - your core abstractions)
1. `Button()` - 30 edges
2. `cn()` - 18 edges
3. `membership()` - 18 edges
4. `formatMinor()` - 17 edges
5. `compilerOptions` - 17 edges
6. `FileRoutesByPath` - 17 edges
7. `scripts` - 16 edges
8. `activityRow()` - 15 edges
9. `Turso Cloud` - 14 edges
10. `Card()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Eventual Expense-sharing App` --presented_with--> `Scrapbook Editorial Style`  [INFERRED]
  README.md → DESIGN.md
- `Slider()` --references--> `react`  [EXTRACTED]
  src/components/ui/slider.tsx → package.json
- `Semantic Styling` --similar_to--> `Role-based Color System`  [INFERRED]
  .agents/skills/shadcn/rules/styling.md → DESIGN.md
- `Eventual Expense-sharing App` --uses--> `Turso Cloud`  [EXTRACTED]
  README.md → .agents/skills/turso-cloud/SKILL.md
- `CalendarDayButton()` --references--> `react`  [EXTRACTED]
  src/components/ui/calendar.tsx → package.json

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Eventual Shared-Service Architecture** — agents_build_prompt_eventual, agents_build_prompt_service_layer, agents_build_prompt_balance_engine [EXTRACTED 1.00]
- **Local-first Sync SDK Family** — agents_skills_turso_cloud_turso_cloud_go_overview_tursogo, agents_skills_turso_cloud_turso_cloud_js_overview_javascript_sync_sdk, agents_skills_turso_cloud_turso_cloud_py_overview_pyturso_sync, agents_skills_turso_cloud_turso_cloud_rust_overview_turso_sync_crate [EXTRACTED 1.00]
- **Eventual Shared Service Surfaces** — readme_rest_api, readme_authenticated_mcp, readme_typed_server_functions [EXTRACTED 1.00]
- **Eventual Visual System** — design_scrapbook_editorial_style, design_role_based_color_system, design_typography_system, design_accessible_responsive_design [EXTRACTED 1.00]

## Communities (110 total, 44 thin omitted)

### Community 0 - "services/app.ts"
Cohesion: 0.05
Nodes (80): account, accountRelations, activity, activityRelations, apikey, apikeyRelations, expense, expenseRelations (+72 more)

### Community 1 - "activity-line.tsx"
Cohesion: 0.07
Nodes (43): ActivityItem, ActivityLine(), ActivityType, icons, num(), relative, relativeTime(), sentence() (+35 more)

### Community 2 - "schemas/index.ts"
Cohesion: 0.07
Nodes (35): Route, expenseInput, getDashboardFn, getExpenseFn, getGroupPageFn, getInvitationFn, groupInput, Mutation (+27 more)

### Community 3 - "app-shell.tsx"
Cohesion: 0.09
Nodes (15): ACCOUNT_LINKS, AppShell(), InAppShell, useHeaderMotion(), AppDock(), profileActive(), PublicDock(), DropdownMenu() (+7 more)

### Community 4 - "$expenseId.tsx"
Cohesion: 0.12
Nodes (21): Invitee, STEPS, suggestions, Field(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel() (+13 more)

### Community 5 - "combobox.tsx"
Cohesion: 0.10
Nodes (15): Option, ComboboxContent(), ComboboxEmpty(), ComboboxInput(), ComboboxItem(), ComboboxList(), InputGroup(), InputGroupAddon() (+7 more)

### Community 6 - "routeTree.gen.ts"
Cohesion: 0.07
Nodes (29): ApiAuthSplatRoute, ApiSplatRoute, AppGroupsGroupIdExpensesExpenseIdRoute, AppGroupsGroupIdIndexRoute, AppIndexRoute, AppRoute, AppRouteChildren, AppRouteWithChildren (+21 more)

### Community 7 - "biome.json"
Cohesion: 0.07
Nodes (28): source, assist, actions, files, ignoreUnknown, includes, formatter, enabled (+20 more)

### Community 8 - "help/index.tsx"
Cohesion: 0.14
Nodes (21): Parent, clampZoom(), HelpShot(), Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), Breadcrumb() (+13 more)

### Community 9 - "compilerOptions"
Cohesion: 0.08
Nodes (24): DOM, DOM.Iterable, ES2022, **/*.ts, **/*.tsx, vite/client, compilerOptions, allowImportingTsExtensions (+16 more)

### Community 10 - "button.tsx"
Cohesion: 0.18
Nodes (14): useInAppShell(), ErrorLayout(), ErrorScreen(), NotFoundScreen(), PublicHeaderAction, PublicPage(), publicSignedInActions, publicSignedOutActions (+6 more)

### Community 11 - "expense-composer.tsx"
Cohesion: 0.12
Nodes (21): ComposerMember, defaultInputs(), defaultPayer(), ExpenseComposer(), ExpenseDraft, GROUP_STEP, LATER_STEPS, methodHelp (+13 more)

### Community 12 - "build-shortcut.ts"
Cohesion: 0.12
Nodes (23): action(), actions, amount, apiKey, attachment(), auth(), choose(), dictionary() (+15 more)

### Community 13 - "auth-form.tsx"
Cohesion: 0.23
Nodes (14): credentialsSchema, signupSchema, Alert(), AlertDescription(), AlertTitle(), alertVariants, Card(), CardContent() (+6 more)

### Community 14 - "docs.tsx"
Cohesion: 0.14
Nodes (17): assistantBrands, Brand, BrandLogo(), Badge(), badgeVariants, useClientUser(), SITE_URL, Client (+9 more)

### Community 15 - "api-keys.tsx"
Cohesion: 0.15
Nodes (14): ApiKeys(), expiryOptions, formatDate(), isExpired(), CodeBlock(), AlertDialog(), AlertDialogAction(), AlertDialogCancel() (+6 more)

### Community 16 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 17 - "$groupId/index.tsx"
Cohesion: 0.17
Nodes (12): BalanceBar(), Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger(), ActivityTab(), LoaderData (+4 more)

### Community 18 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, check, db:generate, db:migrate, db:pull, db:push, db:seed (+8 more)

### Community 19 - "devDependencies"
Cohesion: 0.13
Nodes (15): @biomejs/biome, devDependencies, @biomejs/biome, @tanstack/router-cli, @types/node, @types/react, @types/react-dom, typescript (+7 more)

### Community 20 - "step-dialog.tsx"
Cohesion: 0.24
Nodes (10): HelpStep, Dialog(), DialogClose(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogTitle() (+2 more)

### Community 21 - "Turso Cloud"
Cohesion: 0.16
Nodes (14): Turso Cloud Features, Turso Cloud, libsql-client-go Remote SDK, tursogo Local-first SDK, @tursodatabase/sync, @tursodatabase/serverless, libsql Python Remote Client, pyturso Local-first Sync (+6 more)

### Community 22 - "Turso Embedded Database"
Cohesion: 0.19
Nodes (14): Page-level Encryption at Rest, BM25 Ranking and Highlighting, Tantivy Full-text Search, Vector Distance Functions, Vector Search, Go SDK tursogo, JavaScript SDK @tursodatabase/database, Python SDK pyturso (+6 more)

### Community 23 - "sheet.tsx"
Cohesion: 0.18
Nodes (10): Sheet(), SheetClose(), SheetContent(), SheetDescription(), SheetHeader(), SheetTitle(), SheetTrigger(), sheetVariants (+2 more)

### Community 24 - "api-keys.ts"
Cohesion: 0.18
Nodes (9): AppBreadcrumb(), EmailVerification(), Route, ApiKeySummary, createApiKeyFn, deleteApiKeyFn, listApiKeysFn, summarize() (+1 more)

### Community 25 - "date-picker.tsx"
Cohesion: 0.23
Nodes (6): buttonVariants, Calendar(), CalendarDayButton(), Popover(), PopoverContent(), PopoverTrigger()

### Community 26 - "Eventual"
Cohesion: 0.17
Nodes (12): Balance and Settlement Engine, Eventual, Expense Lock Rule, Framework-Agnostic Service Layer, Integer-Only Split Engine, Better Auth Integration Guide, Advanced Drizzle Schemas, Drizzle Performance Optimization (+4 more)

### Community 27 - "toggle-group.tsx"
Cohesion: 0.23
Nodes (9): react, react, useComboboxAnchor(), Slider(), ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle() (+1 more)

### Community 28 - "mutateFn"
Cohesion: 0.17
Nodes (12): useComposer(), ComposeButton(), GroupComposer(), looksLikeEmail(), formatShortDate(), ExpenseDetail(), ExpensesTab(), GroupPage() (+4 more)

### Community 29 - "lib/auth.ts"
Cohesion: 0.30
Nodes (6): client, db, env, auth, Route, sendEmail()

### Community 30 - "transactional.tsx"
Cohesion: 0.24
Nodes (7): BaseEmailProps, emailCopy(), EmailKind, formatExpiry(), TransactionalEmail(), urlSegments(), webFonts

### Community 31 - "telemetry.ts"
Cohesion: 0.24
Nodes (9): runInBackground(), WaitUntilRequest, reportError(), AnalyticsEvent, captureEvent(), McpToolName, mcpToolNames, MutationAction (+1 more)

### Community 32 - "shadcn/ui Skill"
Cohesion: 0.18
Nodes (11): shadcn/ui Agent Interface, shadcn CLI Reference, shadcn Customization and Theming, shadcn MCP Server, shadcn Registry Authoring, Base vs Radix, Chat and Messaging Components, Component Composition Rules (+3 more)

### Community 33 - "dependencies"
Cohesion: 0.18
Nodes (11): @base-ui/react, class-variance-authority, dependencies, @base-ui/react, class-variance-authority, react-day-picker, react-email, tw-animate-css (+3 more)

### Community 34 - "header-user.tsx"
Cohesion: 0.25
Nodes (4): Avatar(), AvatarFallback(), AvatarImage(), Skeleton()

### Community 35 - "select.tsx"
Cohesion: 0.18
Nodes (6): Select(), SelectContent(), SelectGroup(), SelectItem(), SelectTrigger(), SelectValue()

### Community 36 - "seed.ts"
Cohesion: 0.18
Nodes (10): credentials, debtorIndex, descriptions, firstShares, groups, methods, now, settlementId (+2 more)

### Community 37 - "FileRoutesByPath"
Cohesion: 0.18
Nodes (11): Route, Route, Route, Route, Route, Route, Route, Route (+3 more)

### Community 38 - "Bidirectional Remote Replication"
Cohesion: 0.22
Nodes (10): Embedded Replicas, CDC Capture Modes, Change Data Capture, CDC Transaction Boundaries, Remote Sync Encryption, Explicit Push/Pull Sync Logic, Partial Sync Bootstrap, Bidirectional Remote Replication (+2 more)

### Community 39 - "cn"
Cohesion: 0.33
Nodes (7): Amount(), EmptyState(), initials(), MemberAvatar(), tintFor(), tints, cn()

### Community 40 - "context.ts"
Cohesion: 0.31
Nodes (8): Database, presentedApiKey(), AuthSession, buildContext(), cookieSessionHeaders(), callerPath(), loginRedirect(), routeContext()

### Community 41 - "Semantic Styling"
Cohesion: 0.25
Nodes (9): Built-in Component Variants, Layout-only className, Semantic Styling, Shared UI Utilities, Accessible Responsive Design, Role-based Color System, Scrapbook Editorial Style, Balance Status Colors (+1 more)

### Community 42 - "package.json"
Cohesion: 0.22
Nodes (8): imports, name, pnpm, onlyBuiltDependencies, private, type, esbuild, lightningcss

### Community 43 - "Better Auth Authentication"
Cohesion: 0.25
Nodes (9): Eventual Apple Shortcut, Resend and React Email Auth Messages, Authenticated MCP Endpoint, Better Auth Authentication, Eventual Expense-sharing App, Multi-currency Accounting, Eventual REST API, Settlement Validation and Allocation (+1 more)

### Community 44 - "app.tsx"
Cohesion: 0.28
Nodes (4): AnalyticsIdentity(), AnalyticsProvider(), analyticsEnabled, Route

### Community 45 - "composer.tsx"
Cohesion: 0.28
Nodes (7): Composer, ComposerContext, ComposerProvider(), Open, ComposerGroup, Spinner(), getComposerFn

### Community 46 - "empty-state.tsx"
Cohesion: 0.42
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 48 - "auth-email.ts"
Cohesion: 0.42
Nodes (7): TransactionalEmailProps, authEmailOptions(), emailKey(), expiryFromNow(), LINK_TTL_SECONDS, SendAuthEmail, fixture()

### Community 49 - "__root.tsx"
Cohesion: 0.33
Nodes (4): AppThemeProvider(), Toaster(), Route, FileRoutesById

### Community 50 - "popup-container.tsx"
Cohesion: 0.33
Nodes (6): Container, hasOpenPopup(), PopupContainer, PopupContainerProvider(), StepDialog(), BalancesTab()

### Community 51 - "reset-password.tsx"
Cohesion: 0.33
Nodes (3): PasswordRecovery(), Route, Route

### Community 52 - "router.tsx"
Cohesion: 0.33
Nodes (5): getRouter(), Register, @tanstack/react-router, Register, routeTree

### Community 53 - "login.tsx"
Cohesion: 0.40
Nodes (3): AuthForm(), Route, Route

### Community 55 - "Scoped JWT Authentication"
Cohesion: 0.50
Nodes (4): Fine-grained Table Permissions, JWKS External Auth Providers, Scoped JWT Authentication, Token Invalidation

### Community 57 - "vercel.json"
Cohesion: 0.50
Nodes (3): buildCommand, $schema, trailingSlash

### Community 58 - "shadcn/ui"
Cohesion: 0.67
Nodes (3): Shadcn Logo, shadcn/ui, shadcn/ui Icon

### Community 59 - "BEGIN CONCURRENT"
Cohesion: 0.67
Nodes (3): BEGIN CONCURRENT, Commit Conflict Retry, MVCC Snapshot Isolation

### Community 60 - "Drizzle Logo"
Cohesion: 1.00
Nodes (3): Drizzle Logo, Four Lime Rounded Diagonal Bars, Drizzle SVG Image

## Knowledge Gaps
- **336 isolated node(s):** `$schema`, `enabled`, `clientKind`, `useIgnoreFile`, `ignoreUnknown` (+331 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **44 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `toggle-group.tsx`, `package.json`, `better-auth`, `@better-auth/api-key`, `@better-auth/drizzle-adapter`, `clsx`, `cn`, `drizzle-kit`, `drizzle-orm`, `@faker-js/faker`, `@libsql/client`, `lucide-react`, `@modelcontextprotocol/sdk`, `next-themes`, `nitro`, `posthog-js`, `posthog-node`, `@posthog/react`, `radix-ui`, `react-dom`, `resend`, `@sentry/tanstackstart-react`, `sonner`, `@t3-oss/env-core`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/match-sorter-utils`, `@tanstack/react-devtools`, `@tanstack/react-form`, `@tanstack/react-router`, `@tanstack/react-router-devtools`, `@tanstack/react-start`, `@tanstack/react-table`, `zod`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `react` connect `toggle-group.tsx` to `dependencies`, `date-picker.tsx`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Why does `ToggleGroupItem()` connect `toggle-group.tsx` to `expense-composer.tsx`, `$expenseId.tsx`, `api-keys.tsx`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **What connects `$schema`, `enabled`, `clientKind` to the rest of the system?**
  _336 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `services/app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.053305879661404716 - nodes in this community are weakly interconnected._
- **Should `activity-line.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07239819004524888 - nodes in this community are weakly interconnected._
- **Should `schemas/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07179487179487179 - nodes in this community are weakly interconnected._