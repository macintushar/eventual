# API pagination and calculation audit

Audited 2026-10-03 against current source. This is a static code audit, not a production benchmark. The existing graph was used for discovery; findings were checked against source. No application behavior was changed.

## Main finding

Pagination bounds list work, but the largest visible bottleneck is repeated full-history balance computation. Fix duplicate reads and balance aggregation alongside pagination; otherwise a 30-row expense page still waits for every historical expense, share, settlement and allocation.

## Findings and priorities

| Priority | Surface | Current behavior | Recommended change |
| --- | --- | --- | --- |
| P0 | Group activity `/v1/groups/:groupId/activity` | Filters cursor by `id < cursor`, but sorts by `createdAt DESC, id DESC`. IDs are random UUIDs. Can skip or repeat activities. | Use a validated `(createdAt, id)` cursor and matching predicate; fetch `limit + 1`. |
| P1 | Dashboard `/v1/app/dashboard` | `listGroups` and `getCrossGroupBalances` independently read all groups, members, expenses/shares and settlements/allocations. | Share one request-scoped balance input/result; eventually use aggregate balances. Split group list from global summary. |
| P1 | Group page `/v1/app/groups/:groupId/page` | Loads expenses, balances, settlements, activities, payment intents, recurring templates, reminders, category rules and invitations upfront. Payment intents call `getBalances` again. | Compute balances once and derive payment intents from the same result. Load tab-specific lists on demand. Reuse authorized membership and member data within this request. |
| P1 | Expenses `/v1/groups/:groupId/expenses` | Already supports correct default keyset pagination, and separate offset/sort pagination. UI selects the offset path. Relations include full payer and share user records. Only group ID is indexed for expense access. | Switch scrolling to keyset pagination, add composite ordering index, return a compact list DTO and fetch detail separately. |
| P1 | Settlements `/v1/groups/:groupId/settlements` | Unbounded, includes full from/to user relations and every allocation; sorts only by timestamp. | Page by `(createdAt DESC, id DESC)`, compact party summaries; allocations on detail/expansion. Keep balance calculations independent of this paginated history. |
| P2 | Personal activity `/v1/me/activity` | Correct `(recipient.createdAt, activityId)` cursor; bounded page and batched metadata name lookup. Uses exactly `limit`, so full terminal pages advertise an extra empty request. | Fetch `limit + 1`, enrich only returned rows; extend index to include activity ID. Add scroll-triggered loading to existing infinite query. |
| P2 | Groups `/v1/groups` | Unbounded group list with balances calculated from full history of all returned groups. | Page group metadata first, then read balance summaries for only those group IDs. `(normalizedName, id)` for alphabetic order, or immutable `(createdAt, id)` for more stable traversal. |
| P2 | Reminders `/v1/groups/:groupId/reminders` | Hard limit of 100, no continuation; filters group ID out of JSON payload and sorts by due date. | Add `(dueAt DESC, id DESC)` paging and a real indexed group ID column or matching expression index. Separate pending reminders from completed history. |
| P3 | Invitations, recurring templates, member directory | Unbounded; pending invitations already filter status. Recurring templates have no explicit ordering. | Add pagination when these grow: invitations `(createdAt, id)`, recurring `(nextRunAt, id)`, directory `(normalizedName, id)`. Add group/status indexes where applicable. |
| P3 | Composer `/v1/app/composer` | Efficient two-query batch, but loads every active group and all their members. | Search/page lightweight group options; fetch participants after group selection. Preserve full participant input for split calculation. |
| Separate | Expense reports | Reads all matching rows, generates complete CSV/PDF in memory, returns content inside JSON (PDF as base64). | Chunk/stream CSV through a download endpoint; use a background job for large PDF exports. Avoid truncating a report to a UI page. |

API key lists can be bounded later if usage warrants it. Category rule management can be paginated, but category matching must still consider all applicable rules. Single-record reads, previews, balance results and financial validation should not calculate from a paginated subset.

## Cursor contract

Use `{ items, nextCursor }`, default 30 and hard maximum 100. Do not run `COUNT(*)` on every page; use `limit + 1` to detect continuation. Apply authorization and filters in SQL before limiting. Use the last returned row, not the extra row, to form the cursor.

For descending activity/settlement pages:

```sql
WHERE organization_id = :groupId
  AND (created_at < :at OR (created_at = :at AND id < :id))
ORDER BY created_at DESC, id DESC
LIMIT :limitPlusOne;
```

Cursor timestamps must use the stored column precision: activity uses seconds; recipient timestamps use milliseconds. A unique tie breaker is required even when timestamps have milliseconds.

Expense default ordering already has three components `(date, createdAt, id)`; retain all three. Extend the cursor to include version, sort/direction, filter fingerprint and first-page boundary if needed. Validate decoded types and lengths, reject a cursor reused with different filters or sorting. A cursor never replaces membership authorization.

For custom expense sorting, the seek predicate must mirror every ordering component: primary sort value, optional date, createdAt and ID, plus the explicit null rank for category. Ascending primary order still has descending tie breakers in the current code. Do not apply a simple all-descending tuple comparison. Payer sorting depends on mutable joined names; implement it separately after the default date path.

The current offset `asOf` only excludes records created after the first page boundary. It does not freeze deletes, edits, participant changes or payer renames, and second-resolution expense creation timestamps weaken an exact millisecond cutoff. Keyset traversal also cannot guarantee an immutable view of editable sort keys. For normal UI browsing, preserve the loaded view and offer “new updates”; an exact export snapshot needs stronger snapshot/version semantics.

## Database indexes and payloads

