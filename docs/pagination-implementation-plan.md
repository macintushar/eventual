# Pagination implementation plan

## Goal and decisions

### Implementation status — October 3, 2026

Implemented:
- Versioned compact expense and settlement pages at `/api/v2/groups/:groupId/{expenses,settlements}`. V1 list contracts remain available. Operations, generated client, OpenAPI and MCP expose the new reads.
- Validated query-bound cursors, lookahead, timestamp/id activity fixes, and indexes in `drizzle/0006_many_jetstream.sql`. All existing expense sort options now have seek predicates, including nullable categories; payer-name traversal is best-effort across concurrent renames.
- Dedicated group context, financial summary, settings, recurring, invitation and history query keys. Default expense loader preloads the same infinite query used by the UI. Expense details use context/summary; the command palette uses a lightweight directory.
- Near-viewport continuation with guarded requests, Load more/Retry, explicit Refresh history, and retained rows on errors. Multi-page histories are marked stale on mutations without automatic page replay. Existing router scroll restoration remains enabled.
- Closed-composer gating, permanent-error retry policy, affected-group mutation invalidation, and group IDs in record-deletion results.
- Complete SQL balance aggregation with preaggregated allocations; dashboard reuses totals and group summaries derive payment intents from one calculation.
- Request-scoped telemetry: environment/release, handler duration, DB query count/duration, driver-returned row count, returned item count where applicable, and JS balance calculation duration. `db_result_rows` measures returned rows, **not SQLite rows scanned**; concurrent DB durations are summed and may exceed wall time. Auth setup occurs before handler measurements.
- Deterministic local benchmark: `bunx tsx scripts/benchmark-pagination.ts`. Across 100/1,000/10,000 expenses, first and deep list reads use two queries and return 32 DB rows (membership + 31-row lookahead). Summaries return eight aggregate rows in this three-member/two-currency fixture; SQL still scans financial history. These are local in-memory results, not production latency claims.

Validation (October 4): all 73 unit/service tests and 28 Playwright checks pass (one real-auth setup, nine HTTP integration tests, nine UI scenarios each on desktop Chromium and Pixel 7 emulation). TypeScript passes. Coverage includes cursor traversal across sorts/directions, nulls/ties, exact terminal pages, query-bound validation, authorization, SQL financial equivalence, query request budgets, and indexed seeks. Browser coverage now verifies delayed scrolling, retained rows/scroll position, initial-page and continuation retries, keyboard/manual fallback, search/sort resets, refresh, tab histories, detail/back restoration and closed-composer mutation behavior. The live HTTP tests caught and fixed bodyless DELETE requests being misclassified as non-JSON by the Node adapter.

Latest local benchmark (in-memory, run alongside the production build): first/deep expense-page p50 stays below 1 ms at all three sizes; summary p50 grows from 0.62 ms at 100 expenses to 4.13 ms at 1,000 and 37.61 ms at 10,000 (p95 56.80 ms). This confirms bounded list results and reduced summary hydration, not constant-time balance computation or production latency.

Rollout: apply migration 0006 through the normal deployment migration process before shipping the UI. No production migration has been run by this implementation.

Remaining measurement-gated/follow-on work: real-device and non-Chromium verification; 300/1,000-row render profiling and TanStack Virtual if warranted; production Sentry baseline (read credentials required); paginated group directories/reminders/large settings lists and streamed exports. shadcn Pagination is not needed for the implemented scrolling histories. No virtualization package or sliding cache window is enabled yet.