Start with these candidate indexes, verify with generated SQL and `EXPLAIN QUERY PLAN`, then benchmark before adding indexes for every sort/filter:

```text
expense(organization_id, date, created_at, id)
activity(organization_id, created_at, id)
activity_recipient(user_id, created_at, activity_id)
settlement(organization_id, created_at, id)
expense_share(expense_id, user_id)
expense_template(organization_id, next_run_at, id)
```

Expense participant filtering is an `EXISTS` subquery; the composite share index helps that lookup. Existing share/settlement-allocation foreign-key indexes remain relevant. Equality filters such as currency/category may justify additional indexes based on actual usage. `lower(description)`, `lower(category)` and joined payer-name ordering need matching expression/join strategies. Contains search (`LIKE '%term%'`) needs a separate search plan; ordinary prefix indexes will not solve it, and FTS changes matching semantics.

List expenses should return only displayed fields, payer ID/name, and a SQL `EXISTS` paid-share flag for `locked`; participants can be fetched on expansion/detail if needed. Loading every share and full user object merely to calculate `locked` amplifies work with group size. Review DTOs before dropping fields needed by other API/MCP consumers.

Matching composite indexes allow SQLite to satisfy filtering and ordering without an independent large sort where the planner can use them: https://www.sqlite.org/queryplanner.html

## Reduce balance calculation cost

1. Reuse one balance calculation within group page; reuse one batch within dashboard. This removes one duplicate history read/calculation set in each flow, though it does not imply a 50% overall latency improvement.
2. Replace full relation hydration with SQL aggregates grouped by group/user/currency. For each unpaid non-self share, credit the payer and debit the participant. For each settlement, credit the sender and debit the recipient by `amountMinor - SUM(allocation.amountMinor)`. Preaggregate allocations per settlement before joining so shares/allocations do not multiply amounts. Retain currencies with history even when all balances are zero, and preserve current member and deterministic transfer semantics.
3. Run existing simplification on the small aggregate member-balance result. Cross-group balances must still simplify each complete group before selecting caller-related transfers; a caller's net position alone cannot reconstruct the current counterparties.
4. If aggregate scans remain expensive, maintain a transactional `(groupId, userId, currency)` balance projection. Apply old/new contribution deltas for creates, updates, deletes, paid/unpaid shares, settlement allocations, recurring materialization and guest merges. Backfill, reconcile against the current calculator, and version each group's financial state. Financial writes and validation must read authoritative state in the same transaction; do not rely on a stale UI cache.

SQL aggregation initially reduces bytes, object creation and application CPU, but still visits historical rows. A maintained projection is what makes repeated reads independent of history length. Avoid converting currencies or changing allocation accounting during this work.

## Smooth scrolling and bounded client work

- Use `useInfiniteQuery` for expenses and both activity feeds, keyed by group, filters and sort. Reuse first-page loader data and its freshness timestamp. Reset cursor traversal on search/sort changes; debounce search and keep existing abort-signal propagation.
- Fetch when a sentinel is roughly one viewport ahead, guarded by `hasNextPage && !isFetching`; retain the Load more button for keyboard access and retries. Keep loaded rows visible when the next request fails and stop automatic retry loops until user retry.
- Append by stable ID, reserve footer/skeleton height and preserve scroll position on detail/back navigation. Avoid inserting fresh records above the viewport while someone browses history; show a refresh affordance.
- Introduce virtualization when measured DOM/render cost warrants it, with measured heights, overscan and accessible table/list behavior. Network pagination alone does not bound the accumulated DOM.
- Narrow `invalidateForMutation`: current writes broadly invalidate dashboard, composer, activity and group reads, including unrelated changes. Return affected group IDs for expense/settlement operations that only take record IDs. Update small cached rows directly when safe; invalidate financial summaries on financial writes.
- Infinite-query refetches can replay every retained page sequentially. Choose freshness/refetch behavior deliberately. `maxPages` can bound memory/refetch work, but dropping pages changes list height: implement backward loading and scroll anchoring before eviction. Do not apply it blindly to a forward-only feed.

TanStack references: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries and https://tanstack.com/query/latest/docs/framework/react/reference/functions/useInfiniteQuery

## Delivery and verification

1. Fix group activity cursor correctness and lookahead; add indexes verified against real query plans.
2. Remove duplicate balance work and slim expense/settlement DTOs; split group tab loading.
3. Add settlement/group pagination; move the default expense UI to cursor scrolling, then implement custom sort cursors.
4. Replace balance hydration with verified aggregates; introduce a transactional projection only if measurements justify it.
5. Add reminder continuation/indexing and large-export jobs.

Update shared operation schemas, OpenAPI, generated API client, web wrappers, MCP behavior and UI consumers together. Replacing array responses with page envelopes is a breaking API change: version it or introduce an explicit transitional paginated mode. Existing shortcuts need either search selection or explicit iteration, never silently just the first page.

Measure p50/p95 endpoint and balance-calculation time, DB statements/rows read, response bytes, first-content time, next-page latency and scroll render time. Existing operation duration telemetry is useful but does not isolate database and calculation costs or all aggregate web routes. Benchmark first and deep pages at increasing expense/group/share counts, with realistic filters and sorts.

Test timestamp ties, final full pages, malformed cursors, permission changes, filter/sort resets and concurrent insert/edit/delete behavior. Compare aggregate/projected balances with the existing domain calculator across multiple currencies, paid shares, partial/full allocations, deletes, guest merges and recurring writes; retain the zero-sum invariant. Verify slow-network scrolling, failed next-page retry, keyboard loading and navigation restoration.

No production timings or query-plan claims were measured during this audit.