### Running the pre-ship checks

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run test
bunx tsc --noEmit
bun run test:e2e
bun run build
```

`bun run test:integration` runs the authenticated HTTP suite; `bun run test:e2e:ui` runs the desktop/mobile UI suite. Playwright starts its own server on port 3107, creates a fresh temporary SQLite database, applies every migration, and seeds tied timestamps, nullable categories, 96 expenses and 60 activities/payments. Credentials and service tokens are local-only; the developer's database is not used. The test server refuses an already occupied port. Browser tests use real APIs except for deliberately held/failed responses in loading/error scenarios; no fixed sleeps or test retries are used. Tests wait for client hydration before interacting with SSR-rendered controls.

The shared `HistoryContinuation` and `HistoryRefresh` components are exercised inside the real expense, payment and activity screens, including both Retry branches and the IntersectionObserver-free keyboard fallback. HTML results are in `playwright-report/`; failed tests retain screenshots and traces. Auth state and generated artifacts are gitignored.

`.github/workflows/tests.yml` runs type-checking, unit/service tests, production build and the entire Playwright suite on pull requests and main-branch pushes, retaining the HTML report on failure. Branch protection must require the `tests` job to make this a merge gate. Local success does not represent a production or real-device performance measurement.

Make list requests bounded, avoid recalculating financial summaries while scrolling, and keep long histories responsive. Use cursor pagination for expenses, activity and settlements; TanStack Query owns fetched pages; TanStack Virtual can bound rendered rows. Balances remain separate, complete financial summaries.

Scope is based on [API audit](api-pagination-audit.md) and [metrics/query audit](api-current-metrics-query-audit.md). Existing PostHog values mix environments and omit aggregate endpoints; establish a production baseline before claiming improvement.

## 1. Establish measurement and stop unnecessary refreshes

Changes:
- Instrument dashboard, group-page and composer aggregate handlers with environment/release, total duration, DB duration/query count, returned row counts and balance-calculation duration. Distinguish handler time from client request duration; avoid financial content in telemetry.
- Gate composer query by visible state as well as expense mode.
- Replace broad mutation invalidation with an action/resource dependency map. Financial writes refresh affected balances, lists, detail and activity; group/member changes refresh selectors; category/reminder configuration does not refresh unrelated financial history.
- Resolve affected group IDs for record-ID-only mutations. Invalidate both old/new groups where a supported operation changes ownership.
- Skip retries for permanent HTTP failures. Retain limited transient retries.
- Correct loader freshness comments; choose await-fresh vs cached/background refresh deliberately.

Acceptance: a closed composer makes zero requests on focus or unrelated mutation; cached revisits within staleTime issue no list request; invalidation targets affected resources. Capture cold/warm baselines at 100, 1,000 and 10,000 expenses with realistic share counts.

## 2. Fix and standardize the cursor API

Contract: `{ items, nextCursor }`, default limit 30, maximum 100, `limit + 1` lookahead, no per-page total count. Cursor comes from the last returned row. Authorize and filter in SQL before limiting.

Implement in shared schemas/services:
- Group activity: fix incorrect ID-only predicate to match `(createdAt DESC, id DESC)`.
- Personal activity: retain recipient timestamp/ID ordering; add lookahead.
- Settlements: introduce `(createdAt DESC, id DESC)` pagination and compact party DTOs.
- Expenses: preserve `(date DESC, createdAt DESC, id DESC)` and extend the cursor contract for filter/sort validation.

Cursor encodes version, ordered values and filter/sort identity. Validate types, timestamp precision and length; reject reuse with a different group/filter/sort. Do not treat the cursor as authorization. Preserve actual stored timestamp precision.

Add candidate composite indexes: expense(group,date,createdAt,id), activity(group,createdAt,id), activityRecipient(user,createdAt,activityId), settlement(group,createdAt,id), expenseShare(expenseId,userId). Verify generated SQL with EXPLAIN QUERY PLAN and realistic data before adding more indexes.

List DTOs expose displayed fields only. Calculate locked status with a paid-share EXISTS lookup; details/expanded rows fetch participants or allocations separately as required by consumers.

Compatibility: keep legacy offset/sort behavior while new UI rolls out; replacing settlement arrays with envelopes or slimming public DTOs needs an explicit versioned route/contract. Update operations, OpenAPI, generated client, web wrappers, MCP and shortcuts together. Never silently truncate old consumers.

Acceptance: no missing/duplicate IDs on unchanged data with timestamp ties; exact terminal detection; malformed/mismatched cursors rejected; authorized boundaries retained; deep default-order pages use the intended index and do not skip an offset prefix.

## 3. Separate page context, lists and financial summaries

Introduce a compact group-context query (group, caller role, members where needed), dedicated expense/activity/settlement queries and a financial-summary query. Load settings lists only when their tab opens.

- Remove expense/activity first pages from the group aggregate once dedicated queries own them. Route loaders preload those same query options; components reuse them. During transition, seed matching list keys with parent dataUpdatedAt, avoiding two independent refresh owners.
- Calculate balances once per group-summary request and derive payment intents from that result.
- Share dashboard balance inputs/results initially; split group directory/card pages from global cross-group summary.
- Expense detail consumes compact context and required summary instead of every group tab's data. Command palette uses a lightweight group directory, shared with composer where shapes match.

Suggested keys:
```ts
["group", groupId, "context"]
["group", groupId, "financial-summary"]
["group", groupId, "expenses", { filters, sort }]
["group", groupId, "settlements", { filters }]
["group", groupId, "activity"]
["activity", "mine"]
["groups", "directory", { search, sort }]
```
Cursor is pageParam, not part of an infinite-query key. Every input affecting results belongs in the key; page size belongs there if configurable. Preserve account-cache clearing and request-scoped SSR QueryClients.

Acceptance: loading another history page makes one list request and zero balance/context requests. Loading group financial summary calculates balances once. Settings data is not fetched on initial expense-tab navigation.

## 4. Deliver cursor scrolling

Use infiniteQueryOptions/useInfiniteQuery with shared loader options, AbortSignal, initialPageParam and nextCursor continuation. Start with date-sorted expenses and both activity feeds, then settlements.

- Trigger the next page around one viewport ahead, with hasNextPage and !isFetching guards. Keep Load more for keyboard access and Retry after failures; stop automatic retry loops.
- Append stable-ID rows, preserve loaded content during fetch/error, reserve footer height and restore position on detail/back navigation.
- Reset traversal on filter/sort changes; preserve existing manual-search UX or explicitly introduce debounce if adopting search-as-you-type.
- Show an updates/refresh affordance rather than inserting new records above someone browsing old history.
- Keep exports independent of loaded UI pages.

Custom sorting follows separately: implement seek predicates matching primary direction, null rank, date and all tie breakers. Payer names are mutable joined values; either support a documented best-effort traversal or retain a bounded legacy paged mode until its cursor path is ready. Never silently drop existing sort options.

Concurrent edits/deletes can change ordered results: a creation boundary is not a database snapshot. Define normal browsing as a stable loaded view with explicit refresh; exact export snapshots require separate semantics.

Acceptance: slow-network append does not replace existing rows; failure retains scroll and allows retry; sorting applies across the full server result, not just loaded rows; navigation restores position; no overlapping next-page fetches.

## 5. Add TanStack Virtual for long histories

Recommended for continuously growing expense, activity and settlement lists when profiling shows rendering cost. It renders a viewport-sized subset with overscan while Query still holds fetched data. It reduces DOM/render work, not DB scans or query-cache memory.

Integrate stable item keys, measured variable heights, overscan and a loader/footer row. Use the actual scrolling surface (window vs container), preserve headers/column sizing, and test mobile wrapping, focus and table/list semantics. Handle navigation restoration when required pages have not yet loaded: retain cached pages or load enough before restoring the anchor.

Profile 300 and 1,000 loaded rows to decide activation; these are evaluation scenarios, not fixed universal thresholds. Rendered row count should stay proportional to viewport/overscan rather than loaded history. Avoid introducing another nested scroll region merely to fit the library.

Do not add maxPages blindly: eviction alters available rows/list height. If retained-page memory/refetch costs matter, add backward cursors and anchor compensation before a sliding page window. Until then narrow invalidation and tune feed focus freshness; virtualization alone does not solve sequential refetch cost.

## 6. Reduce financial calculation cost and cover remaining lists

Replace hydrated histories with SQL aggregates per group/user/currency, preserving unpaid-share accounting and settlement unallocated remainder. Preaggregate settlement allocations to avoid join multiplication. Simplify complete per-group balances before extracting caller transfers.

Compare results against the existing calculator on multi-currency, paid-share, partial allocation, delete, merge and recurring scenarios. Maintain zero-sum and deterministic transfer behavior. SQL aggregation still scans history; introduce a transactional balance projection only if measurements justify it, with old/new deltas, backfill and reconciliation. Financial write validation stays authoritative and transactional.

Next: page group metadata before reading summaries for those groups, add reminder continuation plus indexed group filtering, and page large invitation/template/member directories. Do not page away participants required for calculation or category rules required for matching. Stream/chunk CSV exports; background large PDF generation.

## Where shadcn Pagination fits

Use it as presentation for deliberate Previous/Next navigation on settings/admin/history tables where people want bounded pages. A cursor stack can support visited previous pages without offsets. It does not implement API pagination, query caching or virtualization.

Avoid numbered last-page/jump-to-page controls on the default infinite history UX: cursor traversal does not provide arbitrary page access or total pages. If product requirements need that, define a separate indexed/offset or snapshot mode and optional count, with explicit performance tradeoffs. Adapt its default anchors to TanStack Router links for navigable URLs, or buttons for local query-state actions; represent disabled/loading states correctly.

Default decision: Virtual for long scrolling histories; existing Load more/retry controls for continuation; shadcn Pagination optional for bounded settings/table navigation. Do not install either package merely to make server pagination work.

## Rollout and completion criteria

Ship each stage independently: measurement/cache cleanup → cursor correctness/indexes → separated query ownership → scrolling → measured virtualization → aggregate calculations/remaining lists. Keep old contracts during migration; roll out new reads/UI behind a reversible switch if needed. Index deployment precedes reliance on new query plans.

Check p50/p95, request counts per interaction, DB rows read, bytes, calculation time, render time and first/next-page experience in the same environment. A first default list page should have bounded hydration; deeper indexed cursor pages should not grow work with page offset. Do not promise exact latency gains from the current mixed, small sample.

Required regression coverage: tie timestamps, cursor validation, changed permissions, exact final pages, custom null/mixed ordering, filter resets, insert/edit/delete behavior, financial equivalence, closed composer, mutation request budgets, slow/error scrolling, keyboard/screen-reader behavior and back restoration. Acquire read-capable Sentry CLI access before completing the production tracing baseline.

Sources:
- https://tanstack.com/virtual/latest/docs/introduction
- https://ui.shadcn.com/docs/components/base/pagination
- https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
